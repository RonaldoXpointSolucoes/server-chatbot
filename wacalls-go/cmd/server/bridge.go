package main

import (
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"wacalls/internal/voip/media"

	"github.com/pion/webrtc/v4"
)

// pcmChannelLabel is the data channel the browser opens to carry raw 16 kHz mono
// Int16 LE PCM in both directions. The browser side must create it with this label.
const pcmChannelLabel = "pcm"

// Bridge is the browser-leg adapter: it carries raw PCM between the browser and
// the CallManager over a WebRTC data channel. The call core only ever sees
// []float32 PCM, so it stays unaware of the transport (no Opus here anymore).
type Bridge struct {
	pc  *webrtc.PeerConnection
	dc  atomic.Pointer[webrtc.DataChannel]
	log *slog.Logger

	// OnBrowserPCM is invoked with decoded 16 kHz mono PCM captured from the browser mic.
	OnBrowserPCM func(pcm []float32)
	// OnTerminalICE fires when the peer connection fails or closes.
	OnTerminalICE func()
}

func NewBridge(offerSDP string, log *slog.Logger) (*Bridge, string, error) {
	settingEngine := webrtc.SettingEngine{}
	if resolvedPublicIP != "" {
		settingEngine.SetNAT1ExternalIPs([]string{resolvedPublicIP}, webrtc.ICECandidateTypeHost)
	}
	api := webrtc.NewAPI(webrtc.WithSettingEngine(settingEngine))

	pc, err := api.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{
					"stun:stun.l.google.com:19302",
					"stun:stun1.l.google.com:19302",
				},
			},
		},
	})
	if err != nil {
		return nil, "", err
	}
	br := &Bridge{pc: pc, log: log}

	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		if dc.Label() != pcmChannelLabel {
			return
		}
		br.dc.Store(dc)
		dc.OnMessage(func(msg webrtc.DataChannelMessage) {
			if cb := br.OnBrowserPCM; cb != nil && len(msg.Data) > 0 {
				cb(media.PCMInt16LEToFloat32(msg.Data))
			}
		})
	})

	pc.OnICEConnectionStateChange(func(s webrtc.ICEConnectionState) {
		log.Info("browser ice state change", "state", s.String())
		if s == webrtc.ICEConnectionStateFailed || s == webrtc.ICEConnectionStateClosed {
			if br.OnTerminalICE != nil {
				br.OnTerminalICE()
			}
		}
	})

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: offerSDP}); err != nil {
		pc.Close()
		return nil, "", err
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		pc.Close()
		return nil, "", err
	}
	gatherComplete := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(answer); err != nil {
		pc.Close()
		return nil, "", err
	}
	<-gatherComplete

	return br, pc.LocalDescription().SDP, nil
}

// WritePCM sends 16 kHz mono float32 PCM to the browser as Int16 LE over the data
// channel. It is a no-op until the channel is open.
func (b *Bridge) WritePCM(pcm []float32) error {
	dc := b.dc.Load()
	if dc == nil || len(pcm) == 0 {
		return nil
	}
	return dc.Send(media.PCMFloat32ToInt16LE(pcm))
}

func (b *Bridge) Close() {
	if b.pc != nil {
		_ = b.pc.Close()
	}
}

var resolvedPublicIP string

func resolvePublicIP(log *slog.Logger) {
	go func() {
		// Tenta múltiplos endpoints conhecidos para robustez
		endpoints := []string{
			"https://api.ipify.org",
			"https://ifconfig.me/ip",
			"https://ident.me",
			"https://icanhazip.com",
		}
		for _, url := range endpoints {
			client := http.Client{Timeout: 5 * time.Second}
			resp, err := client.Get(url)
			if err == nil {
				defer resp.Body.Close()
				body, err := io.ReadAll(resp.Body)
				if err == nil {
					ip := strings.TrimSpace(string(body))
					if len(ip) >= 7 && len(ip) <= 15 {
						resolvedPublicIP = ip
						log.Info("resolved server public IP for WebRTC NAT 1:1 mapping", "ip", ip)
						return
					}
				}
			}
			time.Sleep(1 * time.Second)
		}
		log.Warn("could not resolve server public IP dynamically; WebRTC will fallback to local candidate interfaces")
	}()
}
