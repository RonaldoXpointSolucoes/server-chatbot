package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	_ "github.com/mattn/go-sqlite3"
	"github.com/skip2/go-qrcode"
	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

type Instance struct {
	ID        string            `json:"id"`
	Client    *whatsmeow.Client `json:"-"`
	QRChan    <-chan whatsmeow.QRChannelItem
	QRCode    string            `json:"qrCode,omitempty"`
	Status    string            `json:"status"` // "disconnected", "qr", "connected"
	Phone     string            `json:"phone,omitempty"`
	CreatedAt time.Time         `json:"createdAt"`
}

type InstanceManager struct {
	sync.RWMutex
	container *sqlstore.Container
	instances map[string]*Instance
	webhook   string
}

var manager *InstanceManager

func NewInstanceManager(ctx context.Context, dbPath, webhookURL string) (*InstanceManager, error) {
	dbLog := waLog.Stdout("Database", "WARN", true)
	container, err := sqlstore.New(ctx, "sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on&_busy_timeout=30000", dbPath), dbLog)
	if err != nil {
		return nil, err
	}

	return &InstanceManager{
		container: container,
		instances: make(map[string]*Instance),
		webhook:   webhookURL,
	}, nil
}

func (m *InstanceManager) dispatchWebhook(eventType string, data interface{}) {
	if m.webhook == "" {
		return
	}
	payload := map[string]interface{}{
		"event":     eventType,
		"timestamp": time.Now().Format(time.RFC3339),
		"data":      data,
	}
	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return
	}

	go func() {
		client := &http.Client{Timeout: 8 * time.Second}
		resp, err := client.Post(m.webhook, "application/json", bytes.NewBuffer(jsonBody))
		if err != nil {
			log.Printf("[Webhook Error] Falha ao enviar evento %s: %v", eventType, err)
			return
		}
		defer resp.Body.Close()
	}()
}

func (m *InstanceManager) eventHandler(inst *Instance) func(evt interface{}) {
	return func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Message:
			msgText := v.Message.GetConversation()
			if msgText == "" && v.Message.GetExtendedTextMessage() != nil {
				msgText = v.Message.GetExtendedTextMessage().GetText()
			}

			payload := map[string]interface{}{
				"instanceId":   inst.ID,
				"messageId":    v.Info.ID,
				"sender":       v.Info.Sender.User,
				"senderJid":    v.Info.Sender.String(),
				"chatJid":      v.Info.Chat.String(),
				"fromMe":       v.Info.IsFromMe,
				"timestamp":    v.Info.Timestamp.Format(time.RFC3339),
				"text":         msgText,
				"pushName":     v.Info.PushName,
				"isGroup":      v.Info.IsGroup,
			}
			log.Printf("[Whatsmeow Msg] Instância %s | De: %s | Texto: %s", inst.ID, v.Info.Sender.User, msgText)
			m.dispatchWebhook("message.upsert", payload)

		case *events.Connected:
			inst.Status = "connected"
			inst.QRCode = ""
			if inst.Client.Store.ID != nil {
				inst.Phone = inst.Client.Store.ID.User
			}
			log.Printf("[Whatsmeow Status] Instância %s CONECTADA (%s)", inst.ID, inst.Phone)
			m.dispatchWebhook("instance.connected", map[string]interface{}{
				"instanceId": inst.ID,
				"phone":      inst.Phone,
				"status":     inst.Status,
			})

		case *events.LoggedOut:
			inst.Status = "disconnected"
			inst.Phone = ""
			inst.QRCode = ""
			log.Printf("[Whatsmeow Status] Instância %s DESCONECTADA", inst.ID)
			m.dispatchWebhook("instance.disconnected", map[string]interface{}{
				"instanceId": inst.ID,
				"status":     inst.Status,
			})
		}
	}
}

