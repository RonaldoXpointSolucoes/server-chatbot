import React from 'react';
import { Copy, ExternalLink, Network, Rocket, Smartphone } from 'lucide-react';
import { useDevStore } from '../../store/devStore';
import { DevLoggerModalShell } from './DevLoggerModalShell';

const FALLBACK_BAILEYS_HISTORY = [
  {
    tag: 'v7.0.0-rc14',
    version: '7.0.0-rc14',
    name: 'v7.0.0-rc14 (Latest)',
    date: '2026-08-01',
    isLatest: true,
    isCurrent: true,
    commit: '7e7b075',
    highlights: [
      'fix: advertise WIN_HYBRID instead of retired WIN32 web sub-platform (substitui WIN32 aposentado pela Meta por WIN_HYBRID)',
      'ci: pin npm to 11.x, last line that still runs on node 20',
      'example: fix logging of contact upserts',
      'WAProto: perf: optimize history sync memory and CPU usage (#2333)',
      'Resiliência aprimorada no processamento de lotes de mensagens e Bad MAC retry'
    ]
  },
  {
    tag: 'v6.7.24',
    version: '6.7.24',
    name: 'v6.7.24 (2026-07-29)',
    date: '2026-07-29',
    isLatest: false,
    isCurrent: false,
    commit: 'e062994',
    highlights: [
      'Reverts: Revert "chore(release): v6.7.24 (c7a17f5)"',
      'Estabilização de sinalização de chamadas de voz e vídeo (WaCalls)',
      'Suporte a vCards interativos e múltiplos contatos (ContactMessage)',
      'Tratamento aprimorado de tokens de segurança E2E (tctoken)'
    ]
  },
  {
    tag: 'v7.0.0-rc.12',
    version: '7.0.0-rc.12',
    name: 'v7.0.0-rc.12',
    date: '2026-07-20',
    isLatest: false,
    isCurrent: false,
    commit: 'a12b34c',
    highlights: [
      'feat: Add support for pastParticipants in history sync (#2426)',
      'Novo compilador estático Protobuf (WAProto/GenerateStatics.sh)',
      'Otimização de memória RAM para instâncias multi-tenant'
    ]
  },
  {
    tag: 'v6.7.21',
    version: '6.7.21',
    name: 'v6.7.21',
    date: '2026-07-10',
    isLatest: false,
    isCurrent: false,
    commit: 'f98e721',
    highlights: [
      'Correções de heartbeat e presenciais (composing/recording)',
      'Mitigação de desconexões 408 (QR Code timeout)'
    ]
  }
];

interface DevLoggerMetaModalsProps {
  serverMeta: any;
  engineUrl: string;
  showBaileysModal: boolean;
  onCloseBaileysModal: () => void;
  showChangelog: boolean;
  onCloseChangelog: () => void;
  showEndpoints: boolean;
  onCloseEndpoints: () => void;
  onCopyText: (text: string, label: string) => void;
}

const openReleaseMindMap = () => {
  if ((window as any).__openReleaseNotesHub) {
    (window as any).__openReleaseNotesHub('mindmap', true);
  } else {
    window.dispatchEvent(new CustomEvent('open-release-notes-hub', { detail: { tab: 'mindmap', expand: true } }));
  }
};

/**
 * Modais de Metadados do Cockpit: Histórico Baileys GitHub, Novidades (Changelog) e Root Endpoints.
 * Substitui antigos accordions presos em scroll duplo por Bottom Sheets / Glass Modals responsivos.
 */
