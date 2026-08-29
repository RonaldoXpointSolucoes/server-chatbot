import React, { useState } from 'react';
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
  Check
} from 'lucide-react';

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

interface ValidatedVoucher {
  id: string;
  public_token: string;
  valor: number;
  beneficiario_nome?: string;
  status: string;
  lock_until?: string;
  campanha?: any;
  empresa?: any;
}

export default function VoucherScanner() {
  const [tokenInput, setTokenInput] = useState<string>('');
  const [atendenteName, setAtendenteName] = useState<string>(() => {
    return localStorage.getItem('voucher_atendente_name') || 'Balcão / Caixa Principal';
  });

  const [loadingReserve, setLoadingReserve] = useState<boolean>(false);
  const [loadingConfirm, setLoadingConfirm] = useState<boolean>(false);
  const [activeVoucher, setActiveVoucher] = useState<ValidatedVoucher | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [sessionHistory, setSessionHistory] = useState<Array<{ token: string; nome: string; valor: number; hora: string }>>([]);

  // 1. Passo 1: Reserva com Lock de 2 Minutos
  const handleReserve = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tokenInput.trim()) return;

    try {
      setLoadingReserve(true);
      setError(null);
      setSuccessMessage(null);
      setActiveVoucher(null);

      const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/redeem/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenInput.trim(),
          atendenteId: atendenteName
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao validar voucher.');
      }

      setActiveVoucher({
        ...data.voucher,
        campanha: data.campanha,
        empresa: data.empresa
      });
      setSuccessMessage('Voucher reservado com sucesso! Lock de 2 minutos ativo.');
    } catch (err: any) {
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

      const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/redeem/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucherId: activeVoucher.id,
          atendenteId: atendenteName
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao confirmar resgate.');
      }

      setSuccessMessage(`✅ Voucher ${activeVoucher.public_token} BAIXADO COM SUCESSO!`);
      
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
      setError(err.message || 'Erro ao finalizar resgate.');
    } finally {
      setLoadingConfirm(false);
    }
  };

  const handleReset = () => {
    setActiveVoucher(null);
    setTokenInput('');
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="min-h-screen w-full bg-[#090e11] text-slate-100 p-4 sm:p-6 md:p-8 font-sans select-none flex flex-col items-center justify-center relative">
      
      {/* Luzes Ambientais */}
      <div className="fixed -top-32 -left-32 w-96 h-96 bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed -bottom-32 -right-32 w-96 h-96 bg-teal-500/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-2xl bg-[#111b21]/95 border border-white/10 rounded-[32px] p-6 sm:p-8 shadow-2xl backdrop-blur-2xl space-y-6 relative z-10 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 border border-white/20">
              <QrCode className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h1 className="text-lg font-black text-white">Terminal de Validação & Resgate</h1>
              <p className="text-xs text-emerald-400 font-bold">Voucher Gestão • Antifraude</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold block">Identificação do Caixa:</span>
            <input
              type="text"
              value={atendenteName}
              onChange={(e) => {
                setAtendenteName(e.target.value);
                localStorage.setItem('voucher_atendente_name', e.target.value);
              }}
              className="bg-[#0c1317] border border-white/10 rounded-xl px-2.5 py-1 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500 text-right w-40"
            />
          </div>
        </div>

        {/* Mensagens de Feedback */}
        {error && (
          <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-bold flex items-center gap-2.5 text-left">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold flex items-center gap-2.5 text-left">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Formulário de Leitura / Digitação */}
        {!activeVoucher && (
          <form onSubmit={handleReserve} className="space-y-4 text-left">
            <label className="block text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" />
              <span>Digite o Código ou Leia o QR Code:</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Ex: VCH-A8B9C0 ou cole o token do QR Code"
                className="flex-1 bg-[#0c1317] border border-white/15 rounded-2xl px-4 py-3.5 text-base text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono font-bold shadow-inner"
                autoFocus
              />
              <button
                type="submit"
                disabled={loadingReserve || !tokenInput.trim()}
                className="px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-600/30 flex items-center gap-2 disabled:opacity-50"
              >
                {loadingReserve ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Validar</span>
              </button>
            </div>
          </form>
        )}

        {/* CARD DE VOUCHER VALIDADO (PASSO 2) */}
        {activeVoucher && (
          <div className="bg-[#0c1317] p-5 sm:p-6 rounded-[28px] border border-emerald-500/40 text-left space-y-4 shadow-xl animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Passo 1 Concluído: Lock de 2 Minutos Ativo</span>
              </span>
              <button
                onClick={handleReset}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="bg-[#111b21] p-3 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">Beneficiário</span>
                <span className="text-sm font-black text-white flex items-center gap-1.5">
                  <User className="w-4 h-4 text-emerald-400" />
                  {activeVoucher.beneficiario_nome || 'Colaborador'}
                </span>
              </div>

              <div className="bg-[#111b21] p-3 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">Valor do Benefício</span>
                <span className="text-lg font-black text-emerald-400 flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  {Number(activeVoucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>

            <div className="bg-[#111b21] p-3 rounded-2xl border border-white/5 space-y-1 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Empresa:</span>
                <strong className="text-white">{activeVoucher.empresa?.razao_social || 'Empresa Parceira'}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Campanha:</span>
                <strong className="text-white">{activeVoucher.campanha?.nome || 'Campanha'}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Código do Voucher:</span>
                <strong className="font-mono text-emerald-300">{activeVoucher.public_token}</strong>
              </div>
            </div>

            {/* BOTÃO DA BAIXA DEFINITIVA */}
            <button
              onClick={handleConfirmRedeem}
              disabled={loadingConfirm}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-[0_10px_30px_rgba(16,185,129,0.4)] active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {loadingConfirm ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-white" />
              )}
              <span>Confirmar Baixa Definitiva do Voucher</span>
            </button>

          </div>
        )}

        {/* Histórico da Sessão */}
        {sessionHistory.length > 0 && (
          <div className="bg-[#0c1317] p-4 rounded-2xl border border-white/10 space-y-3 text-left">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vouchers Baixados nesta Sessão ({sessionHistory.length}):</span>
            </span>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {sessionHistory.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-[#111b21] rounded-xl border border-white/5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <strong className="text-white font-mono">{item.token}</strong>
                    <span className="text-slate-400 truncate max-w-[120px]">{item.nome}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-bold font-mono">
                      {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <span className="text-[10px] text-slate-500">{item.hora}</span>
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
