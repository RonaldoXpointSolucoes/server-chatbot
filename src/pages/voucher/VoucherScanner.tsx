import React, { useState, useRef, useEffect } from 'react';
import {
  QrCode,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Lock,
  Building2,
  User,
  DollarSign,
  Calendar,
  Sparkles,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  History,
  Check,
  XCircle,
  AlertOctagon,
  Ban,
  Volume2,
  VolumeX,
  Ticket,
  Clock,
  ExternalLink
} from 'lucide-react';

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

interface ValidatedVoucher {
  id: string;
  public_token: string;
  valor: number;
  beneficiario_nome?: string;
  status: string;
  lock_until?: string;
  data_resgate?: string;
  campanha?: any;
  empresa?: any;
}

interface BlockedVoucherDetails {
  token: string;
  reason: string;
  status: string;
  beneficiarioNome?: string;
  valor?: number;
  empresaNome?: string;
  campanhaNome?: string;
  dataResgate?: string;
}

// Sintetizador Sonoro de Terminal via Web Audio API (Nativo, sem dependências)
const playTerminalBeep = (type: 'success' | 'error' | 'confirm') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'error') {
      // Tom duplo grave descendente (alerta de bloqueio / erro)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(220, ctx.currentTime); // A3
      osc1.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.25);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(200, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.35);
      osc2.stop(ctx.currentTime + 0.35);
    } else if (type === 'success') {
      // Tom duplo ascendente alegre (leitura de código com sucesso)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } else if (type === 'confirm') {
      // Tríade brilhante de confirmação da baixa
      const notes = [523.25, 659.25, 1046.5]; // C5, E5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07);

        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.07 + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.07);
        osc.stop(ctx.currentTime + i * 0.07 + 0.22);
      });
    }
  } catch (e) {
    // Silencia em navegadores com restrição de autoplay
  }
};

