import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  QrCode,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Building2,
  User,
  Clock,
  Loader2,
  Camera,
  CameraOff,
  KeyRound,
  Printer,
  RefreshCw,
  Ticket,
  Store,
  LogOut,
  Check
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { voucherService, VoucherRecord, StoreProfile, formatBRL } from '../../services/voucherService';

interface ShiftHistoryItem {
  id: string;
  public_token: string;
  beneficiario_nome: string;
  empresa_nome: string;
  valor: number;
  status: string;
  atendente: string;
  hora: string;
}

export default function VoucherScanner() {
  const [searchParams] = useSearchParams();
  const urlTenantId = searchParams.get('empresa') || searchParams.get('tenant');
  const urlToken = searchParams.get('token') || searchParams.get('code') || '';

  const [sessionTenantId, setSessionTenantId] = useState<string | null>(() => urlTenantId || localStorage.getItem('current_tenant_id'));
  const [sessionStoreName, setSessionStoreName] = useState<string>(() => localStorage.getItem('current_tenant_name') || '');
  const [hasAuthSession, setHasAuthSession] = useState<boolean>(false);

  const [operadorNome, setOperadorNome] = useState<string>(
    () => localStorage.getItem('current_user_name') || sessionStorage.getItem('voucher_scanner_operator') || 'Caixa Principal'
  );
  const [terminalPin, setTerminalPin] = useState<string>(() => sessionStorage.getItem('voucher_terminal_pin') || '');
  const [pinInput, setPinInput] = useState<string>('');
  const [showPinConfig, setShowPinConfig] = useState<boolean>(false);

  const [codeInput, setCodeInput] = useState<string>(urlToken);
  const [loading, setLoading] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [reservedVoucher, setReservedVoucher] = useState<VoucherRecord | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreProfile | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<VoucherRecord | null>(null);
  const [shiftHistory, setShiftHistory] = useState<ShiftHistoryItem[]>([]);

  // Camera QR Scanner
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasAuthSession(Boolean(session?.access_token));
    });
    const storedTid = urlTenantId || localStorage.getItem('current_tenant_id');
    setSessionTenantId(storedTid);
    if (localStorage.getItem('current_tenant_name')) {
      setSessionStoreName(localStorage.getItem('current_tenant_name') || '');
    }
  }, [urlTenantId]);

  useEffect(() => {
    sessionStorage.setItem('voucher_scanner_operator', operadorNome);
  }, [operadorNome]);

  useEffect(() => {
    if (urlToken) {
      handleValidateToken(urlToken);
    }
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const extractTokenFromScannedValue = (raw: string): string => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const u = new URL(trimmed);
        const qp = u.searchParams.get('token') || u.searchParams.get('code');
        if (qp) return qp;
        const segments = u.pathname.split('/').filter(Boolean);
        return segments[segments.length - 1] || trimmed;
      }
    } catch {}
    return trimmed;
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Navegador sem suporte de acesso à câmera. Utilize leitor USB ou digite o código.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      streamRef.current = stream;
      setCameraOpen(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 80);

      const BarcodeDetectorCtor = (window as any).BarcodeDetector;
      if (!BarcodeDetectorCtor) {
        setCameraError('Câmera aberta, mas este navegador não suporta leitura automática BarcodeDetector. Use Chrome/Android ou digite o código abaixo.');
        return;
      }

      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0 && codes[0].rawValue) {
            const extracted = extractTokenFromScannedValue(codes[0].rawValue);
            stopCamera();
            setCodeInput(extracted);
            handleValidateToken(extracted);
          }
        } catch {}
      }, 350);
    } catch (err: any) {
      setCameraError(err?.message || 'Não foi possível acessar a câmera do dispositivo.');
      stopCamera();
    }
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinInput.trim();
    if (clean.length < 4) {
      setErrorMsg('O PIN do Terminal Caixa deve possuir pelo menos 4 caracteres.');
      return;
    }
    sessionStorage.setItem('voucher_terminal_pin', clean);
    setTerminalPin(clean);
    setPinInput('');
    setShowPinConfig(false);
    setErrorMsg(null);
  };

  const handleClearPin = () => {
    sessionStorage.removeItem('voucher_terminal_pin');
    setTerminalPin('');
    setShowPinConfig(false);
  };

  const handleValidateToken = async (overrideToken?: string) => {
    const raw = extractTokenFromScannedValue(overrideToken !== undefined ? overrideToken : codeInput);
    if (!raw) {
      setErrorMsg('Digite ou escaneie o código do voucher ou QR Code.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setReservedVoucher(null);
    setRedeemSuccess(null);

    try {
      const res = await voucherService.scannerReserveVoucher({
        token: raw,
        tenantId: sessionTenantId || null,
        atendente: operadorNome.trim() || 'Operador Caixa',
        terminalPin: terminalPin || null
      });

      setReservedVoucher(res.voucher);
      if (res.restaurante) {
        setStoreInfo(res.restaurante);
        setSessionStoreName(res.restaurante.name || sessionStoreName);
      }
    } catch (err: any) {
      const msg = err?.message || 'Falha ao validar voucher.';
      setErrorMsg(msg);
      if (msg.toLowerCase().includes('pin') || msg.toLowerCase().includes('não autorizado')) {
        setShowPinConfig(true);
      }
      if (err?.voucher) {
        setReservedVoucher(err.voucher);
      }
      if (err?.restaurante) {
        setStoreInfo(err.restaurante);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRedeem = async () => {
    if (!reservedVoucher) return;

    setConfirming(true);
    setErrorMsg(null);

    try {
      const res = await voucherService.scannerConfirmRedeem({
        voucherIdOrToken: reservedVoucher.id,
        tenantId: reservedVoucher.tenant_id || sessionTenantId || null,
        atendente: operadorNome.trim() || 'Operador Caixa',
        terminalPin: terminalPin || null
      });

      const finalized: VoucherRecord = res.voucher;
      setRedeemSuccess(finalized);
      setReservedVoucher(finalized);
      if (res.restaurante) setStoreInfo(res.restaurante);

      setShiftHistory(prev => [
        {
          id: finalized.id,
          public_token: finalized.public_token,
          beneficiario_nome: finalized.beneficiario_nome || 'Beneficiário',
          empresa_nome: finalized.empresa_nome || res.restaurante?.name || 'Voucher',
          valor: Number(finalized.valor || 0),
          status: 'RESGATADO',
          atendente: operadorNome.trim() || 'Caixa',
          hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        },
        ...prev.slice(0, 19)
      ]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao confirmar baixa no caixa.');
    } finally {
      setConfirming(false);
    }
  };

  const handleResetScan = () => {
    setCodeInput('');
    setReservedVoucher(null);
    setRedeemSuccess(null);
    setErrorMsg(null);
    setTimeout(() => codeInputRef.current?.focus(), 60);
  };

  const handlePrintReceipt = () => {
    const v = redeemSuccess || reservedVoucher;
    if (!v) return;
    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) return;
    const storeLabel = storeInfo?.name || sessionStoreName || 'Estabelecimento';

    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Comprovante Voucher - ${v.public_token}</title>
          <style>
            body { font-family: monospace; width: 300px; margin: 16px auto; color: #111; }
            .center { text-align: center; }
            .line { border-top: 1px dashed #333; margin: 10px 0; }
            .big { font-size: 20px; font-weight: bold; }
            .row { display: flex; justify-content: space-between; font-size: 12px; margin: 4px 0; }
          </style>
        </head>
        <body>
          <div class="center">
            <div style="font-size:15px;font-weight:bold;">${storeLabel}</div>
            <div style="font-size:11px;">COMPROVANTE DE RESGATE DE VOUCHER</div>
          </div>
          <div class="line"></div>
          <div class="row"><span>CÓDIGO:</span><strong>${v.public_token}</strong></div>
          <div class="row"><span>STATUS:</span><strong>${v.status}</strong></div>
          <div class="row"><span>DATA/HORA:</span><span>${new Date(v.data_resgate || Date.now()).toLocaleString('pt-BR')}</span></div>
          <div class="row"><span>OPERADOR:</span><span>${v.atendente_id || operadorNome}</span></div>
          <div class="line"></div>
          <div style="font-size:12px;">BENEFICIÁRIO:<br/><strong>${v.beneficiario_nome || '-'}</strong></div>
          <div style="font-size:12px;margin-top:6px;">EMPRESA ORIGEM:<br/><strong>${v.empresa_nome || storeLabel}</strong></div>
          <div class="line"></div>
          <div class="center big">VALOR: ${formatBRL(v.valor)}</div>
          <div class="line"></div>
          <div class="center" style="font-size:11px;">Baixa eletrônica antifraude autenticada</div>
          <script>window.onload = function(){ window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const canValidateDirectly = hasAuthSession || Boolean(terminalPin);
  const isAlreadyRedeemed = reservedVoucher?.status === 'RESGATADO' || reservedVoucher?.status === 'UTILIZADO';
  const isBlockedStatus = isAlreadyRedeemed || reservedVoucher?.status === 'CANCELADO' || reservedVoucher?.status === 'EXPIRADO';

  return (
    <div className="h-[100dvh] w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#070b0e] text-slate-100 p-3.5 sm:p-6 lg:p-8 pb-24 sm:pb-10 flex flex-col items-center [-webkit-overflow-scrolling:touch]">
      <div className="w-full max-w-3xl space-y-5">
        {/* Header Bar */}
        <div className="rounded-3xl bg-slate-900/75 backdrop-blur-xl border border-slate-800/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <QrCode className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-extrabold text-white">Terminal Caixa — Vouchers</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  Antifraude DB
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-slate-500" />
                {sessionStoreName || storeInfo?.name || 'Validação em Tempo Real'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowPinConfig(v => !v)}
              className={`min-h-[44px] px-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 transition-all ${
                terminalPin || hasAuthSession
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              {hasAuthSession
                ? 'Sessão CRM Ativa'
                : terminalPin
                ? 'PIN Caixa Ativo'
                : 'Desbloquear PIN Caixa'}
            </button>
          </div>
        </div>

        {/* Terminal Operator & PIN Gate */}
        {(showPinConfig || !canValidateDirectly) && (
          <div className="rounded-3xl bg-slate-900/90 border border-amber-500/30 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Autorização do Terminal Caixa
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Por segurança, apenas usuários autenticados no CRM ou caixas com o <strong>PIN do Terminal</strong> configurado no estabelecimento podem dar baixa em vouchers.
                </p>
              </div>
              {terminalPin && (
                <button
                  type="button"
                  onClick={handleClearPin}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" /> Limpar PIN
                </button>
              )}
            </div>

            <form onSubmit={handleSavePin} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Operador</label>
                <input
                  type="text"
                  value={operadorNome}
                  onChange={e => setOperadorNome(e.target.value)}
                  placeholder="Nome do atendente"
                  className="w-full min-h-[46px] px-3.5 rounded-2xl bg-slate-950/80 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">PIN do Caixa (Loja)</label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value)}
                  placeholder={terminalPin ? 'PIN salvo nesta aba' : 'Ex: 4820'}
                  className="w-full min-h-[46px] px-3.5 rounded-2xl bg-slate-950/80 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full min-h-[46px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider transition-all"
                >
                  Ativar PIN neste Caixa
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search & QR Scan Box */}
        <div className="rounded-3xl bg-slate-900/75 backdrop-blur-xl border border-slate-800/80 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Código do Voucher ou Leitura do QR Code
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={codeInputRef}
                    type="text"
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleValidateToken();
                    }}
                    placeholder="Ex: BURGUE-8F2A1C ou QR JWT..."
                    className="w-full min-h-[50px] pl-10 pr-4 rounded-2xl bg-slate-950/80 border border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm font-mono text-white placeholder:text-slate-500 outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleValidateToken()}
                  disabled={loading}
                  className="min-h-[50px] px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shrink-0 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Consultar Voucher
                </button>

                <button
                  type="button"
                  onClick={cameraOpen ? stopCamera : startCamera}
                  className="min-h-[50px] px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center gap-2 shrink-0 transition-all"
                >
                  {cameraOpen ? <CameraOff className="w-4 h-4 text-rose-400" /> : <Camera className="w-4 h-4 text-emerald-400" />}
                  <span className="sm:hidden md:inline">{cameraOpen ? 'Fechar Câmera' : 'Câmera QR'}</span>
                </button>
              </div>
            </div>
          </div>

          {hasAuthSession && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Operador Caixa:</span>
              <input
                type="text"
                value={operadorNome}
                onChange={e => setOperadorNome(e.target.value)}
                className="bg-slate-950/60 border border-slate-800 rounded-xl px-2.5 py-1 text-slate-200 text-xs outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {cameraOpen && (
            <div className="rounded-2xl overflow-hidden bg-black border border-emerald-500/40 relative">
              <video ref={videoRef} className="w-full max-h-72 object-cover" playsInline muted />
              <div className="p-2.5 bg-slate-950/80 text-center text-xs text-emerald-300 font-semibold">
                Aponte a câmera para o QR Code dinâmico na tela do cliente...
              </div>
            </div>
          )}

          {cameraError && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm flex items-start gap-3">
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-rose-300">Validação Recusada</div>
                <div className="text-xs mt-0.5 text-rose-200/90">{errorMsg}</div>
              </div>
            </div>
          )}
        </div>

        {/* Voucher Validation / Confirmation Card */}
        {reservedVoucher && (
          <div
            className={`rounded-3xl backdrop-blur-xl border-2 p-6 sm:p-7 space-y-5 transition-all ${
              redeemSuccess
                ? 'bg-emerald-950/35 border-emerald-500/60 shadow-2xl shadow-emerald-950/50'
                : isBlockedStatus
                ? 'bg-rose-950/30 border-rose-500/50'
                : 'bg-slate-900/90 border-emerald-500/40 shadow-2xl'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                    redeemSuccess
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : isBlockedStatus
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  }`}
                >
                  {redeemSuccess ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ticket className="w-3.5 h-3.5" />}
                  Status Atual: {reservedVoucher.status}
                </span>
                <h2 className="text-2xl font-black font-mono tracking-wider text-white mt-2">
                  {reservedVoucher.public_token}
                </h2>
              </div>

              <div className="sm:text-right">
                <div className="text-xs font-bold uppercase text-slate-400">Crédito do Voucher</div>
                <div className="text-3xl sm:text-4xl font-black text-emerald-400">
                  {formatBRL(reservedVoucher.valor)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3.5">
                <div className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Beneficiário / Portador
                </div>
                <div className="font-bold text-white mt-1">
                  {reservedVoucher.beneficiario_nome || 'Não identificado'}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3.5">
                <div className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Empresa Patrocinadora
                </div>
                <div className="font-bold text-white mt-1">
                  {reservedVoucher.empresa_razao_social || reservedVoucher.empresa_nome || storeInfo?.name || 'Emissão Direta'}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3.5">
                <div className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Validade
                </div>
                <div className="font-semibold text-slate-200 mt-1">
                  {reservedVoucher.validade_fim
                    ? new Date(reservedVoucher.validade_fim).toLocaleDateString('pt-BR')
                    : 'Indeterminada'}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3.5">
                <div className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" /> Loja Validadora
                </div>
                <div className="font-semibold text-slate-200 mt-1">
                  {storeInfo?.name || sessionStoreName || 'Loja Vinculada'}
                </div>
              </div>
            </div>

            {reservedVoucher.observacoes && (
              <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3.5 text-xs text-slate-300">
                <strong className="text-slate-400 uppercase mr-1.5">Obs:</strong>
                {reservedVoucher.observacoes}
              </div>
            )}

            {redeemSuccess ? (
              <div className="space-y-3 pt-2">
                <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-3 font-bold">
                  <Check className="w-5 h-5 shrink-0" />
                  <span>
                    Baixa confirmada no caixa! Liquidado por <strong>{redeemSuccess.atendente_id}</strong> em{' '}
                    {redeemSuccess.data_resgate ? new Date(redeemSuccess.data_resgate).toLocaleString('pt-BR') : 'agora'}.
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    className="min-h-[52px] rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Printer className="w-4 h-4" /> Imprimir Comprovante Caixa
                  </button>
                  <button
                    type="button"
                    onClick={handleResetScan}
                    className="min-h-[52px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" /> Validar Próximo Voucher
                  </button>
                </div>
              </div>
            ) : !isBlockedStatus ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetScan}
                  className="min-h-[54px] rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all"
                >
                  Cancelar Leitura
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRedeem}
                  disabled={confirming}
                  className="min-h-[54px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/60 transition-all"
                >
                  {confirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  CONFIRMAR BAIXA DE {formatBRL(reservedVoucher.valor)}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleResetScan}
                className="w-full min-h-[50px] rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition-all"
              >
                Voltar e Ler Outro Voucher
              </button>
            )}
          </div>
        )}

        {/* Shift Audit Log (UI-only current cashier turn log) */}
        {shiftHistory.length > 0 && (
          <div className="rounded-3xl bg-slate-900/60 border border-slate-800/80 p-5 space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Baixas Confirmadas Neste Turno ({shiftHistory.length})
            </h3>
            <div className="divide-y divide-slate-800/70">
              {shiftHistory.map((item, idx) => (
                <div key={`${item.id}_${idx}`} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">
                      {item.beneficiario_nome} • <span className="font-mono text-emerald-400">{item.public_token}</span>
                    </div>
                    <div className="text-slate-400 truncate">
                      {item.empresa_nome} • Caixa: {item.atendente} às {item.hora}
                    </div>
                  </div>
                  <div className="font-extrabold text-emerald-400 shrink-0">{formatBRL(item.valor)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