export const DevLoggerMetaModals: React.FC<DevLoggerMetaModalsProps> = ({
  serverMeta,
  engineUrl,
  showBaileysModal,
  onCloseBaileysModal,
  showChangelog,
  onCloseChangelog,
  showEndpoints,
  onCloseEndpoints,
  onCopyText,
}) => {
  const myTenant = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
  const endpoints = [
    { name: 'Root / App Status', method: 'GET', path: '/' },
    { name: 'Motor Health Check', method: 'GET', path: '/debug/healthz' },
    { name: 'Listar Todas Instâncias', method: 'GET', path: '/instance' },
    { name: 'Conversas / Chats da Instância', method: 'GET', path: `/instance/${myTenant}/chats` },
    { name: 'Contatos / Agenda da Instância', method: 'GET', path: `/instance/${myTenant}/contacts` },
  ];

  const releases = serverMeta?.baileysHistory || FALLBACK_BAILEYS_HISTORY;

  return (
    <>
      {/* 1. Baileys Core & GitHub Releases */}
      <DevLoggerModalShell
        isOpen={showBaileysModal}
        onClose={onCloseBaileysModal}
        title={`Baileys Core (${serverMeta?.baileysVersion || '7.0.0-rc.9'})`}
        badge={
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 text-[10px] font-black uppercase">
            Em Uso no Nó
          </span>
        }
        subtitle={
          <span>
            Motor Socket para WhatsApp Web &bull;{' '}
            <a
              href="https://github.com/WhiskeySockets/Baileys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-300 hover:text-purple-200 hover:underline font-bold"
            >
              WhiskeySockets/Baileys
            </a>
          </span>
        }
        icon={<Smartphone size={18} className="text-purple-300" />}
        accent="purple"
        headerExtra={
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href="/features"
              onClick={() => {
                onCloseBaileysModal();
                useDevStore.setState({ isVisible: false });
              }}
              className="flex items-center gap-1.5 text-xs text-emerald-200 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 px-3.5 py-2 min-h-[40px] rounded-xl font-bold transition-all active:scale-95"
            >
              <span>🗺️ Mapa Geral</span>
            </a>
            <a
              href="https://github.com/WhiskeySockets/Baileys/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-purple-200 hover:text-white bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 px-3.5 py-2 min-h-[40px] rounded-xl font-bold transition-all active:scale-95"
            >
              <span>Releases GitHub</span>
              <ExternalLink size={13} />
            </a>
          </div>
        }
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCloseBaileysModal}
              className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {releases.map((rel: any, idx: number) => (
            <div key={idx} className="bg-[#0d151d]/90 p-3.5 sm:p-4 rounded-2xl border border-white/10 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-white text-xs sm:text-sm font-mono">{rel.tag || rel.version}</span>
                  {rel.isLatest && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 text-[9px] font-black uppercase">
                      Latest
                    </span>
                  )}
                  {rel.isCurrent && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/35 text-[9px] font-black uppercase">
                      Rodando no Nó
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                  {rel.commit && <span className="bg-white/5 border border-white/10 px-2 py-0.5 rounded-md">commit {rel.commit}</span>}
                  <span>{rel.date}</span>
                </div>
              </div>

              <ul className="space-y-1.5 pt-1 border-t border-white/5">
                {rel.highlights && rel.highlights.map((item: string, iIdx: number) => (
                  <li key={iIdx} className="flex items-start gap-2.5 text-xs text-slate-200 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                    <span className="break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DevLoggerModalShell>

      {/* 2. Changelog / Novidades */}
      <DevLoggerModalShell
        isOpen={showChangelog}
        onClose={onCloseChangelog}
        title={`Novidades no Motor & App (v${serverMeta?.engineVersion || '8.1.3'})`}
        subtitle={
          <span>
            Deploy de{' '}
            {serverMeta?.history && serverMeta.history[0]
              ? new Date(serverMeta.history[0].compile_date).toLocaleString('pt-BR')
              : 'Hoje'}
          </span>
        }
        icon={<Rocket size={18} className="text-emerald-300" />}
        accent="emerald"
        headerExtra={
          <button
            type="button"
            onClick={() => {
              onCloseChangelog();
              openReleaseMindMap();
            }}
            className="w-full sm:w-auto self-start px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95 transition-all"
          >
            <span>📸 Ver Mapa Mental & Prints das 18 Funções</span>
          </button>
        }
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCloseChangelog}
              className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              Fechar
            </button>
          </div>
        }
      >
        {serverMeta?.changelog && serverMeta.changelog.length > 0 ? (
          <ul className="space-y-2.5">
            {serverMeta.changelog.map((logItem: string, idx: number) => (
              <li
                key={idx}
                className="flex items-start gap-3 p-3 rounded-2xl bg-[#0d151d]/90 border border-white/10 text-xs sm:text-[13px] text-slate-200 leading-relaxed"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                <span className="break-words">{logItem}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 rounded-2xl bg-[#0d151d]/90 border border-white/10 text-center space-y-2">
            <p className="text-xs font-bold text-slate-200">Nenhuma nota retornada pelo endpoint /debug/healthz neste momento.</p>
            <p className="text-[11px] text-slate-400">Use o botão acima para abrir o Mapa Mental completo de novidades do AppWeb.</p>
          </div>
        )}
      </DevLoggerModalShell>

      {/* 3. Root Endpoints */}
      <DevLoggerModalShell
        isOpen={showEndpoints}
        onClose={onCloseEndpoints}
        title="Endpoints Globais do Motor Baileys"
        subtitle={<span className="font-mono break-all">{engineUrl}</span>}
        icon={<Network size={18} className="text-indigo-300" />}
        accent="indigo"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCloseEndpoints}
              className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2.5">
          {endpoints.map((ep, idx) => {
            const fullUrl = `${engineUrl}${ep.path}`;
            return (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0d151d]/90 p-3.5 rounded-2xl border border-white/10 hover:border-indigo-400/30 transition-all"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black font-mono">
                      {ep.method}
                    </span>
                    <span className="text-white font-bold text-xs sm:text-[13px]">{ep.name}</span>
                  </div>
                  <p className="text-slate-400 font-mono text-[11px] break-all">{fullUrl}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onCopyText(fullUrl, 'URL do Endpoint copiada!')}
                    className="flex-1 sm:flex-initial justify-center text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 min-h-[40px] rounded-xl transition-all flex items-center gap-1.5 text-[11px] font-bold cursor-pointer active:scale-95"
                    title="Copiar URL"
                  >
                    <Copy size={12} />
                    <span>Copiar</span>
                  </button>
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-initial justify-center text-indigo-200 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-500/40 px-3.5 py-2 min-h-[40px] rounded-xl transition-all flex items-center gap-1.5 text-[11px] font-bold active:scale-95"
                  >
                    <span>Testar</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </DevLoggerModalShell>
    </>
  );
};