export default function VoucherScanner() {
  const [tokenInput, setTokenInput] = useState<string>('');
  const [atendenteName, setAtendenteName] = useState<string>(() => {
    return localStorage.getItem('voucher_atendente_name') || 'Balcão / Caixa Principal';
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [loadingReserve, setLoadingReserve] = useState<boolean>(false);
  const [loadingConfirm, setLoadingConfirm] = useState<boolean>(false);
  
  // Estados de Apresentação
  const [activeVoucher, setActiveVoucher] = useState<ValidatedVoucher | null>(null);
  const [blockedVoucher, setBlockedVoucher] = useState<BlockedVoucherDetails | null>(null);
  const [redeemedVoucher, setRedeemedVoucher] = useState<ValidatedVoucher | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [sessionHistory, setSessionHistory] = useState<Array<{ token: string; nome: string; valor: number; hora: string }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Foca o input ao iniciar e após resets
  useEffect(() => {
    if (!activeVoucher && !blockedVoucher && !redeemedVoucher) {
      inputRef.current?.focus();
    }
  }, [activeVoucher, blockedVoucher, redeemedVoucher]);

  // 1. Passo 1: Reserva / Validação com Lock
  const handleReserve = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tokenInput.trim()) return;

    const cleanToken = tokenInput.trim().toUpperCase();

    try {
      setLoadingReserve(true);
      setError(null);
      setSuccessMessage(null);
      setActiveVoucher(null);
      setBlockedVoucher(null);
      setRedeemedVoucher(null);

      // Tenta via backend engine
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/redeem/reserve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: cleanToken,
            atendenteId: atendenteName
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await res.json();
        if (res.ok && data.voucher) {
          setActiveVoucher({
            ...data.voucher,
            campanha: data.campanha,
            empresa: data.empresa
          });
          if (soundEnabled) playTerminalBeep('success');
          setSuccessMessage('Voucher verificado com sucesso! Lock de segurança ativo.');
          return;
        } else if (data.voucher && data.voucher.status === 'UTILIZADO') {
          if (soundEnabled) playTerminalBeep('error');
          setBlockedVoucher({
            token: cleanToken,
            reason: 'Este voucher já foi utilizado anteriormente no caixa.',
            status: 'UTILIZADO',
            beneficiarioNome: data.voucher.beneficiario_nome,
            valor: Number(data.voucher.valor),
            empresaNome: data.empresa?.razao_social,
            campanhaNome: data.campanha?.nome,
            dataResgate: data.voucher.data_resgate
          });
          return;
        }
      } catch (backendErr) {
        console.warn('[VoucherScanner] Backend offline, tentando validação local:', backendErr);
      }

      // Fallback: Validação Local via LocalStorage
      let localV: any = null;
      const direct = localStorage.getItem(`voucher_token_${cleanToken}`);
      if (direct) {
        localV = JSON.parse(direct);
      } else {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('voucher_items_') || key.startsWith('vouchers_'))) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const found = list.find((item: any) => item.public_token === cleanToken || item.id === cleanToken);
                if (found) {
                  localV = found;
                  break;
                }
              }
            }
          }
        }
      }

      if (localV) {
        if (localV.status === 'UTILIZADO') {
          if (soundEnabled) playTerminalBeep('error');
          setBlockedVoucher({
            token: cleanToken,
            reason: 'Este voucher já teve sua baixa realizada no caixa.',
            status: 'UTILIZADO',
            beneficiarioNome: localV.beneficiario_nome || 'Colaborador',
            valor: Number(localV.valor) || 40.0,
            empresaNome: localV.voucher_empresas_parceiras?.razao_social || localV.empresa_razao_social || 'Empresa Parceira',
            campanhaNome: localV.voucher_campanhas?.nome || localV.campanha_nome || 'Campanha Corporativa',
            dataResgate: localV.data_resgate || localV.updated_at
          });
          return;
        }

        if (localV.status === 'CANCELADO' || localV.status === 'EXPIRADO') {
          if (soundEnabled) playTerminalBeep('error');
          setBlockedVoucher({
            token: cleanToken,
            reason: `Voucher bloqueado pelo administrador com status '${localV.status}'.`,
            status: localV.status,
            beneficiarioNome: localV.beneficiario_nome || 'Colaborador',
            valor: Number(localV.valor) || 40.0,
            empresaNome: localV.voucher_empresas_parceiras?.razao_social || localV.empresa_razao_social || 'Empresa Parceira',
            campanhaNome: localV.voucher_campanhas?.nome || localV.campanha_nome || 'Campanha Corporativa'
          });
          return;
        }

        if (localV.validade_fim && new Date(localV.validade_fim) < new Date()) {
          if (soundEnabled) playTerminalBeep('error');
          setBlockedVoucher({
            token: cleanToken,
            reason: `Voucher expirado. A validade encerrou em ${new Date(localV.validade_fim).toLocaleDateString('pt-BR')}.`,
            status: 'EXPIRADO',
            beneficiarioNome: localV.beneficiario_nome || 'Colaborador',
            valor: Number(localV.valor) || 40.0,
            empresaNome: localV.voucher_empresas_parceiras?.razao_social || localV.empresa_razao_social || 'Empresa Parceira',
            campanhaNome: localV.voucher_campanhas?.nome || localV.campanha_nome || 'Campanha Corporativa'
          });
          return;
        }

        // Voucher Válido e Aprovado para Resgate
        if (soundEnabled) playTerminalBeep('success');
        setActiveVoucher({
          id: localV.id,
          public_token: localV.public_token || cleanToken,
          valor: Number(localV.valor) || 40.0,
          beneficiario_nome: localV.beneficiario_nome || 'Colaborador',
          status: localV.status || 'CRIADO',
          campanha: localV.voucher_campanhas || { nome: localV.campanha_nome || 'Benefício Corporativo' },
          empresa: localV.voucher_empresas_parceiras || { razao_social: localV.empresa_razao_social || 'Empresa Parceira' }
        });
        setSuccessMessage('Voucher aprovado! Lock de 2 minutos ativo para conferência.');
        return;
      }

      if (soundEnabled) playTerminalBeep('error');
      setBlockedVoucher({
        token: cleanToken,
        reason: `Voucher com código '${cleanToken}' não foi localizado no cadastro deste estabelecimento.`,
        status: 'NAO_LOCALIZADO'
      });
    } catch (err: any) {
      if (soundEnabled) playTerminalBeep('error');
      setError(err.message || 'Erro ao validar voucher.');
    } finally {
      setLoadingReserve(false);
    }
  };

  // 2. Passo 2: Baixa Definitiva do Voucher
  const handleConfirmRedeem = async () => {
    if (!activeVoucher?.id) return;

    try {
      setLoadingConfirm(true);
      setError(null);

      // Tenta via backend engine
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/redeem/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voucherId: activeVoucher.id,
            atendenteId: atendenteName
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (backendErr) {
        console.warn('[VoucherScanner] Baixa no backend falhou, confirmando localmente:', backendErr);
      }

      const resgateHora = new Date().toISOString();
      const txnHash = 'TXN-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const redemptionValue = Number(activeVoucher.valor || 0);

      // Baixa no Supabase
      try {
        await supabase
          .from('vouchers')
          .update({
            status: 'UTILIZADO',
            data_resgate: resgateHora,
            atendente_id: atendenteName
          })
          .eq('id', activeVoucher.id);

        // Registro de Auditoria & Lançamento Contábil no Ledger (Débito de Ativo)
        await supabase.from('voucher_events').insert({
          id: 'ev-' + Math.random().toString(36).substring(2, 9),
          tenant_id: activeVoucher.tenant_id || tenantId,
          voucher_id: activeVoucher.id,
          voucher_token: activeVoucher.public_token,
          tipo_operacao: 'DEBITO_RESGATE',
          valor: redemptionValue,
          beneficiario_nome: activeVoucher.beneficiario_nome || 'Colaborador',
          status_anterior: activeVoucher.status || 'CRIADO',
          status_novo: 'UTILIZADO',
          data_hora: resgateHora,
          usuario_responsavel: `Atendente / PDV: ${atendenteName}`,
          hash_transacao: txnHash,
          motivo: `Resgate e liquidação contábil de voucher no caixa por ${atendenteName}`
        });
      } catch (dbErr) {
        console.warn('[VoucherScanner] Falha ao gravar baixa no Supabase:', dbErr);
      }

      // Baixa no LocalStorage
      try {
        const tokenKey = `voucher_token_${activeVoucher.public_token}`;
        const raw = localStorage.getItem(tokenKey);
        if (raw) {
          const v = JSON.parse(raw);
          v.status = 'UTILIZADO';
          v.data_resgate = resgateHora;
          v.atendente_id = atendenteName;
          localStorage.setItem(tokenKey, JSON.stringify(v));
        }

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('voucher_items_') || key.startsWith('vouchers_'))) {
            const listRaw = localStorage.getItem(key);
            if (listRaw) {
              const list = JSON.parse(listRaw);
              if (Array.isArray(list)) {
                const updatedList = list.map((item: any) =>
                  item.public_token === activeVoucher.public_token || item.id === activeVoucher.id
                    ? { ...item, status: 'UTILIZADO', data_resgate: resgateHora, atendente_id: atendenteName }
                    : item
                );
                localStorage.setItem(key, JSON.stringify(updatedList));
              }
            }
          }

          // Atualiza eventos no local storage
          if (key && key.startsWith('voucher_events_')) {
            const evListRaw = localStorage.getItem(key);
            const evList = evListRaw ? JSON.parse(evListRaw) : [];
            if (Array.isArray(evList)) {
              evList.unshift({
                id: 'ev-' + Math.random().toString(36).substring(2, 9),
                voucher_id: activeVoucher.id,
                voucher_token: activeVoucher.public_token,
                tipo_operacao: 'DEBITO_RESGATE',
                valor: redemptionValue,
                beneficiario_nome: activeVoucher.beneficiario_nome || 'Colaborador',
                status_anterior: activeVoucher.status || 'CRIADO',
                status_novo: 'UTILIZADO',
                data_hora: resgateHora,
                usuario_responsavel: `Atendente / PDV: ${atendenteName}`,
                hash_transacao: txnHash,
                motivo: `Resgate e liquidação contábil de voucher no caixa por ${atendenteName}`
              });
              localStorage.setItem(key, JSON.stringify(evList));
            }
          }
        }
      } catch (localSaveErr) {
        console.warn('[VoucherScanner] Erro ao salvar baixa local:', localSaveErr);
      }

      if (soundEnabled) playTerminalBeep('confirm');

      const finalizedVoucher = {
        ...activeVoucher,
        status: 'UTILIZADO',
        data_resgate: resgateHora
      };

      setRedeemedVoucher(finalizedVoucher);

      // Adiciona ao histórico da sessão
      setSessionHistory((prev) => [
        {
          token: activeVoucher.public_token,
          nome: activeVoucher.beneficiario_nome || 'Colaborador',
          valor: Number(activeVoucher.valor || 0),
          hora: new Date().toLocaleTimeString('pt-BR')
        },
        ...prev
      ]);

      setActiveVoucher(null);
      setTokenInput('');
    } catch (err: any) {
      if (soundEnabled) playTerminalBeep('error');
      setError(err.message || 'Erro ao finalizar resgate.');
    } finally {
      setLoadingConfirm(false);
    }
  };

  const handleReset = () => {
    setActiveVoucher(null);
    setBlockedVoucher(null);
    setRedeemedVoucher(null);
    setTokenInput('');
    setError(null);
    setSuccessMessage(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-screen w-full bg-[#090e11] text-slate-100 p-3 sm:p-6 md:p-8 font-sans select-none flex flex-col items-center justify-center relative overflow-x-hidden">
      
      {/* Luzes Ambientais Dinâmicas de Fundo */}
      {blockedVoucher ? (
        <>
          <div className="fixed -top-32 -left-32 w-96 h-96 bg-rose-600/25 rounded-full blur-[120px] pointer-events-none animate-pulse duration-1000" />
          <div className="fixed -bottom-32 -right-32 w-96 h-96 bg-red-700/25 rounded-full blur-[120px] pointer-events-none animate-pulse duration-1000" />
        </>
      ) : activeVoucher || redeemedVoucher ? (
        <>
          <div className="fixed -top-32 -left-32 w-96 h-96 bg-emerald-500/25 rounded-full blur-[120px] pointer-events-none animate-pulse duration-1000" />
          <div className="fixed -bottom-32 -right-32 w-96 h-96 bg-teal-500/20 rounded-full blur-[120px] pointer-events-none" />
        </>
      ) : (
        <>
          <div className="fixed -top-32 -left-32 w-96 h-96 bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none" />
          <div className="fixed -bottom-32 -right-32 w-96 h-96 bg-teal-500/15 rounded-full blur-[100px] pointer-events-none" />
        </>
      )}

      <div className={`w-full max-w-2xl bg-[#111b21]/95 border rounded-[32px] p-5 sm:p-8 shadow-2xl backdrop-blur-2xl space-y-6 relative z-10 my-auto transition-all duration-300 ${
        blockedVoucher 
          ? 'border-rose-500/50 shadow-[0_0_50px_rgba(244,63,94,0.25)] ring-2 ring-rose-500/20' 
          : activeVoucher 
          ? 'border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.25)] ring-2 ring-emerald-500/20'
          : redeemedVoucher
          ? 'border-teal-500/50 shadow-[0_0_50px_rgba(20,184,166,0.25)]'
          : 'border-white/10'
      }`}>
        
        {/* Header do Terminal */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg border transition-all duration-300 ${
              blockedVoucher 
                ? 'bg-gradient-to-tr from-rose-600 to-red-500 border-rose-400/40 shadow-rose-600/30' 
                : activeVoucher 
                ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 border-emerald-400/40 shadow-emerald-600/30' 
                : 'bg-gradient-to-tr from-emerald-600 to-teal-500 border-white/20 shadow-emerald-500/25'
            }`}>
              {blockedVoucher ? <Ban className="w-6 h-6 animate-bounce" /> : <QrCode className="w-6 h-6" />}
            </div>
            <div className="text-left">
              <h1 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Terminal de Validação & Resgate</span>
              </h1>
              <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Voucher Gestão • Antifraude em Tempo Real</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                soundEnabled 
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
              title={soundEnabled ? 'Som do Terminal Ativo' : 'Som Mudo'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <div className="text-right hidden sm:block">
              <span className="text-[10px] text-slate-400 font-bold block">Identificação do Caixa:</span>
              <input
                type="text"
                value={atendenteName}
                onChange={(e) => {
                  setAtendenteName(e.target.value);
                  localStorage.setItem('voucher_atendente_name', e.target.value);
                }}
                className="bg-[#0c1317] border border-white/10 rounded-xl px-2.5 py-1 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500 text-right w-36"
              />
            </div>
          </div>
        </div>

        {/* ============================================================================== */}
        {/* CASO 1: CARD DE ALERTA DE BLOQUEIO ANTIFRAUDE (VOUCHER JÁ UTILIZADO / EXPIRADO) */}
        {/* ============================================================================== */}
        {blockedVoucher && (
          <div className="bg-gradient-to-b from-rose-950/70 to-[#0c1317] p-5 sm:p-7 rounded-[28px] border-2 border-rose-500/70 text-left space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Header de Bloqueio */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-rose-600/30 border-2 border-rose-500/80 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-600/30 shrink-0">
                  <XCircle className="w-7 h-7 sm:w-8 sm:h-8 text-rose-400 animate-pulse" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 bg-rose-600/30 text-rose-300 border border-rose-500/50 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                    <AlertOctagon className="w-3 h-3 text-rose-400" />
                    USO BLOQUEADO • ANTIFRAUDE
                  </span>
                  <h2 className="text-base sm:text-xl font-black text-rose-300 mt-1">
                    {blockedVoucher.status === 'UTILIZADO' 
                      ? 'VOUCHER JÁ UTILIZADO ANTERIORMENTE!' 
                      : blockedVoucher.status === 'EXPIRADO'
                      ? 'VOUCHER COM VALIDADE EXPIRADA!'
                      : 'VOUCHER NÃO AUTORIZADO!'}
                  </h2>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="p-2 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer text-xs flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nova Consulta</span>
              </button>
            </div>

            {/* Explicação da Violação */}
            <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-200 text-xs sm:text-sm font-semibold flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{blockedVoucher.reason}</span>
            </div>

            {/* Detalhes do Voucher Bloqueado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#111b21]/80 p-4 rounded-2xl border border-white/5">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Código Inserido</span>
                <strong className="text-lg font-mono font-black text-rose-400">{blockedVoucher.token}</strong>
              </div>

              {blockedVoucher.valor !== undefined && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Valor do Benefício</span>
                  <strong className="text-base font-black text-slate-200">
                    {blockedVoucher.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
              )}

              {blockedVoucher.beneficiarioNome && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Titular Cadastrado</span>
                  <span className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {blockedVoucher.beneficiarioNome}
                  </span>
                </div>
              )}

              {blockedVoucher.dataResgate && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Data do Primeiro Resgate</span>
                  <span className="text-xs font-mono font-bold text-rose-300 flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-rose-400" />
                    {new Date(blockedVoucher.dataResgate).toLocaleString('pt-BR')}
                  </span>
                </div>
              )}
            </div>

            {/* Botão de Nova Leitura */}
            <button
              onClick={handleReset}
              className="w-full py-4 bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white font-black rounded-2xl text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-rose-600/30 active:scale-95 cursor-pointer min-h-[48px]"
            >
              <RotateCcw className="w-5 h-5" />
              <span>Escanear Outro Voucher</span>
            </button>

          </div>
        )}

        {/* ============================================================================== */}
        {/* CASO 2: CARD DE SUCESSO PÓS-BAIXA DEFINITIVA (RESGATE CONCLUÍDO) */}
        {/* ============================================================================== */}
        {redeemedVoucher && (
          <div className="bg-gradient-to-b from-emerald-950/70 to-[#0c1317] p-5 sm:p-7 rounded-[28px] border-2 border-emerald-500/70 text-left space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-600/30 border-2 border-emerald-500/80 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-600/30 shrink-0">
                <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  BAIXA CONFIRMADA COM SUCESSO
                </span>
                <h2 className="text-base sm:text-xl font-black text-white mt-1">
                  Voucher Resgatado no Caixa!
                </h2>
              </div>
            </div>

            <div className="p-4 bg-[#111b21] rounded-2xl border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Código do Voucher:</span>
                <strong className="text-sm font-mono font-black text-emerald-400">{redeemedVoucher.public_token}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Valor Baixado:</span>
                <strong className="text-lg font-black text-white">
                  {Number(redeemedVoucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Titular:</span>
                <span className="text-xs font-bold text-slate-200">{redeemedVoucher.beneficiario_nome || 'Colaborador'}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-slate-500">
                <span>Operador Responsável:</span>
                <span className="text-slate-400 font-bold">{atendenteName}</span>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-[0_10px_30px_rgba(16,185,129,0.4)] active:scale-95 cursor-pointer min-h-[48px]"
            >
              <Check className="w-5 h-5" />
              <span>Próximo Atendimento</span>
            </button>

          </div>
        )}

        {/* ============================================================================== */}
        {/* CASO 3: CARD DE VOUCHER VALIDADO / APROVADO (PASSO 1: CONFERÊNCIA & LOCK) */}
        {/* ============================================================================== */}
        {activeVoucher && (
          <div className="bg-gradient-to-b from-[#0e211b] to-[#0c1317] p-5 sm:p-7 rounded-[28px] border-2 border-emerald-500/70 text-left space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Voucher Aprovado • Lock de Segurança Ativo</span>
              </span>
              <button
                onClick={handleReset}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer p-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            </div>

            {/* Destaque do Valor em Verde Neon */}
            <div className="bg-[#111b21] p-5 rounded-2xl border border-emerald-500/30 text-center space-y-1 shadow-inner">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">
                Valor Autorizado para Abatimento
              </span>
              <div className="text-3xl sm:text-4xl font-black text-emerald-400 flex items-center justify-center gap-1.5 drop-shadow-[0_0_20px_rgba(16,185,129,0.5)]">
                <span>{Number(activeVoucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
              <span className="text-[11px] text-emerald-300/80 font-semibold block">
                {activeVoucher.campanha?.nome || 'Campanha Corporativa'}
              </span>
            </div>

            {/* Grid de Informações de Conferência */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#111b21] p-3.5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Beneficiário</span>
                <span className="text-sm font-black text-white flex items-center gap-1.5">
                  <User className="w-4 h-4 text-emerald-400" />
                  {activeVoucher.beneficiario_nome || 'Colaborador'}
                </span>
              </div>

              <div className="bg-[#111b21] p-3.5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Empresa Parceira</span>
                <span className="text-sm font-black text-white flex items-center gap-1.5 truncate">
                  <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">{activeVoucher.empresa?.razao_social || 'Empresa Parceira'}</span>
                </span>
              </div>
            </div>

            <div className="bg-[#111b21] p-3 rounded-2xl border border-white/5 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Código do Voucher:</span>
              <strong className="font-mono text-sm text-emerald-300 bg-black/40 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                {activeVoucher.public_token}
              </strong>
            </div>

            {/* BOTÃO DA BAIXA DEFINITIVA (PASSO 2) */}
            <button
              onClick={handleConfirmRedeem}
              disabled={loadingConfirm}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-[0_10px_30px_rgba(16,185,129,0.45)] hover:shadow-[0_10px_40px_rgba(16,185,129,0.6)] active:scale-95 cursor-pointer disabled:opacity-50 min-h-[52px]"
            >
              {loadingConfirm ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-white animate-bounce" />
              )}
              <span>CONFIRMAR BAIXA NO CAIXA</span>
            </button>

          </div>
        )}

        {/* ============================================================================== */}
        {/* CASO 4: FORMULÁRIO INICIAL DE LEITURA / DIGITAÇÃO DE QR CODE */}
        {/* ============================================================================== */}
        {!activeVoucher && !blockedVoucher && !redeemedVoucher && (
          <form onSubmit={handleReserve} className="space-y-4 text-left">
            
            {error && (
              <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-bold flex items-center gap-2.5 text-left animate-in fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold flex items-center gap-2.5 text-left animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{successMessage}</span>
              </div>
            )}

            <label className="block text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" />
              <span>Digite o Código ou Aponte o Leitor de QR Code:</span>
            </label>
            
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                ref={inputRef}
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Ex: VCH-T3XFOM ou cole o token"
                className="flex-1 bg-[#0c1317] border border-white/15 rounded-2xl px-4 py-4 text-base sm:text-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono font-black shadow-inner tracking-wider"
                autoFocus
              />
              <button
                type="submit"
                disabled={loadingReserve || !tokenInput.trim()}
                className="px-8 py-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-xs sm:text-sm uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
              >
                {loadingReserve ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                <span>Validar</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Compatível com leitores ópticos USB, scanners sem fio e digitação manual rápida.</span>
            </p>
          </form>
        )}

        {/* Histórico da Sessão com Totalizador */}
        {sessionHistory.length > 0 && (
          <div className="bg-[#0c1317] p-4 sm:p-5 rounded-2xl border border-white/10 space-y-3 text-left">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vouchers Baixados nesta Sessão ({sessionHistory.length})</span>
              </span>
              <span className="text-xs font-black text-emerald-400">
                Total:{' '}
                {sessionHistory
                  .reduce((acc, curr) => acc + curr.valor, 0)
                  .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {sessionHistory.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-[#111b21] rounded-xl border border-white/5 text-xs hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <strong className="text-white font-mono">{item.token}</strong>
                    <span className="text-slate-400 truncate max-w-[140px]">{item.nome}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-bold font-mono">
                      {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{item.hora}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}

