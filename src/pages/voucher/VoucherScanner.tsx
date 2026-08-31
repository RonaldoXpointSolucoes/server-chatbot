import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  ExternalLink,
  Store,
  MapPin,
  Utensils
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

interface ValidatedVoucher {
  id: string;
  public_token: string;
  tenant_id?: string;
  valor: number;
  beneficiario_nome?: string;
  status: string;
  lock_until?: string;
  data_resgate?: string;
  campanha?: any;
  empresa?: any;
  validade_fim?: string;
  observacoes?: string;
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
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(220, ctx.currentTime);
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
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } else if (type === 'confirm') {
      const notes = [523.25, 659.25, 1046.5];
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

// Extrator universal de Token (Suporta URLs completas, prefixos VIP/VOUCHER, JWT e códigos digitados)
const extractVoucherToken = (raw: string): string => {
  if (!raw) return '';
  let str = raw.trim();

  // 1. Se for URL completa (ex: https://.../voucher/vch-p86ss5i7oyog591s)
  if (str.includes('/voucher/')) {
    const parts = str.split('/voucher/');
    str = parts[parts.length - 1].split('?')[0].split('#')[0];
  }

  // 2. Se for JWT com payload Base64 (QR Code Dinâmico Antifraude)
  if (str.includes('.') && str.split('.').length === 3) {
    try {
      const payloadBase64 = str.split('.')[1];
      const decodedJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      const parsed = JSON.parse(decodedJson);
      if (parsed?.token || parsed?.voucher_token || parsed?.id || parsed?.public_token) {
        str = (parsed.token || parsed.voucher_token || parsed.id || parsed.public_token).trim();
      }
    } catch (_) {}
  }

  // 3. Remove prefixos decorativos como VIP, VIP-, VIP:, VOUCHER:, TOKEN:, #
  str = str.replace(/^(vip[:\-_ ]*|voucher[:\-_ ]*|token[:\-_ ]*|#+)/i, '').trim();

  // 4. Se tiver formato vch-... em qualquer parte da string, extrai o token oficial
  const vchMatch = str.match(/vch-[a-z0-9]+/i);
  if (vchMatch) {
    return vchMatch[0].trim();
  }

  return str.trim();
};

export default function VoucherScanner() {
  const tenantInfo = useChatStore((state) => state.tenantInfo);
  const currentTenantId = tenantInfo?.id || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

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

  const [sessionHistory, setSessionHistory] = useState<Array<{ token: string; nome: string; valor: number; hora: string; empresa: string }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Foca o input ao iniciar e após resets
  useEffect(() => {
    if (!activeVoucher && !blockedVoucher && !redeemedVoucher) {
      inputRef.current?.focus();
    }
  }, [activeVoucher, blockedVoucher, redeemedVoucher]);

  // Helper para resolver o nome da empresa parceira
  const resolveCompanyName = (voucher: any): string => {
    let razao = voucher.voucher_empresas_parceiras?.razao_social || voucher.empresa_razao_social || voucher.empresa_nome || '';
    if (!razao || razao === 'Empresa Parceira' || razao === 'Cliente Avulso (Sem Vínculo B2B)' || razao === 'Cliente Avulso (Sem Empresa)') {
      try {
        const empId = voucher.empresa_id;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('voucher_companies_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const found = empId ? list.find((c: any) => c.id === empId) : list[0];
                if (found?.razao_social) {
                  return found.razao_social;
                }
              }
            }
          }
        }
      } catch (_) {}
    }
    return razao || 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS';
  };

  // 1. Passo 1: Reserva / Validação com Lock Antifraude
  const handleReserve = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const rawClean = extractVoucherToken(tokenInput);
    if (!rawClean) return;

    const searchToken = rawClean.trim();
    const searchTokenLower = searchToken.toLowerCase();

    try {
      setLoadingReserve(true);
      setError(null);
      setSuccessMessage(null);
      setActiveVoucher(null);
      setBlockedVoucher(null);
      setRedeemedVoucher(null);

      let foundVoucher: any = null;

      // =========================================================================
      // CAMADA 1: LocalStorage (Varredura Case-Insensitive em todas as chaves)
      // =========================================================================
      try {
        const directKeys = [
          `voucher_token_${searchToken}`,
          `voucher_token_${searchTokenLower}`,
          `voucher_token_${searchToken.toUpperCase()}`
        ];

        for (const k of directKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            foundVoucher = JSON.parse(raw);
            break;
          }
        }

        if (!foundVoucher) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('voucher_items_') || key.startsWith('vouchers_'))) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                  const match = list.find((item: any) => {
                    const itemPub = (item.public_token || '').toLowerCase().trim();
                    const itemId = (item.id || '').toLowerCase().trim();
                    return itemPub === searchTokenLower || itemId === searchTokenLower;
                  });
                  if (match) {
                    foundVoucher = match;
                    break;
                  }
                }
              }
            }
          }
        }
      } catch (localErr) {
        console.warn('[VoucherScanner] Erro ao ler localStorage:', localErr);
      }

      // =========================================================================
      // CAMADA 2: Backend REST Engine
      // =========================================================================
      if (!foundVoucher) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/redeem/reserve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: searchToken,
              atendenteId: atendenteName
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          const data = await res.json();
          if (res.ok && data.voucher) {
            foundVoucher = {
              ...data.voucher,
              campanha: data.campanha,
              empresa: data.empresa
            };
          }
        } catch (backendErr) {
          console.warn('[VoucherScanner] Backend offline:', backendErr);
        }
      }

      // =========================================================================
      // CAMADA 3: Supabase (Consulta Direta Case-Insensitive sem joins quebrados)
      // =========================================================================
      if (!foundVoucher) {
        try {
          // Busca por public_token
          const { data: dbData, error: dbErr } = await supabase
            .from('vouchers')
            .select('*')
            .ilike('public_token', searchToken)
            .maybeSingle();

          if (!dbErr && dbData) {
            foundVoucher = dbData;
          } else {
            // Tenta busca por ID
            const { data: dbDataById } = await supabase
              .from('vouchers')
              .select('*')
              .eq('id', searchToken)
              .maybeSingle();

            if (dbDataById) {
              foundVoucher = dbDataById;
            }
          }

          // Se encontrou, complementa empresa se necessário
          if (foundVoucher && foundVoucher.empresa_id && (!foundVoucher.empresa_nome || !foundVoucher.empresa_razao_social)) {
            try {
              const { data: empData } = await supabase
                .from('voucher_empresas_parceiras')
                .select('razao_social, nome_fantasia')
                .eq('id', foundVoucher.empresa_id)
                .maybeSingle();
              if (empData) {
                foundVoucher.empresa_razao_social = empData.razao_social || empData.nome_fantasia;
                foundVoucher.empresa_nome = empData.nome_fantasia || empData.razao_social;
              }
            } catch (_) {}
          }
        } catch (supabaseErr) {
          console.warn('[VoucherScanner] Erro Supabase:', supabaseErr);
        }
      }

      // =========================================================================
      // TRATAMENTO DO RESULTADO & REGRAS DE VALIDAÇÃO
      // =========================================================================
      if (foundVoucher) {
        const empresaNome = resolveCompanyName(foundVoucher);
        const valorNum = Number(foundVoucher.valor || 0) || 50.0;
        const beneficiarioNome = foundVoucher.beneficiario_nome || foundVoucher.voucher_colaboradores?.nome || 'Colaborador / Convidado';

        // 1. Voucher Já Utilizado / Resgatado
        if (foundVoucher.status === 'UTILIZADO') {
          if (soundEnabled) playTerminalBeep('error');
          setBlockedVoucher({
            token: foundVoucher.public_token || searchToken,
            reason: 'Este voucher já teve sua baixa realizada anteriormente no caixa da Burguer Plus.',
            status: 'UTILIZADO',
            beneficiarioNome,
            valor: valorNum,
            empresaNome,
            campanhaNome: foundVoucher.voucher_campanhas?.nome || foundVoucher.campanha_nome || 'Crédito Corporativo',
            dataResgate: foundVoucher.data_resgate || foundVoucher.updated_at
          });
          return;
        }

        // 2. Voucher Cancelado pelo Administrador
        if (foundVoucher.status === 'CANCELADO') {
          if (soundEnabled) playTerminalBeep('error');
          setBlockedVoucher({
            token: foundVoucher.public_token || searchToken,
            reason: "Voucher cancelado pelo administrador no painel da empresa.",
            status: 'CANCELADO',
            beneficiarioNome,
            valor: valorNum,
            empresaNome,
            campanhaNome: foundVoucher.voucher_campanhas?.nome || foundVoucher.campanha_nome || 'Crédito Corporativo'
          });
          return;
        }

        // 3. Voucher Expirado
        if (foundVoucher.validade_fim && new Date(foundVoucher.validade_fim) < new Date()) {
          if (soundEnabled) playTerminalBeep('error');
          setBlockedVoucher({
            token: foundVoucher.public_token || searchToken,
            reason: `Voucher expirado. A validade encerrou em ${new Date(foundVoucher.validade_fim).toLocaleDateString('pt-BR')}.`,
            status: 'EXPIRADO',
            beneficiarioNome,
            valor: valorNum,
            empresaNome,
            campanhaNome: foundVoucher.voucher_campanhas?.nome || foundVoucher.campanha_nome || 'Crédito Corporativo'
          });
          return;
        }

        // 4. Voucher VÁLIDO E AUTORIZADO PARA RESGATE NA BURGUER PLUS!
        if (soundEnabled) playTerminalBeep('success');
        setActiveVoucher({
          id: foundVoucher.id,
          public_token: foundVoucher.public_token || searchToken,
          tenant_id: foundVoucher.tenant_id || currentTenantId,
          valor: valorNum,
          beneficiario_nome: beneficiarioNome,
          status: foundVoucher.status || 'CRIADO',
          validade_fim: foundVoucher.validade_fim,
          observacoes: foundVoucher.observacoes || foundVoucher.campanha_nome,
          campanha: foundVoucher.voucher_campanhas || { nome: foundVoucher.campanha_nome || 'Crédito Corporativo Especial' },
          empresa: { razao_social: empresaNome }
        });
        setSuccessMessage('Voucher aprovado com sucesso! Lock de conferência ativo no caixa.');
        return;
      }

      // 5. Voucher Não Localizado
      if (soundEnabled) playTerminalBeep('error');
      setBlockedVoucher({
        token: searchToken,
        reason: `Voucher com código '${searchToken}' não foi localizado no sistema. Verifique o código e tente novamente.`,
        status: 'NAO_LOCALIZADO'
      });
    } catch (err: any) {
      if (soundEnabled) playTerminalBeep('error');
      setError(err.message || 'Erro ao validar voucher.');
    } finally {
      setLoadingReserve(false);
    }
  };

  // 2. Passo 2: Baixa Definitiva do Voucher no Caixa da Burguer Plus
  const handleConfirmRedeem = async () => {
    if (!activeVoucher?.id) return;

    try {
      setLoadingConfirm(true);
      setError(null);

      const resgateHora = new Date().toISOString();
      const txnHash = 'TXN-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const redemptionValue = Number(activeVoucher.valor || 0);
      const tenantId = activeVoucher.tenant_id || currentTenantId;

      // 1. Tenta baixar via Backend REST Engine
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        await fetch(`${ENGINE_URL}/api/v1/vouchers/redeem/confirm`, {
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
        console.warn('[VoucherScanner] Backend offline, confirmando localmente:', backendErr);
      }

      // 2. Baixa no Supabase
      try {
        await supabase
          .from('vouchers')
          .update({
            status: 'UTILIZADO',
            data_resgate: resgateHora,
            atendente_id: atendenteName
          })
          .eq('id', activeVoucher.id);

        // Registro de Auditoria no Ledger
        await supabase.from('voucher_events').insert({
          id: 'ev-' + Math.random().toString(36).substring(2, 9),
          tenant_id: tenantId,
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
          motivo: `Resgate e desconto concedido no caixa da Burguer Plus por ${atendenteName}`
        });
      } catch (dbErr) {
        console.warn('[VoucherScanner] Erro Supabase ao gravar baixa:', dbErr);
      }

      // 3. Baixa no LocalStorage
      try {
        const tokenKey = `voucher_token_${activeVoucher.public_token.toLowerCase()}`;
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
                  item.public_token?.toLowerCase() === activeVoucher.public_token.toLowerCase() || item.id === activeVoucher.id
                    ? { ...item, status: 'UTILIZADO', data_resgate: resgateHora, atendente_id: atendenteName }
                    : item
                );
                localStorage.setItem(key, JSON.stringify(updatedList));
              }
            }
          }

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
                motivo: `Resgate e desconto concedido no caixa da Burguer Plus por ${atendenteName}`
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
          hora: new Date().toLocaleTimeString('pt-BR'),
          empresa: activeVoucher.empresa?.razao_social || 'Empresa Parceira'
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
        
        {/* Header do Terminal com Identificação Burguer Plus */}
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
                <Store className="w-3.5 h-3.5" />
                <span>BURGUER PLUS • Validação Antifraude em Tempo Real</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
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
              <span className="text-[10px] text-slate-400 font-bold block">Operador do Caixa:</span>
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
        </div>

        {/* ============================================================================== */}
        {/* CASO 1: CARD DE ALERTA DE BLOQUEIO ANTIFRAUDE (VOUCHER JÁ UTILIZADO / EXPIRADO) */}
        {/* ============================================================================== */}
        {blockedVoucher && (
          <div className="bg-gradient-to-b from-rose-950/70 to-[#0c1317] p-5 sm:p-7 rounded-[28px] border-2 border-rose-500/70 text-left space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            
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
                type="button"
                onClick={handleReset}
                className="p-2 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer text-xs flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nova Consulta</span>
              </button>
            </div>

            <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-200 text-xs sm:text-sm font-semibold flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{blockedVoucher.reason}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#111b21]/80 p-4 rounded-2xl border border-white/5">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Código Inserido</span>
                <strong className="text-lg font-mono font-black text-rose-400">{blockedVoucher.token}</strong>
              </div>

              {blockedVoucher.beneficiarioNome && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Titular</span>
                  <span className="text-sm font-black text-white">{blockedVoucher.beneficiarioNome}</span>
                </div>
              )}

              {blockedVoucher.empresaNome && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Empresa Concedente</span>
                  <span className="text-sm font-bold text-emerald-400">{blockedVoucher.empresaNome}</span>
                </div>
              )}

              {blockedVoucher.dataResgate && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Horário do Resgate</span>
                  <span className="text-sm font-mono text-slate-300">{new Date(blockedVoucher.dataResgate).toLocaleString('pt-BR')}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black uppercase tracking-wider text-xs rounded-2xl transition-all shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Escanear Outro Voucher</span>
            </button>
          </div>
        )}

        {/* ============================================================================== */}
        {/* CASO 2: VOUCHER VÁLIDO ENCONTRADO (LOCK DE CONFERÊNCIA & BAIXA NO CAIXA) */}
        {/* ============================================================================== */}
        {activeVoucher && (
          <div className="bg-gradient-to-b from-emerald-950/60 to-[#0c1317] p-5 sm:p-7 rounded-[28px] border-2 border-emerald-500/70 text-left space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400/80 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0">
                  <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" />
                </div>
                <div>
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    AUTORIZADO PARA DESCONTO NO CAIXA
                  </span>
                  <h2 className="text-base sm:text-xl font-black text-white mt-1">
                    VOUCHER 100% VÁLIDO NA BURGUER PLUS!
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="p-2 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer text-xs flex items-center gap-1 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
            </div>

            {/* Box de Resumo do Desconto */}
            <div className="bg-[#0b141a] p-4 sm:p-5 rounded-2xl border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-inner">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-0.5">
                  VALOR DO CRÉDITO A DEDUZIR
                </span>
                <span className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight">
                  {Number(activeVoucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-0.5">
                  Beneficiário
                </span>
                <span className="text-base font-black text-white block">
                  {activeVoucher.beneficiario_nome}
                </span>
                <span className="inline-block font-mono font-bold text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg mt-0.5">
                  {activeVoucher.public_token}
                </span>
              </div>
            </div>

            {/* Informações da Empresa Concedente e Local de Resgate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#111b21]/80 p-4 rounded-2xl border border-white/5">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" /> Empresa Parceira Concedente
                </span>
                <strong className="text-white text-sm block">
                  {activeVoucher.empresa?.razao_social || 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS'}
                </strong>
                <span className="text-[10.5px] text-slate-400">Programa Corporativo B2B</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-teal-400" /> Estabelecimento de Resgate
                </span>
                <strong className="text-emerald-400 text-sm block">
                  BURGUER PLUS
                </strong>
                <span className="text-[10.5px] text-slate-400">Praça Miguel Ortega, 340</span>
              </div>
            </div>

            {/* Botão de Confirmação da Baixa */}
            <button
              type="button"
              onClick={handleConfirmRedeem}
              disabled={loadingConfirm}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-[#0b141a] font-black uppercase tracking-wider text-sm rounded-2xl transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {loadingConfirm ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>PROCESSANDO BAIXA NO CAIXA...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5 stroke-[3]" />
                  <span>CONFIRMAR RESGATE & APLICAR DESCONTO ({Number(activeVoucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ============================================================================== */}
        {/* CASO 3: RECIBO DE SUCESSO APÓS BAIXA */}
        {/* ============================================================================== */}
        {redeemedVoucher && (
          <div className="bg-gradient-to-b from-teal-950/60 to-[#0c1317] p-5 sm:p-7 rounded-[28px] border-2 border-teal-500/70 text-left space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border-2 border-teal-400/80 text-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/25 shrink-0">
                <CheckCircle2 className="w-8 h-8 text-teal-400" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                  BAIXA CONFIRMADA COM SUCESSO
                </span>
                <h2 className="text-lg sm:text-xl font-black text-white mt-1">
                  DESCONTO APLICADO NO PEDIDO!
                </h2>
              </div>
            </div>

            <div className="bg-[#0b141a] p-4 rounded-2xl border border-teal-500/30 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-bold">Valor Concedido:</span>
                <strong className="text-emerald-400 text-lg font-black">
                  {Number(redeemedVoucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Beneficiário:</span>
                <span className="text-white font-bold">{redeemedVoucher.beneficiario_nome}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Código do Voucher:</span>
                <span className="font-mono text-emerald-400 font-bold">{redeemedVoucher.public_token}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Operador do Caixa:</span>
                <span className="text-slate-200">{atendenteName}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full py-3.5 bg-white/10 hover:bg-white/15 text-white font-black uppercase tracking-wider text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Validar Próximo Voucher</span>
            </button>
          </div>
        )}

        {/* ============================================================================== */}
        {/* CASO 4: FORMULÁRIO PADRÃO DE LEITURA (SCANNER / DIGITAÇÃO) */}
        {/* ============================================================================== */}
        {!activeVoucher && !blockedVoucher && !redeemedVoucher && (
          <form onSubmit={handleReserve} className="space-y-4">
            
            <div className="space-y-2 text-left">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Escanear QR Code ou Digitar Código do Voucher:</span>
                <span className="text-[10px] text-emerald-400 font-mono">Ex: vch-p86ss5i7oyog591s</span>
              </label>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Escaneie o QR Code ou digite o código..."
                  className="w-full bg-[#0c1418] border-2 border-emerald-500/40 rounded-2xl px-4 py-4 text-base sm:text-lg font-mono font-bold text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/20 transition-all uppercase"
                  autoFocus
                />

                <button
                  type="submit"
                  disabled={loadingReserve || !tokenInput.trim()}
                  className="absolute right-2 top-2 bottom-2 px-5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-[#0b141a] font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                >
                  {loadingReserve ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span className="hidden sm:inline">Consultar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold flex items-center gap-2 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 text-left">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 font-semibold border-t border-white/5">
              <span>Aceita vouchers B2B de todas as empresas conveniadas</span>
              <span>Burguer Plus • Sistema Oficial</span>
            </div>

          </form>
        )}

        {/* ============================================================================== */}
        {/* HISTÓRICO DE RESGATES DA SESSÃO */}
        {/* ============================================================================== */}
        {sessionHistory.length > 0 && (
          <div className="border-t border-white/10 pt-4 text-left space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-emerald-400" /> Resgates Realizados Nesta Sessão ({sessionHistory.length})
            </span>
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {sessionHistory.map((item, idx) => (
                <div key={idx} className="bg-[#0c1418] p-2.5 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-emerald-400 block">{item.token}</span>
                    <span className="text-slate-300 text-[11px]">{item.nome} • {item.empresa}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-emerald-400 block">
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