func (m *InstanceManager) GetOrCreate(ctx context.Context, id string) (*Instance, error) {
	m.Lock()
	defer m.Unlock()

	if inst, exists := m.instances[id]; exists {
		return inst, nil
	}

	deviceStore, err := m.container.GetFirstDevice(ctx)
	if err != nil {
		return nil, err
	}

	clientLog := waLog.Stdout("Client", "INFO", true)
	client := whatsmeow.NewClient(deviceStore, clientLog)

	inst := &Instance{
		ID:        id,
		Client:    client,
		Status:    "disconnected",
		CreatedAt: time.Now(),
	}

	client.AddEventHandler(m.eventHandler(inst))

	if client.Store.ID == nil {
		// Não pareado, inicia canal de QR
		qrChan, err := client.GetQRChannel(ctx)
		if err != nil {
			return nil, err
		}
		inst.QRChan = qrChan
		inst.Status = "qr"

		err = client.Connect()
		if err != nil {
			return nil, err
		}

		go func() {
			for evt := range qrChan {
				if evt.Event == "code" {
					inst.Status = "qr"
					var png []byte
					png, _ = qrcode.Encode(evt.Code, qrcode.Medium, 256)
					inst.QRCode = "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
					log.Printf("[Whatsmeow QR] Novo QR gerado para %s", inst.ID)
					m.dispatchWebhook("instance.qrcode", map[string]interface{}{
						"instanceId": inst.ID,
						"qrCode":     inst.QRCode,
					})
				} else if evt.Event == "success" {
					inst.Status = "connected"
					inst.QRCode = ""
					log.Printf("[Whatsmeow QR] Pareamento aprovado para %s", inst.ID)
				}
			}
		}()
	} else {
		inst.Status = "connecting"
		err = client.Connect()
		if err != nil {
			return nil, err
		}
	}

	m.instances[id] = inst
	return inst, nil
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./sessions.db"
	}
	webhookURL := os.Getenv("WEBHOOK_URL")
	if webhookURL == "" {
		webhookURL = "http://179.199.142.157:8083/webhooks/whatsapp"
	}

	var err error
	manager, err = NewInstanceManager(context.Background(), dbPath, webhookURL)
	if err != nil {
		log.Fatalf("Falha ao inicializar o store Whatsmeow: %v", err)
	}

	app := fiber.New(fiber.Config{
		AppName: "ChatBoot Whatsmeow Engine v8.0",
	})

	app.Use(cors.New())
	app.Use(logger.New())

	// Healthcheck
	app.Get("/health", func(c *fiber.Ctx) error {
		manager.RLock()
		total := len(manager.instances)
		manager.RUnlock()
		return c.JSON(fiber.Map{
			"status":    "healthy",
			"engine":    "tulir/whatsmeow (Go)",
			"timestamp": time.Now().Format(time.RFC3339),
			"instances": total,
		})
	})

	// Instâncias
	app.Post("/instances/create", func(c *fiber.Ctx) error {
		type Request struct {
			ID string `json:"id"`
		}
		var req Request
		if err := c.BodyParser(&req); err != nil || req.ID == "" {
			req.ID = "default"
		}

		inst, err := manager.GetOrCreate(c.Context(), req.ID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		return c.JSON(fiber.Map{
			"id":        inst.ID,
			"status":    inst.Status,
			"qrCode":    inst.QRCode,
			"phone":     inst.Phone,
			"createdAt": inst.CreatedAt,
		})
	})

	app.Get("/instances/:id/status", func(c *fiber.Ctx) error {
		id := c.Params("id")
		manager.RLock()
		inst, exists := manager.instances[id]
		manager.RUnlock()

		if !exists {
			return c.Status(404).JSON(fiber.Map{"error": "Instância não encontrada"})
		}

		return c.JSON(fiber.Map{
			"id":     inst.ID,
			"status": inst.Status,
			"phone":  inst.Phone,
			"qrCode": inst.QRCode,
		})
	})

	app.Get("/instances/:id/qr", func(c *fiber.Ctx) error {
		id := c.Params("id")
		manager.RLock()
		inst, exists := manager.instances[id]
		manager.RUnlock()

		if !exists {
			return c.Status(404).JSON(fiber.Map{"error": "Instância não encontrada"})
		}

		return c.JSON(fiber.Map{
			"id":     inst.ID,
			"status": inst.Status,
			"qrCode": inst.QRCode,
		})
	})

	app.Post("/instances/:id/send-text", func(c *fiber.Ctx) error {
		id := c.Params("id")
		manager.RLock()
		inst, exists := manager.instances[id]
		manager.RUnlock()

		if !exists {
			return c.Status(404).JSON(fiber.Map{"error": "Instância não encontrada"})
		}

		type SendReq struct {
			To   string `json:"to"`
			Text string `json:"text"`
		}
		var req SendReq
		if err := c.BodyParser(&req); err != nil || req.To == "" || req.Text == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Parâmetros 'to' e 'text' são obrigatórios"})
		}

		// Tratar número e JID
		cleanNum := strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(req.To, "+", ""), "-", ""), " ", "")
		if !strings.Contains(cleanNum, "@") {
			cleanNum = cleanNum + "@s.whatsapp.net"
		}
		recipient, err := types.ParseJID(cleanNum)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "JID inválido: " + err.Error()})
		}

		msg := &waProto.Message{
			Conversation: proto.String(req.Text),
		}

		resp, err := inst.Client.SendMessage(c.Context(), recipient, msg)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Falha ao enviar mensagem: " + err.Error()})
		}

		return c.JSON(fiber.Map{
			"success":   true,
			"messageId": resp.ID,
			"timestamp": resp.Timestamp.Format(time.RFC3339),
		})
	})

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("Desligando Whatsmeow Engine...")
		app.Shutdown()
		os.Exit(0)
	}()

	log.Printf("Whatsmeow Engine rodando na porta %s (DB: %s)...", port, dbPath)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Erro no servidor Fiber: %v", err)
	}
}
