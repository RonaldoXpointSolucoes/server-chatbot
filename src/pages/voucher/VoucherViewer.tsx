import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import {
  Ticket,
  CheckCircle2,
  Clock,
  Building2,
  User,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Share2,
  Copy,
  Check,
  Zap,
  Calendar,
  Sparkles,
  Loader2,
  Info
} from 'lucide-react';
import { supabase } from '../../services/supabase';

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
const QR_INTERVAL = 30; // Segundos para auto-renovação do JWT

export default function VoucherViewer() {
  const { token } = useParams<{ token: string }>();
  const [voucherData, setVoucherData] = useState<any>(null);
  const [qrJwt, setQrJwt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(QR_INTERVAL);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isRenewing, setIsRenewing] = useState<boolean>(false);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Carrega dados do voucher de múltiplas fontes (LocalStorage, Backend API, Supabase)
  const loadVoucher = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);

      const cleanToken = token.trim();

      // --- CAMADA 1: Busca no LocalStorage (Cache Instantâneo e Testes Locais) ---
      try {
        // Busca direta pela chave do token
        const directCached = localStorage.getItem(`voucher_token_${cleanToken}`);
        if (directCached) {
          const v = JSON.parse(directCached);
          if (v && (v.public_token === cleanToken || v.id === cleanToken)) {
            setVoucherData({
              id: v.id,
              public_token: v.public_token || cleanToken,
              status: v.status || 'CRIADO',
              valor: Number(v.valor) || 40.0,
              beneficiario_nome: v.beneficiario_nome || 'Colaborador',
              beneficiario_whatsapp: v.beneficiario_whatsapp || '',
              validade_fim: v.validade_fim || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              campanha_nome: v.voucher_campanhas?.nome || v.campanha_nome || 'Benefício Corporativo',
              campanha_descricao: v.voucher_campanhas?.descricao || v.campanha_descricao || 'Apresente este voucher no caixa para obter seu desconto.',
              empresa_razao_social: v.voucher_empresas_parceiras?.razao_social || v.empresa_razao_social || 'Empresa Parceira',
              empresa_nome_fantasia: v.voucher_empresas_parceiras?.nome_fantasia || v.empresa_nome_fantasia,
              horarios_permitidos: v.voucher_campanhas?.horarios_permitidos || v.horarios_permitidos,
              data_resgate: v.data_resgate
            });
            setQrJwt(v.public_token || cleanToken);
            setCountdown(QR_INTERVAL);
            setLoading(false);
            return;
          }
        }

        // Varredura em todas as listas de vouchers salvas no localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('voucher_items_') || key.startsWith('vouchers_'))) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const found = list.find((item: any) => item.public_token === cleanToken || item.id === cleanToken);
                if (found) {
                  setVoucherData({
                    id: found.id,
                    public_token: found.public_token || cleanToken,
                    status: found.status || 'CRIADO',
                    valor: Number(found.valor) || 40.0,
                    beneficiario_nome: found.beneficiario_nome || 'Colaborador',
                    beneficiario_whatsapp: found.beneficiario_whatsapp || '',
                    validade_fim: found.validade_fim || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    campanha_nome: found.voucher_campanhas?.nome || found.campanha_nome || 'Benefício Corporativo',
                    campanha_descricao: found.voucher_campanhas?.descricao || found.campanha_descricao || 'Apresente este voucher no caixa para obter seu desconto.',
                    empresa_razao_social: found.voucher_empresas_parceiras?.razao_social || found.empresa_razao_social || 'Empresa Parceira',
                    empresa_nome_fantasia: found.voucher_empresas_parceiras?.nome_fantasia || found.empresa_nome_fantasia,
                    horarios_permitidos: found.voucher_campanhas?.horarios_permitidos || found.horarios_permitidos,
                    data_resgate: found.data_resgate
                  });
                  setQrJwt(found.public_token || cleanToken);
                  setCountdown(QR_INTERVAL);
                  setLoading(false);

                  // Grava na chave direta para próximos acessos
                  localStorage.setItem(`voucher_token_${cleanToken}`, JSON.stringify(found));
                  return;
                }
              }
            }
          }
        }
      } catch (localErr) {
        console.warn('[VoucherViewer] Erro ao ler do localStorage:', localErr);
      }

      // --- CAMADA 2: Busca via Backend REST Engine ---
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/public/${cleanToken}?_t=${Date.now()}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.voucher) {
            setVoucherData(json.voucher);
            setQrJwt(json.qrJwt || json.voucher.public_token);
            setCountdown(json.expiresInSeconds || QR_INTERVAL);
            setLoading(false);
            localStorage.setItem(`voucher_token_${cleanToken}`, JSON.stringify(json.voucher));
            return;
          }
        }
      } catch (apiErr) {
        console.warn('[VoucherViewer] Backend não respondeu, tentando Supabase direto:', apiErr);
      }

      // --- CAMADA 3: Busca no Banco Supabase ---
      try {
        const { data, error: dbErr } = await supabase
          .from('vouchers')
          .select('*, voucher_campanhas(*), voucher_empresas_parceiras(*), voucher_colaboradores(*)')
          .eq('public_token', cleanToken)
          .maybeSingle();

        if (!dbErr && data) {
          const formatted = {
            id: data.id,
            public_token: data.public_token,
            status: data.status,
            valor: data.valor,
            beneficiario_nome: data.beneficiario_nome || data.voucher_colaboradores?.nome || 'Colaborador',
            beneficiario_whatsapp: data.beneficiario_whatsapp || '',
            validade_fim: data.validade_fim,
            campanha_nome: data.voucher_campanhas?.nome || 'Campanha Corporativa',
            campanha_descricao: data.voucher_campanhas?.descricao,
            empresa_razao_social: data.voucher_empresas_parceiras?.razao_social || 'Empresa Parceira',
            empresa_nome_fantasia: data.voucher_empresas_parceiras?.nome_fantasia,
            horarios_permitidos: data.voucher_campanhas?.horarios_permitidos,
            data_resgate: data.data_resgate
          };
          setVoucherData(formatted);
          setQrJwt(data.public_token);
          setCountdown(QR_INTERVAL);
          setLoading(false);
          localStorage.setItem(`voucher_token_${cleanToken}`, JSON.stringify(formatted));
          return;
        }
      } catch (supabaseErr) {
        console.warn('[VoucherViewer] Erro na consulta do Supabase:', supabaseErr);
      }

      throw new Error('Voucher não localizado ou inválido.');
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar voucher.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // 2. Renova o JWT do QR Code dinâmico a cada 30 segundos
  const renewQrToken = useCallback(async () => {
    if (!token || voucherData?.status === 'UTILIZADO' || voucherData?.status === 'CANCELADO' || voucherData?.status === 'EXPIRADO') return;
    try {
      setIsRenewing(true);
      const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/public/${token}/token`, {
        method: 'POST'
      });
      if (res.ok) {
        const json = await res.json();
        if (json.qrJwt) {
          setQrJwt(json.qrJwt);
          setCountdown(QR_INTERVAL);
        }
      }
    } catch (e) {
      console.warn('Erro ao renovar token QR:', e);
    } finally {
      setIsRenewing(false);
    }
  }, [token, voucherData?.status]);

  useEffect(() => {
    loadVoucher();
  }, [loadVoucher]);

  // 3. Loop do Countdown
  useEffect(() => {
    if (voucherData?.status === 'UTILIZADO' || voucherData?.status === 'CANCELADO') return;

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          renewQrToken();
          return QR_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [renewQrToken, voucherData?.status]);

  // 4. Realtime no Supabase para escutar quando o atendente validar/utilizar
  useEffect(() => {
    if (!voucherData?.id) return;

    const channel = supabase
      .channel(`public:vouchers:viewer:${voucherData.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vouchers', filter: `id=eq.${voucherData.id}` },
        (payload: any) => {
          const updated = payload.new;
          if (updated) {
            setVoucherData((prev: any) => ({
              ...prev,
              status: updated.status,
              data_resgate: updated.data_resgate,
              atendente_id: updated.atendente_id
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [voucherData?.id]);

  const copyVoucherLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 bg-[#111b21] p-8 rounded-[32px] border border-white/10 shadow-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <span className="text-xs font-bold text-slate-400">Carregando Voucher Digital...</span>
        </div>
      </div>
    );
  }

  if (error || !voucherData) {
    return (
      <div className="min-h-screen w-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#111b21] border border-rose-500/30 p-7 rounded-[32px] text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-black text-white">Voucher Não Encontrado</h2>
          <p className="text-xs text-slate-400">{error || 'O link informado pode estar incorreto ou expirado.'}</p>
        </div>
      </div>
    );
  }

  const isUtilizado = voucherData.status === 'UTILIZADO';
  const isValidado = voucherData.status === 'VALIDADO';
  const isExpirado = voucherData.status === 'EXPIRADO' || new Date(voucherData.validade_fim) < new Date();
  const valorFormatado = Number(voucherData.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="min-h-screen w-full bg-[#090e11] text-slate-100 flex flex-col items-center justify-center p-3 sm:p-5 select-none font-sans relative overflow-x-hidden">
      
      {/* Luzes de Fundo */}
      <div className="fixed -top-32 -left-32 w-80 h-80 bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed -bottom-32 -right-32 w-80 h-80 bg-teal-500/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-[#111b21]/95 border border-white/10 rounded-[32px] p-5 sm:p-7 shadow-2xl backdrop-blur-2xl space-y-5 relative z-10 my-auto">
        
        {/* Header do Voucher */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Ticket className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-black text-white uppercase tracking-wider">Voucher Digital</h1>
              <p className="text-[11px] text-emerald-400 font-bold">{voucherData.empresa_nome_fantasia || voucherData.empresa_razao_social}</p>
            </div>
          </div>

          <button
            onClick={copyVoucherLink}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 transition-all cursor-pointer"
            title="Copiar link"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Card de Informações Principais */}
        <div className="bg-[#0c1317] p-4 rounded-2xl border border-white/10 space-y-3 text-left">
          
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Beneficiário</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
              isUtilizado
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : isValidado
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                : isExpirado
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}>
              {isUtilizado ? 'UTILIZADO / RESGATADO' : isValidado ? 'EM VALIDAÇÃO NO CAIXA' : isExpirado ? 'EXPIRADO' : 'VÁLIDO PARA RESGATE'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-400" />
            <strong className="text-white text-sm font-black">{voucherData.beneficiario_nome}</strong>
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 block">Valor do Benefício</span>
              <span className="text-xl font-black text-emerald-400">{valorFormatado}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 block">Código</span>
              <span className="text-xs font-mono font-black text-white bg-white/10 px-2 py-1 rounded-lg">
                {voucherData.public_token}
              </span>
            </div>
          </div>

        </div>

        {/* QR Code Dinâmico ou Mensagem de Utilizado */}
        {isUtilizado ? (
          <div className="p-6 bg-purple-500/10 border border-purple-500/30 rounded-[28px] text-center space-y-3 animate-in fade-in">
            <div className="w-14 h-14 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center justify-center mx-auto shadow-lg shadow-purple-500/20">
              <CheckCircle2 className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-base font-black text-white">Voucher Resgatado com Sucesso!</h3>
            <p className="text-xs text-slate-300">
              Este benefício já foi validado e baixado no caixa em{' '}
              <strong className="text-purple-300">{new Date(voucherData.data_resgate || Date.now()).toLocaleString('pt-BR')}</strong>.
            </p>
          </div>
        ) : (
          <div className="bg-[#0c1317] p-5 rounded-[28px] border border-white/10 flex flex-col items-center justify-center space-y-3 text-center shadow-inner">
            
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>Apresente este QR Code no Balcão</span>
            </span>

            {/* QR Code com borda neon */}
            <div className="p-3.5 bg-white rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.5)] ring-4 ring-emerald-500/30 transition-all hover:scale-105">
              <QRCode value={qrJwt || voucherData.public_token} size={180} />
            </div>

            {/* Barra e Contador de Auto-Renovação Antifraude */}
            <div className="w-full space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span className="flex items-center gap-1">
                  <RotateCw className={`w-3 h-3 text-emerald-400 ${isRenewing ? 'animate-spin' : ''}`} />
                  <span>QR Code Dinâmico Antifraude</span>
                </span>
                <span className="font-mono text-emerald-300">{countdown}s</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${(countdown / QR_INTERVAL) * 100}%` }}
                />
              </div>
            </div>

          </div>
        )}

        {/* Regras e Validade */}
        <div className="bg-[#0c1317] p-3.5 rounded-2xl border border-white/5 text-left text-[11px] space-y-2 text-slate-400">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Validade: <strong className="text-slate-200">{new Date(voucherData.validade_fim).toLocaleDateString('pt-BR')}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>Campanha: <strong className="text-slate-200">{voucherData.campanha_nome}</strong></span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-slate-500 font-bold flex items-center justify-between pt-1">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Autenticação Criptográfica JWT</span>
          </span>
          <span>X-Point Voucher Gestão</span>
        </div>

      </div>

    </div>
  );
}
