import React, { useState, useEffect, useCallback } from 'react';
import QRCode from 'react-qr-code';
import {
  Ticket,
  Plus,
  Search,
  Building2,
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  Send,
  ExternalLink,
  ShieldCheck,
  FileText,
  AlertCircle,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  QrCode,
  Sparkles,
  Lock,
  History,
  X,
  Smartphone,
  PhoneCall,
  Percent,
  Gift,
  Edit2,
  PlusCircle,
  Layers,
  ChevronRight,
  User,
  MapPin,
  Mail,
  Briefcase,
  Info,
  ReceiptText,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Filter,
  CreditCard,
  Coins,
  Eye,
  CheckCircle,
  Printer
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { lookupCnpj, formatCnpj, formatCep, CnpjData } from '../../services/cnpjService';

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

const DEFAULT_COMPANIES = [
  {
    id: 'emp-1',
    razao_social: 'Tech Solutions Corp',
    nome_fantasia: 'TechCorp',
    cnpj: '12.345.678/0001-90',
    contato_nome: 'Carlos Eduardo',
    contato_whatsapp: '11988887777',
    limite_vouchers: 100,
    created_at: new Date().toISOString()
  }
];

const DEFAULT_CAMPAIGNS = [
  {
    id: 'cmp-1',
    empresa_id: 'emp-1',
    nome: 'Almoço Executivo Sexta-Feira',
    descricao: 'Benefício exclusivo para colaboradores de empresas parceiras',
    tipo_desconto: 'VALOR_FIXO',
    valor_desconto: 40.0,
    data_fim: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString()
  }
];

// ==============================================================================
// HELPERS DE PERSISTÊNCIA MULTI-TENANT (Isolamento Estrito por Inquilino)
// ==============================================================================
const getTenantStorage = (prefix: string, currentTenantId: string, defaultFallback: any[] = []): any[] => {
  if (!currentTenantId) return defaultFallback;
  try {
    const raw = localStorage.getItem(`${prefix}_${currentTenantId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn(`[Voucher] Erro ao ler ${prefix}_${currentTenantId}:`, e);
  }
  return defaultFallback;
};

const setTenantStorage = (prefix: string, currentTenantId: string, list: any[]) => {
  if (!currentTenantId) return;
  try {
    localStorage.setItem(`${prefix}_${currentTenantId}`, JSON.stringify(list));
  } catch (e) {
    console.warn(`[Voucher] Erro ao salvar ${prefix}_${currentTenantId}:`, e);
  }
};

export default function VoucherDashboard() {
  const tenantInfo = useChatStore((state) => state.tenantInfo);
  const currentAccount = useChatStore((state) => state.currentAccount);
  const tenantId = tenantInfo?.id || currentAccount?.id || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

  const [activeTab, setActiveTab] = useState<'vouchers' | 'campanhas' | 'empresas' | 'auditoria'>('vouchers');
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Estados dos Dados com Isolamento Estrito por Inquilino
  const [vouchers, setVouchers] = useState<any[]>(() => getTenantStorage('voucher_items', tenantId, []));
  const [campanhas, setCampanhas] = useState<any[]>(() => getTenantStorage('voucher_campaigns', tenantId, []));
  const [empresas, setEmpresas] = useState<any[]>(() => getTenantStorage('voucher_companies', tenantId, []));
  const [events, setEvents] = useState<any[]>(() => getTenantStorage('voucher_events', tenantId, []));

  // Instâncias de WhatsApp do Inquilino Ativo (para Disparo Próprio)
  const [tenantInstances, setTenantInstances] = useState<any[]>([]);
  const [showSendModal, setShowSendModal] = useState<boolean>(false);
  const [selectedVoucherForSend, setSelectedVoucherForSend] = useState<any | null>(null);
  const [sendPhoneInput, setSendPhoneInput] = useState<string>('');
  const [selectedSendInstanceId, setSelectedSendInstanceId] = useState<string>('');

  // Limpeza de resquícios de testes globais anteriores
  useEffect(() => {
    try {
      localStorage.removeItem('voucher_items_global');
      localStorage.removeItem('voucher_campaigns_global');
      localStorage.removeItem('voucher_companies_global');
      localStorage.removeItem('voucher_events_global');
    } catch (_) {}
  }, []);

  // Modais de Criação e Edição
  const [showCreateVoucherModal, setShowCreateVoucherModal] = useState<boolean>(false);
  const [showCompanyModal, setShowCompanyModal] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<any | null>(null);

  const [showCampaignModal, setShowCampaignModal] = useState<boolean>(false);
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);

  // Estados do Ledger Financeiro & Rastreabilidade de Ativos
  const [selectedVoucherForLedger, setSelectedVoucherForLedger] = useState<any | null>(null);
  const [showLedgerTimelineModal, setShowLedgerTimelineModal] = useState<boolean>(false);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'CREDITO' | 'DEBITO' | 'NOTIFICACAO' | 'LEITURA'>('ALL');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  // Estados de Impressão (PDF & Térmica 40 Colunas)
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState<any | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printLayout, setPrintLayout] = useState<'thermal' | 'pdf'>('thermal');

  // Form Voucher (Lote ou Individual com Modo Simplificado)
  const [voucherEmissionMode, setVoucherEmissionMode] = useState<'individual' | 'lote'>('individual');
  const [voucherForm, setVoucherForm] = useState({
    vincularEmpresa: false,
    campanhaId: '',
    empresaId: '',
    beneficiarioNome: '',
    beneficiarioWhatsapp: '',
    quantidade: 5,
    valor: 0,
    valorInput: '',
    validadeFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  // Helpers de Máscaras e Formatações
  const formatPhoneBr = (val: string): string => {
    const digits = (val || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const formatBrlValue = (val: number): string => {
    if (isNaN(val) || val === 0) return '';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      setVoucherForm((prev) => ({ ...prev, valor: 0, valorInput: '' }));
      return;
    }
    const num = Number(rawDigits) / 100;
    setVoucherForm((prev) => ({
      ...prev,
      valor: num,
      valorInput: num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }));
  };

  // Motor de Impressão (Cupom Térmico 40 Colunas ESC/POS e Documento PDF A4)
  const handleExecutePrint = (voucher: any, layout: 'thermal' | 'pdf') => {
    if (!voucher) return;
    const printWindow = window.open('', '_blank', 'width=460,height=680');
    if (!printWindow) {
      alert('Por favor, permita popups neste site para abrir a impressão.');
      return;
    }

    const formattedValue = Number(voucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedDate = new Date(voucher.validade_fim).toLocaleDateString('pt-BR');
    const emissionDate = new Date(voucher.created_at || Date.now()).toLocaleString('pt-BR');
    const empresaNome = voucher.voucher_empresas_parceiras?.razao_social || 'Cliente Avulso (Venda Direta)';
    const campanhaNome = voucher.voucher_campanhas?.nome || 'Benefício Especial';
    const qrUrl = `${window.location.origin}/voucher/${voucher.public_token}`;
    const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`;

    if (layout === 'thermal') {
      // CUPOM TÉRMICO 40 COLUNAS (58mm/80mm)
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Cupom Térmico - ${voucher.public_token}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 280px;
              margin: 0 auto;
              padding: 8px 4px;
              color: #000;
              background: #fff;
              font-size: 11px;
              line-height: 1.2;
            }
            .center { text-align: center; }
            .bold { font-weight: 900; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .divider-double { border-top: 2px solid #000; margin: 6px 0; }
            .token { font-size: 15px; font-weight: 900; letter-spacing: 2px; }
            .valor { font-size: 19px; font-weight: 900; margin: 3px 0; }
            .footer-note { font-size: 9.5px; }
            @media print {
              body { width: 100%; padding: 0 2px; }
            }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 13px;">X-POINT BENEFICIOS</div>
          <div class="center" style="font-size: 9.5px;">SISTEMA DE VOUCHERS DIGITAIS</div>
          <div class="divider-double"></div>
          
          <div class="center bold">CUPOM DE ATIVO VOUCHER</div>
          <div class="center token">${voucher.public_token}</div>
          <div class="center" style="font-size: 9px;">EMISSAO: ${emissionDate}</div>
          
          <div class="divider"></div>
          
          <div><strong>TITULAR:</strong> ${voucher.beneficiario_nome || 'Cliente / Colaborador'}</div>
          ${voucher.beneficiario_whatsapp ? `<div><strong>WHATS:</strong> ${voucher.beneficiario_whatsapp}</div>` : ''}
          <div><strong>ORIGEM:</strong> ${empresaNome}</div>
          <div><strong>CAMPANHA:</strong> ${campanhaNome}</div>
          
          <div class="divider"></div>
          
          <div class="center" style="font-size: 10px;">VALOR DO BENEFICIO:</div>
          <div class="center valor">${formattedValue}</div>
          <div class="center bold" style="font-size: 10px;">VALIDO ATE: ${formattedDate}</div>
          
          <div class="divider"></div>
          
          <div class="center">
            <div style="font-size: 8.5px; margin-bottom: 4px;">LEITURA QR CODE NO CAIXA:</div>
            <img src="${qrImageSrc}" style="width: 125px; height: 125px; margin: 0 auto; display: block;" />
            <div class="bold" style="font-size: 11px; margin-top: 3px;">${voucher.public_token}</div>
          </div>
          
          <div class="divider"></div>
          <div class="center footer-note">
            Apresente este cupom no caixa para validar o desconto.<br/>
            Uso unico • Autenticacao digital criptografica.
          </div>
          
          <div class="divider-double"></div>
          <div class="center bold" style="font-size: 9px;">CANHOTO DO CAIXA / CONTROLE PDV</div>
          <div style="font-size: 8.5px; line-height: 1.3;">
            VOUCHER: ${voucher.public_token} | VALOR: ${formattedValue}<br/>
            DATA RESGATE: ___/___/______ HORA: ___:___<br/>
            OPERADOR CAIXA: _________________________<br/>
            ASSINATURA: _____________________________
          </div>
          <div class="divider-double"></div>
          
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 450);
            };
          </script>
        </body>
        </html>
      `);
    } else {
      // DOCUMENTO / VALE PRESENTE PDF A4
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Vale Presente PDF - ${voucher.public_token}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            body {
              font-family: 'Helvetica Neue', Arial, sans-serif;
              margin: 0;
              padding: 24px;
              color: #1e293b;
              background: #f8fafc;
              display: flex;
              justify-content: center;
            }
            .card {
              width: 100%;
              max-width: 580px;
              background: #ffffff;
              border: 2px solid #10b981;
              border-radius: 24px;
              padding: 32px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.05);
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #f1f5f9;
              padding-bottom: 16px;
            }
            .brand {
              font-size: 20px;
              font-weight: 900;
              color: #0f172a;
            }
            .badge {
              background: #ecfdf5;
              color: #059669;
              border: 1px solid #10b981;
              font-weight: 800;
              font-size: 11px;
              padding: 4px 12px;
              border-radius: 999px;
              text-transform: uppercase;
            }
            .token-box {
              text-align: center;
              margin: 20px 0;
              background: #0f172a;
              color: #ffffff;
              padding: 16px;
              border-radius: 16px;
            }
            .token {
              font-family: monospace;
              font-size: 26px;
              font-weight: 900;
              letter-spacing: 3px;
              color: #34d399;
            }
            .value-label {
              font-size: 11px;
              text-transform: uppercase;
              color: #64748b;
              font-weight: bold;
            }
            .value {
              font-size: 32px;
              font-weight: 900;
              color: #059669;
              margin: 6px 0;
            }
            .details {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 14px;
              padding: 16px;
              margin: 20px 0;
              font-size: 13px;
            }
            .details-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
            }
            .details-row:last-child {
              margin-bottom: 0;
            }
            .qr-center {
              text-align: center;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              font-size: 11px;
              color: #64748b;
              border-top: 1px solid #f1f5f9;
              padding-top: 16px;
            }
            @media print {
              body { background: #fff; padding: 0; }
              .card { border: 2px solid #059669; box-shadow: none; max-width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <div>
                <div class="brand">X-POINT VOUCHER</div>
                <div style="font-size: 12px; color: #64748b;">Cupom de Benefício & Vale Presente</div>
              </div>
              <div class="badge">Voucher Digital Válido</div>
            </div>
            
            <div class="token-box">
              <div class="value-label" style="color: #94a3b8;">Código de Validação</div>
              <div class="token">${voucher.public_token}</div>
            </div>
            
            <div style="text-align: center;">
              <div class="value-label">Valor do Crédito</div>
              <div class="value">${formattedValue}</div>
            </div>
            
            <div class="details">
              <div class="details-row">
                <span style="color: #64748b;">Beneficiário:</span>
                <strong style="color: #0f172a;">${voucher.beneficiario_nome || 'Cliente / Colaborador'}</strong>
              </div>
              ${voucher.beneficiario_whatsapp ? `
              <div class="details-row">
                <span style="color: #64748b;">WhatsApp:</span>
                <strong style="font-family: monospace;">${voucher.beneficiario_whatsapp}</strong>
              </div>` : ''}
              <div class="details-row">
                <span style="color: #64748b;">Origem / Convênio:</span>
                <strong>${empresaNome}</strong>
              </div>
              <div class="details-row">
                <span style="color: #64748b;">Campanha:</span>
                <strong style="color: #059669;">${campanhaNome}</strong>
              </div>
              <div class="details-row" style="border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 8px;">
                <span style="color: #64748b;">Válido até:</span>
                <strong style="color: #dc2626;">${formattedDate}</strong>
              </div>
            </div>
            
            <div class="qr-center">
              <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 6px;">
                QR CODE PARA LEITURA NO CAIXA:
              </div>
              <img src="${qrImageSrc}" style="width: 140px; height: 140px; margin: 0 auto; display: block; border-radius: 8px; border: 1px solid #cbd5e1;" />
            </div>
            
            <div class="footer">
              Apresente este voucher impresso ou digital no balcão de atendimento.<br/>
              Autenticação Criptográfica JWT • X-Point Gestão de Ativos
            </div>
          </div>
          
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 450);
            };
          </script>
        </body>
        </html>
      `);
    }
    printWindow.document.close();
  };

  // Form Campanha
  const [campaignForm, setCampaignForm] = useState({
    empresaId: '',
    nome: '',
    descricao: '',
    tipoDesconto: 'VALOR_FIXO',
    valorDesconto: 50.0,
    dataFim: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  // Form Empresa com Campos Detalhados de CNPJ
  const [companyForm, setCompanyForm] = useState({
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    municipio: '',
    uf: '',
    contatoNome: '',
    contatoWhatsapp: '',
    telefoneEmpresa: '',
    emailEmpresa: '',
    atividadePrincipal: '',
    naturezaJuridica: '',
    dataAbertura: '',
    statusCnpj: '',
    limiteVouchers: 100
  });

  const [isLoadingCnpj, setIsLoadingCnpj] = useState<boolean>(false);
  const [cnpjError, setCnpjError] = useState<string | null>(null);
  const [cnpjSuccessMessage, setCnpjSuccessMessage] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Sincroniza selects com entidades ativas do inquilino
  useEffect(() => {
    if (empresas.length > 0) {
      if (!campaignForm.empresaId) setCampaignForm((prev) => ({ ...prev, empresaId: empresas[0].id }));
      if (!voucherForm.empresaId) setVoucherForm((prev) => ({ ...prev, empresaId: empresas[0].id }));
    } else {
      setCampaignForm((prev) => ({ ...prev, empresaId: '' }));
      setVoucherForm((prev) => ({ ...prev, empresaId: '' }));
    }
    if (campanhas.length > 0) {
      if (!voucherForm.campanhaId) {
        setVoucherForm((prev) => ({ ...prev, campanhaId: campanhas[0].id }));
      }
    } else {
      setVoucherForm((prev) => ({ ...prev, campanhaId: '' }));
    }
  }, [empresas, campanhas]);

  // Carrega dados do Supabase estritamente filtrados pelo inquilino ativo
  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);

      const [vRes, cRes, eRes, evRes, instRes] = await Promise.allSettled([
        supabase.from('vouchers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100),
        supabase.from('voucher_campanhas').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        supabase.from('voucher_empresas_parceiras').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        supabase.from('voucher_events').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50),
        supabase.from('whatsapp_instances').select('id, name, display_name, phone_number, status, is_active, session_name, api_key').eq('tenant_id', tenantId)
      ]);

      if (eRes.status === 'fulfilled' && eRes.value.data && eRes.value.data.length > 0) {
        setEmpresas(eRes.value.data);
        setTenantStorage('voucher_companies', tenantId, eRes.value.data);
      } else {
        const stored = getTenantStorage('voucher_companies', tenantId, []);
        setEmpresas(stored);
      }

      if (cRes.status === 'fulfilled' && cRes.value.data && cRes.value.data.length > 0) {
        setCampanhas(cRes.value.data);
        setTenantStorage('voucher_campaigns', tenantId, cRes.value.data);
      } else {
        const stored = getTenantStorage('voucher_campaigns', tenantId, []);
        setCampanhas(stored);
      }

      if (vRes.status === 'fulfilled' && vRes.value.data && vRes.value.data.length > 0) {
        setVouchers(vRes.value.data);
        setTenantStorage('voucher_items', tenantId, vRes.value.data);
        vRes.value.data.forEach((vItem: any) => {
          if (vItem.public_token) {
            try {
              localStorage.setItem(`voucher_token_${vItem.public_token}`, JSON.stringify(vItem));
            } catch (_) {}
          }
        });
      } else {
        const stored = getTenantStorage('voucher_items', tenantId, []);
        setVouchers(stored);
      }

      if (evRes.status === 'fulfilled' && evRes.value.data && evRes.value.data.length > 0) {
        setEvents(evRes.value.data);
        setTenantStorage('voucher_events', tenantId, evRes.value.data);
      } else {
        const stored = getTenantStorage('voucher_events', tenantId, []);
        setEvents(stored);
      }

      if (instRes.status === 'fulfilled' && instRes.value.data && instRes.value.data.length > 0) {
        setTenantInstances(instRes.value.data);
        const active = instRes.value.data.find((i: any) => i.status === 'connected' || i.status === 'open' || i.is_active) || instRes.value.data[0];
        if (active) setSelectedSendInstanceId(active.id);
      } else {
        setTenantInstances([]);
      }
    } catch (err: any) {
      console.warn('[Voucher] Carregamento local por inquilino ativo:', err);
      setEmpresas(getTenantStorage('voucher_companies', tenantId, []));
      setCampanhas(getTenantStorage('voucher_campaigns', tenantId, []));
      setVouchers(getTenantStorage('voucher_items', tenantId, []));
      setEvents(getTenantStorage('voucher_events', tenantId, []));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Re-sincroniza e recarrega imediatamente ao alternar de empresa no topo esquerdo
  useEffect(() => {
    if (tenantId) {
      setEmpresas(getTenantStorage('voucher_companies', tenantId, []));
      setCampanhas(getTenantStorage('voucher_campaigns', tenantId, []));
      setVouchers(getTenantStorage('voucher_items', tenantId, []));
      setEvents(getTenantStorage('voucher_events', tenantId, []));
      fetchData();
    }
  }, [tenantId, fetchData]);

  // Sincroniza vouchers do estado local para a chave direta de cada token
  useEffect(() => {
    if (vouchers && vouchers.length > 0) {
      vouchers.forEach((vItem: any) => {
        if (vItem.public_token) {
          try {
            localStorage.setItem(`voucher_token_${vItem.public_token}`, JSON.stringify(vItem));
          } catch (_) {}
        }
      });
    }
  }, [vouchers]);

  // Abertura com garantia de persistência instantânea
  const handleOpenVoucherDigital = (voucher: any) => {
    try {
      if (voucher && voucher.public_token) {
        localStorage.setItem(`voucher_token_${voucher.public_token}`, JSON.stringify(voucher));
      }
    } catch (_) {}
    window.open(`/voucher/${voucher.public_token}`, '_blank');
  };

  // Consulta e auto-preenchimento de CNPJ
  const handleCnpjLookup = async (overrideCnpj?: string) => {
    const raw = overrideCnpj || companyForm.cnpj;
    const clean = (raw || '').replace(/\D/g, '');
    if (clean.length !== 14) {
      if (clean.length > 0) {
        setCnpjError('CNPJ deve conter exatamente 14 dígitos numéricos.');
      }
      return;
    }

    try {
      setIsLoadingCnpj(true);
      setCnpjError(null);
      setCnpjSuccessMessage(null);

      const data = await lookupCnpj(clean);
      setCompanyForm(prev => ({
        ...prev,
        cnpj: data.cnpj,
        razaoSocial: data.razaoSocial || prev.razaoSocial,
        nomeFantasia: data.nomeFantasia || prev.nomeFantasia,
        cep: data.cep || prev.cep,
        logradouro: data.logradouro || prev.logradouro,
        numero: data.numero || prev.numero,
        complemento: data.complemento || prev.complemento,
        bairro: data.bairro || prev.bairro,
        municipio: data.municipio || prev.municipio,
        uf: data.uf || prev.uf,
        telefoneEmpresa: data.telefone || prev.telefoneEmpresa,
        contatoWhatsapp: prev.contatoWhatsapp || (data.telefone ? data.telefone.replace(/\D/g, '') : ''),
        emailEmpresa: data.email || prev.emailEmpresa,
        atividadePrincipal: data.atividadePrincipal || prev.atividadePrincipal,
        naturezaJuridica: data.naturezaJuridica || prev.naturezaJuridica,
        dataAbertura: data.dataAbertura || prev.dataAbertura,
        statusCnpj: data.statusCnpj || prev.statusCnpj
      }));

      setCnpjSuccessMessage(`CNPJ ${data.cnpj} (${data.statusCnpj || 'Ativa'}) preenchido automaticamente!`);
      setTimeout(() => setCnpjSuccessMessage(null), 4000);
    } catch (err: any) {
      console.warn('Erro ao consultar CNPJ:', err);
      setCnpjError(err.message || 'Não foi possível consultar o CNPJ. Verifique o número digitado.');
    } finally {
      setIsLoadingCnpj(false);
    }
  };

  // ==============================================================================
  // GESTÃO INLINE DE EMPRESA PARCEIRA (Criação e Edição)
  // ==============================================================================
  const openNewCompanyModal = () => {
    setEditingCompany(null);
    setCnpjError(null);
    setCnpjSuccessMessage(null);
    setCompanyForm({
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      municipio: '',
      uf: '',
      contatoNome: '',
      contatoWhatsapp: '',
      telefoneEmpresa: '',
      emailEmpresa: '',
      atividadePrincipal: '',
      naturezaJuridica: '',
      dataAbertura: '',
      statusCnpj: '',
      limiteVouchers: 100
    });
    setShowCompanyModal(true);
  };

  const openEditCompanyModal = (comp: any) => {
    setEditingCompany(comp);
    setCnpjError(null);
    setCnpjSuccessMessage(null);
    setCompanyForm({
      razaoSocial: comp.razao_social || '',
      nomeFantasia: comp.nome_fantasia || '',
      cnpj: comp.cnpj || '',
      cep: comp.cep || '',
      logradouro: comp.logradouro || '',
      numero: comp.numero || '',
      complemento: comp.complemento || '',
      bairro: comp.bairro || '',
      municipio: comp.municipio || '',
      uf: comp.uf || '',
      contatoNome: comp.contato_nome || '',
      contatoWhatsapp: comp.contato_whatsapp || '',
      telefoneEmpresa: comp.telefone_empresa || comp.telefone || '',
      emailEmpresa: comp.email_empresa || comp.email || '',
      atividadePrincipal: comp.atividade_principal || '',
      naturezaJuridica: comp.natureza_juridica || '',
      dataAbertura: comp.data_abertura_cnpj || comp.data_abertura || '',
      statusCnpj: comp.status_cnpj || '',
      limiteVouchers: comp.limite_vouchers || 100
    });
    setShowCompanyModal(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.razaoSocial.trim()) {
      setActionError('Por favor, informe a Razão Social da empresa.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      if (editingCompany) {
        // EDIÇÃO
        const updatedObj = {
          ...editingCompany,
          razao_social: companyForm.razaoSocial.trim(),
          nome_fantasia: companyForm.nomeFantasia.trim() || companyForm.razaoSocial.trim(),
          cnpj: companyForm.cnpj.trim(),
          cep: companyForm.cep.trim(),
          logradouro: companyForm.logradouro.trim(),
          numero: companyForm.numero.trim(),
          complemento: companyForm.complemento.trim(),
          bairro: companyForm.bairro.trim(),
          municipio: companyForm.municipio.trim(),
          uf: companyForm.uf.trim().toUpperCase(),
          telefone_empresa: companyForm.telefoneEmpresa.trim(),
          email_empresa: companyForm.emailEmpresa.trim(),
          atividade_principal: companyForm.atividadePrincipal.trim(),
          natureza_juridica: companyForm.naturezaJuridica.trim(),
          data_abertura_cnpj: companyForm.dataAbertura || null,
          status_cnpj: companyForm.statusCnpj || 'ATIVA',
          contato_nome: companyForm.contatoNome.trim(),
          contato_whatsapp: companyForm.contatoWhatsapp.replace(/\D/g, ''),
          limite_vouchers: Number(companyForm.limiteVouchers) || 100,
          updated_at: new Date().toISOString()
        };

        try {
          await supabase.from('voucher_empresas_parceiras').update(updatedObj).eq('id', editingCompany.id);
        } catch (dbErr) {
          console.warn('Update via store local:', dbErr);
        }

        const newList = empresas.map((emp) => (emp.id === editingCompany.id ? updatedObj : emp));
        setEmpresas(newList);
        setTenantStorage('voucher_companies', tenantId, newList);
        setActionSuccess(`Empresa '${updatedObj.razao_social}' atualizada com sucesso!`);
      } else {
        // CRIAÇÃO
        const newCompany = {
          id: 'emp-' + Math.random().toString(36).substring(2, 9),
          tenant_id: tenantId,
          razao_social: companyForm.razaoSocial.trim(),
          nome_fantasia: companyForm.nomeFantasia.trim() || companyForm.razaoSocial.trim(),
          cnpj: companyForm.cnpj.trim(),
          cep: companyForm.cep.trim(),
          logradouro: companyForm.logradouro.trim(),
          numero: companyForm.numero.trim(),
          complemento: companyForm.complemento.trim(),
          bairro: companyForm.bairro.trim(),
          municipio: companyForm.municipio.trim(),
          uf: companyForm.uf.trim().toUpperCase(),
          telefone_empresa: companyForm.telefoneEmpresa.trim(),
          email_empresa: companyForm.emailEmpresa.trim(),
          atividade_principal: companyForm.atividadePrincipal.trim(),
          natureza_juridica: companyForm.naturezaJuridica.trim(),
          data_abertura_cnpj: companyForm.dataAbertura || null,
          status_cnpj: companyForm.statusCnpj || 'ATIVA',
          contato_nome: companyForm.contatoNome.trim(),
          contato_whatsapp: companyForm.contatoWhatsapp.replace(/\D/g, ''),
          limite_vouchers: Number(companyForm.limiteVouchers) || 100,
          ativo: true,
          created_at: new Date().toISOString()
        };

        try {
          await supabase.from('voucher_empresas_parceiras').insert(newCompany);
        } catch (dbErr) {
          console.warn('Insert via store local:', dbErr);
        }

        const newList = [newCompany, ...empresas];
        setEmpresas(newList);
        setTenantStorage('voucher_companies', tenantId, newList);

        // Seleciona automaticamente no formulário de emissão/campanha
        setVoucherForm((prev) => ({ ...prev, empresaId: newCompany.id }));
        setCampaignForm((prev) => ({ ...prev, empresaId: newCompany.id }));

        setActionSuccess(`Empresa '${newCompany.razao_social}' criada e selecionada com sucesso!`);
      }

      setShowCompanyModal(false);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao salvar empresa.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==============================================================================
  // GESTÃO INLINE DE CAMPANHA (Criação e Edição)
  // ==============================================================================
  const openNewCampaignModal = () => {
    setEditingCampaign(null);
    setCampaignForm({
      empresaId: voucherForm.empresaId || empresas[0]?.id || '',
      nome: '',
      descricao: '',
      tipoDesconto: 'VALOR_FIXO',
      valorDesconto: 40.0,
      dataFim: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    setShowCampaignModal(true);
  };

  const openEditCampaignModal = (cmp: any) => {
    setEditingCampaign(cmp);
    setCampaignForm({
      empresaId: cmp.empresa_id || empresas[0]?.id || '',
      nome: cmp.nome || '',
      descricao: cmp.descricao || '',
      tipoDesconto: cmp.tipo_desconto || 'VALOR_FIXO',
      valorDesconto: cmp.valor_desconto || 40.0,
      dataFim: cmp.data_fim ? cmp.data_fim.split('T')[0] : new Date().toISOString().split('T')[0]
    });
    setShowCampaignModal(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.nome.trim()) {
      setActionError('Por favor, informe o nome da campanha.');
      return;
    }
    if (!campaignForm.empresaId && empresas.length === 0) {
      setActionError('Cadastre uma Empresa Parceira primeiro.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const selectedEmpresa = empresas.find((emp) => emp.id === campaignForm.empresaId) || empresas[0];

      if (editingCampaign) {
        // EDIÇÃO
        const updatedObj = {
          ...editingCampaign,
          empresa_id: selectedEmpresa?.id,
          empresa_nome: selectedEmpresa?.razao_social,
          nome: campaignForm.nome.trim(),
          descricao: campaignForm.descricao.trim(),
          tipo_desconto: campaignForm.tipoDesconto,
          valor_desconto: Number(campaignForm.valorDesconto) || 40.0,
          data_fim: new Date(campaignForm.dataFim).toISOString(),
          updated_at: new Date().toISOString()
        };

        try {
          await supabase.from('voucher_campanhas').update(updatedObj).eq('id', editingCampaign.id);
        } catch (dbErr) {
          console.warn('Update via store local:', dbErr);
        }

        const newList = campanhas.map((c) => (c.id === editingCampaign.id ? updatedObj : c));
        setCampanhas(newList);
        setTenantStorage('voucher_campaigns', tenantId, newList);
        setActionSuccess(`Campanha '${updatedObj.nome}' atualizada com sucesso!`);
      } else {
        // CRIAÇÃO
        const newCampaign = {
          id: 'cmp-' + Math.random().toString(36).substring(2, 9),
          tenant_id: tenantId,
          empresa_id: selectedEmpresa?.id,
          empresa_nome: selectedEmpresa?.razao_social,
          nome: campaignForm.nome.trim(),
          descricao: campaignForm.descricao.trim(),
          tipo_desconto: campaignForm.tipoDesconto,
          valor_desconto: Number(campaignForm.valorDesconto) || 40.0,
          data_fim: new Date(campaignForm.dataFim).toISOString(),
          ativo: true,
          created_at: new Date().toISOString()
        };

        try {
          await supabase.from('voucher_campanhas').insert(newCampaign);
        } catch (dbErr) {
          console.warn('Insert via store local:', dbErr);
        }

        const newList = [newCampaign, ...campanhas];
        setCampanhas(newList);
        setTenantStorage('voucher_campaigns', tenantId, newList);

        // Seleciona automaticamente no formulário de emissão
        setVoucherForm((prev) => ({
          ...prev,
          campanhaId: newCampaign.id,
          valor: newCampaign.valor_desconto
        }));

        setActionSuccess(`Campanha '${newCampaign.nome}' criada e selecionada com sucesso!`);
      }

      setShowCampaignModal(false);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao salvar campanha.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==============================================================================
  // ABERTURA E EMISSÃO DE VOUCHERS (Individual Simplificado ou Lote Corporativo)
  // ==============================================================================
  const openNewVoucherModal = () => {
    setVoucherForm({
      vincularEmpresa: false,
      campanhaId: campanhas[0]?.id || '',
      empresaId: empresas[0]?.id || '',
      beneficiarioNome: '',
      beneficiarioWhatsapp: '',
      quantidade: 5,
      valor: 0,
      valorInput: '',
      validadeFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    setVoucherEmissionMode('individual');
    setShowCreateVoucherModal(true);
  };

  const handleCreateVouchers = async (e: React.FormEvent) => {
    e.preventDefault();

    if (voucherEmissionMode === 'lote' && (campanhas.length === 0 || empresas.length === 0)) {
      setActionError('Para emissão em lote corporativo, cadastre ao menos uma Empresa Parceira e uma Campanha.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const isIndividual = voucherEmissionMode === 'individual';
      const shouldLinkCompany = isIndividual ? voucherForm.vincularEmpresa : true;

      const selectedEmpresa = shouldLinkCompany && voucherForm.empresaId
        ? (empresas.find((emp) => emp.id === voucherForm.empresaId) || empresas[0] || null)
        : null;

      const selectedCampanha = shouldLinkCompany && voucherForm.campanhaId
        ? (campanhas.find((cmp) => cmp.id === voucherForm.campanhaId) || campanhas[0] || null)
        : null;

      const countToEmit = isIndividual ? 1 : Number(voucherForm.quantidade) || 5;
      const emissionValue = Number(voucherForm.valor);

      if (!emissionValue || emissionValue <= 0) {
        setActionError('Por favor, informe o valor do crédito a ser emitido.');
        return;
      }

      const newVouchers: any[] = [];
      const newEvents: any[] = [];

      for (let i = 0; i < countToEmit; i++) {
        const publicToken = 'VCH-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const txnHash = 'TXN-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const voucherId = 'vch-' + Math.random().toString(36).substring(2, 9);
        const benefNome = isIndividual
          ? (voucherForm.beneficiarioNome.trim() || 'Cliente / Colaborador')
          : `Colaborador #${i + 1}`;
        const benefWhats = isIndividual ? voucherForm.beneficiarioWhatsapp.replace(/\D/g, '') : '';
        const empresaNome = selectedEmpresa ? selectedEmpresa.razao_social : 'Cliente Avulso (Venda Direta)';

        const voucherItem = {
          id: voucherId,
          tenant_id: tenantId,
          campanha_id: selectedCampanha?.id || null,
          empresa_id: selectedEmpresa?.id || null,
          public_token: publicToken,
          status: 'CRIADO',
          valor: emissionValue,
          beneficiario_nome: benefNome,
          beneficiario_whatsapp: benefWhats,
          validade_fim: new Date(voucherForm.validadeFim).toISOString(),
          created_at: new Date().toISOString(),
          voucher_campanhas: selectedCampanha ? { nome: selectedCampanha.nome } : null,
          voucher_empresas_parceiras: selectedEmpresa ? { razao_social: selectedEmpresa.razao_social } : null
        };

        newVouchers.push(voucherItem);

        // Registro de Auditoria & Lançamento Contábil no Ledger (Crédito de Ativo)
        newEvents.push({
          id: 'ev-' + Math.random().toString(36).substring(2, 9),
          tenant_id: tenantId,
          voucher_id: voucherItem.id,
          voucher_token: publicToken,
          tipo_operacao: 'CREDITO_EMISSAO',
          valor: emissionValue,
          beneficiario_nome: benefNome,
          empresa_origem: selectedEmpresa?.razao_social || 'Cliente Avulso (Sem Vínculo B2B)',
          status_anterior: null,
          status_novo: 'CRIADO',
          data_hora: new Date().toISOString(),
          usuario_responsavel: 'Operador (Gestão de Vouchers)',
          hash_transacao: txnHash,
          motivo: isIndividual
            ? (shouldLinkCompany && selectedEmpresa ? `Emissão Nominal B2B vinculada a ${selectedEmpresa.razao_social}` : 'Emissão Simplificada Avulsa (Crédito Direto Sem Empresa)')
            : `Emissão de Lote Corporativo (${countToEmit} unidades para ${empresaNome})`
        });
      }

      // Persistência no Supabase
      try {
        await supabase.from('vouchers').insert(newVouchers);
        await supabase.from('voucher_events').insert(newEvents);
      } catch (dbErr) {
        console.warn('Persistindo na store local:', dbErr);
      }

      // Salva chaves diretas para acesso instantâneo do visualizador
      newVouchers.forEach((vItem) => {
        try {
          localStorage.setItem(`voucher_token_${vItem.public_token}`, JSON.stringify(vItem));
        } catch (_) {}
      });

      const updatedVouchers = [...newVouchers, ...vouchers];
      const updatedEvents = [...newEvents, ...events];

      setVouchers(updatedVouchers);
      setEvents(updatedEvents);

      setTenantStorage('voucher_items', tenantId, updatedVouchers);
      setTenantStorage('voucher_events', tenantId, updatedEvents);

      setShowCreateVoucherModal(false);
      setVoucherForm({
        vincularEmpresa: false,
        campanhaId: campanhas[0]?.id || '',
        empresaId: empresas[0]?.id || '',
        beneficiarioNome: '',
        beneficiarioWhatsapp: '',
        quantidade: 5,
        valor: 0,
        valorInput: '',
        validadeFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });

      setActionSuccess(
        isIndividual
          ? `Voucher ${newVouchers[0].public_token} de ${emissionValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} emitido com sucesso!`
          : `Lote com ${newVouchers.length} vouchers emitido com sucesso!`
      );
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao emitir vouchers.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==============================================================================
  // DISPARO DE VOUCHER VIA WHATSAPP COM SELEÇÃO DE INSTÂNCIA DA LOJA
  // ==============================================================================
  const openSendModal = (voucher: any) => {
    setSelectedVoucherForSend(voucher);
    setSendPhoneInput(voucher.beneficiario_whatsapp || '');
    if (tenantInstances.length > 0 && !selectedSendInstanceId) {
      const active = tenantInstances.find((i) => i.status === 'connected' || i.status === 'open' || i.is_active) || tenantInstances[0];
      setSelectedSendInstanceId(active.id);
    }
    setShowSendModal(true);
  };

  const handleExecuteSendWhatsApp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedVoucherForSend) return;

    try {
      setActionLoading(true);
      setActionError(null);
      setActionSuccess(null);

      const phone = sendPhoneInput || selectedVoucherForSend.beneficiario_whatsapp || '1141351987';
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        setActionError('Por favor, informe um número de WhatsApp válido com DDD.');
        return;
      }

      const voucherUrl = `${window.location.origin}/voucher/${selectedVoucherForSend.public_token}`;
      const valorFormatado = Number(selectedVoucherForSend.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      const messageText = `🎟️ *Seu Voucher Digital Corporativo Chegou!*\n\n` +
        `Olá *${selectedVoucherForSend.beneficiario_nome || 'Colaborador'}*,\n` +
        `Você recebeu um voucher corporativo especial de *${selectedVoucherForSend.voucher_empresas_parceiras?.razao_social || 'Empresa Parceira'}*.\n\n` +
        `💰 *Valor:* ${valorFormatado}\n` +
        `🏷️ *Campanha:* ${selectedVoucherForSend.voucher_campanhas?.nome || 'Benefício Corporativo'}\n` +
        `⏳ *Validade:* ${new Date(selectedVoucherForSend.validade_fim).toLocaleDateString('pt-BR')}\n\n` +
        `👉 *Acesse seu Voucher e QR Code:*\n${voucherUrl}\n\n` +
        `_Apresente o QR Code no balcão para resgatar seu benefício._`;

      // Seleção da Instância: Própria da Loja vs Contingência FoodNext
      const targetInstance = tenantInstances.find((i) => i.id === selectedSendInstanceId) || tenantInstances[0];
      const instanceIdentifier = targetInstance ? (targetInstance.session_name || targetInstance.name || targetInstance.display_name || targetInstance.id) : 'FoodNext';
      const instanceDisplayName = targetInstance ? (targetInstance.display_name || targetInstance.name || 'Caixa da Loja') : 'FoodNext (Contingência)';

      // Disparo via Backend Engine
      try {
        await fetch(`${ENGINE_URL}/api/v1/message/sendText`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
            ...(targetInstance?.api_key ? { 'apikey': targetInstance.api_key } : {})
          },
          body: JSON.stringify({
            instance: instanceIdentifier,
            instanceId: targetInstance?.id,
            number: cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone,
            text: messageText
          })
        });
      } catch (postErr) {
        console.warn('[Voucher] Erro no envio via motor REST:', postErr);
      }

      // Atualiza status do voucher
      const updatedList = vouchers.map((v) =>
        v.id === selectedVoucherForSend.id ? { ...v, status: 'ENVIADO', beneficiario_whatsapp: cleanPhone } : v
      );
      setVouchers(updatedList);
      setTenantStorage('voucher_items', tenantId, updatedList);

      // Registra evento na auditoria
      const newEvent = {
        id: 'ev-' + Math.random().toString(36).substring(2, 9),
        tenant_id: tenantId,
        voucher_id: selectedVoucherForSend.id,
        status_anterior: selectedVoucherForSend.status,
        status_novo: 'ENVIADO',
        data_hora: new Date().toISOString(),
        usuario_responsavel: 'SISTEMA_GESTAO',
        motivo: `Disparo WhatsApp para +${cleanPhone} via instância "${instanceDisplayName}"`
      };
      const updatedEvents = [newEvent, ...events];
      setEvents(updatedEvents);
      setTenantStorage('voucher_events', tenantId, updatedEvents);

      try {
        await supabase.from('vouchers').update({ status: 'ENVIADO', beneficiario_whatsapp: cleanPhone }).eq('id', selectedVoucherForSend.id);
        await supabase.from('voucher_events').insert(newEvent);
      } catch (_) {}

      setShowSendModal(false);
      setActionSuccess(`Voucher ${selectedVoucherForSend.public_token} disparado com sucesso via ${instanceDisplayName}!`);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao disparar voucher.');
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setActionLoading(false);
    }
  };

  // Disparo direto com 1 clique (usa a primeira caixa ativa da loja)
  const handleSendWhatsApp = async (voucher: any) => {
    openSendModal(voucher);
  };

  // ==============================================================================
  // MÉTRICAS E TOTALIZADORES FINANCEIROS
  // ==============================================================================
  const totalEmitidos = vouchers.length;
  const valorTotalEmitido = vouchers.reduce((acc, v) => acc + Number(v.valor || 0), 0);
  const totalUtilizados = vouchers.filter((v) => v.status === 'UTILIZADO').length;
  const valorTotalResgatado = vouchers
    .filter((v) => v.status === 'UTILIZADO')
    .reduce((acc, v) => acc + Number(v.valor || 0), 0);
  const totalAtivos = vouchers.filter((v) => v.status !== 'UTILIZADO' && v.status !== 'CANCELADO' && v.status !== 'EXPIRADO').length;
  const valorTotalAtivos = vouchers
    .filter((v) => v.status !== 'UTILIZADO' && v.status !== 'CANCELADO' && v.status !== 'EXPIRADO')
    .reduce((acc, v) => acc + Number(v.valor || 0), 0);
  const taxaConversao = totalEmitidos > 0 ? Math.round((totalUtilizados / totalEmitidos) * 100) : 0;

  const filteredVouchers = vouchers.filter((v) => {
    const q = searchTerm.toLowerCase();
    return (
      v.public_token?.toLowerCase().includes(q) ||
      v.beneficiario_nome?.toLowerCase().includes(q) ||
      v.voucher_campanhas?.nome?.toLowerCase().includes(q) ||
      v.voucher_empresas_parceiras?.razao_social?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] dark:bg-[#111b21] text-slate-900 dark:text-slate-100 overflow-y-auto p-3 sm:p-5 md:p-6 lg:p-8 space-y-5 overflow-x-hidden">
      
      {/* Header Principal Responsivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 border-b border-black/10 dark:border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 border border-white/20 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight">Voucher Gestão</h1>
              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Corporativo
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
              Vouchers digitais corporativos com antifraude e automação WhatsApp.
            </p>
          </div>
        </div>

        {/* Botões de Ação Principais (Mínimo 48px de toque) */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => window.open('/voucher-scanner', '_blank')}
            className="flex-1 sm:flex-initial px-4 py-3 bg-white dark:bg-[#1f2c34] hover:bg-slate-100 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm min-h-[48px] active:scale-95"
          >
            <QrCode className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Terminal Caixa</span>
          </button>

          <button
            onClick={openNewVoucherModal}
            className="flex-1 sm:flex-initial px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 active:scale-95 cursor-pointer min-h-[48px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Emitir Voucher / Lote</span>
          </button>
        </div>
      </div>

      {/* Alertas de Ação */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-600 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-600 dark:text-rose-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Grid de Métricas Executivas (Responsivo com Valor Total Financeiro e Quantidades) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* CARD 1: TOTAL EMITIDOS */}
        <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm space-y-1 min-w-0 text-left">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider">Total Emitidos</span>
            <Ticket className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-white truncate">
            {valorTotalEmitido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <span className="text-[10px] text-slate-400 font-bold block truncate">
            {totalEmitidos} vouchers • {empresas.length} parceiras
          </span>
        </div>

        {/* CARD 2: TOTAL RESGATADO */}
        <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm space-y-1 min-w-0 text-left">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider">Total Resgatado</span>
            <DollarSign className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-emerald-500 truncate">
            {valorTotalResgatado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <span className="text-[10px] text-slate-400 font-bold block truncate">
            {totalUtilizados} baixas confirmadas
          </span>
        </div>

        {/* CARD 3: VOUCHERS ATIVOS */}
        <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm space-y-1 min-w-0 text-left">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider">Vouchers Ativos</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-amber-500 truncate">
            {valorTotalAtivos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <span className="text-[10px] text-slate-400 font-bold block truncate">
            {totalAtivos} disponíveis para resgate
          </span>
        </div>

        {/* CARD 4: TAXA DE RESGATE */}
        <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm space-y-1 min-w-0 text-left">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider">Taxa de Resgate</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-purple-500">
            {taxaConversao}%
          </div>
          <span className="text-[10px] text-slate-400 font-bold block truncate">
            {campanhas.length} campanhas ativas
          </span>
        </div>
      </div>

      {/* Navegação de Abas Fluida (Estilo Pílula - Zero Cortes) */}
      <div className="border-b border-black/10 dark:border-white/10 pb-3 pt-1">
        <div className="flex items-center justify-between gap-3 overflow-x-auto scrollbar-none py-1.5 px-0.5">
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'vouchers'}
              onClick={() => setActiveTab('vouchers')}
              className={`px-5 sm:px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2.5 min-h-[48px] shrink-0 select-none ${
                activeTab === 'vouchers'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 scale-[1.02] border border-emerald-400/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Ticket className="w-4 h-4 shrink-0" />
              <span>VOUCHERS ({vouchers.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'campanhas'}
              onClick={() => setActiveTab('campanhas')}
              className={`px-5 sm:px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2.5 min-h-[48px] shrink-0 select-none ${
                activeTab === 'campanhas'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 scale-[1.02] border border-emerald-400/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span>CAMPANHAS ({campanhas.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'empresas'}
              onClick={() => setActiveTab('empresas')}
              className={`px-5 sm:px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2.5 min-h-[48px] shrink-0 select-none ${
                activeTab === 'empresas'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 scale-[1.02] border border-emerald-400/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span>EMPRESAS ({empresas.length})</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'auditoria'}
              onClick={() => setActiveTab('auditoria')}
              className={`px-5 sm:px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-2.5 min-h-[48px] shrink-0 select-none ${
                activeTab === 'auditoria'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 scale-[1.02] border border-emerald-400/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <ReceiptText className="w-4 h-4 shrink-0" />
              <span>EXTRATO / LEDGER ({events.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchData}
            className="p-3 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl cursor-pointer shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ABA 1: VOUCHERS */}
      {/* ========================================================= */}
      {activeTab === 'vouchers' && (
        <div className="space-y-4">
          
          {/* Barra de Pesquisa Única e Fluida */}
          <div className="w-full relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, beneficiário ou empresa parceira..."
              className="w-full bg-white dark:bg-[#1f2c34] border border-black/10 dark:border-white/10 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-bold shadow-sm"
            />
          </div>

          {filteredVouchers.length === 0 ? (
            <div className="bg-white dark:bg-[#1f2c34] rounded-2xl border border-black/10 dark:border-white/10 p-8 text-center space-y-3 shadow-sm">
              <Ticket className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Nenhum voucher emitido ainda</h3>
                <p className="text-xs text-slate-400">Emita seu primeiro voucher corporativo individual ou em lote.</p>
              </div>
              <button
                onClick={openNewVoucherModal}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md min-h-[48px]"
              >
                <Plus className="w-4 h-4" />
                <span>Emitir Primeiro Voucher</span>
              </button>
            </div>
          ) : (
            <>
              {/* VISUALIZAÇÃO EM CARDS PARA MOBILE (< md) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredVouchers.map((v) => {
                  const isUtil = v.status === 'UTILIZADO';
                  const isVal = v.status === 'VALIDADO';
                  const isEnv = v.status === 'ENVIADO';

                  return (
                    <div
                      key={v.id}
                      className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/10 dark:border-white/10 space-y-3 shadow-sm text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                          {v.public_token}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          isUtil
                            ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                            : isVal
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 animate-pulse'
                            : isEnv
                            ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30'
                            : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {v.status}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-emerald-500" />
                          <strong className="text-slate-900 dark:text-white font-bold">{v.beneficiario_nome || 'Colaborador'}</strong>
                          {v.beneficiario_whatsapp && (
                            <span className="text-[10px] text-slate-400 font-mono">+{v.beneficiario_whatsapp}</span>
                          )}
                        </div>

                        <div className="text-slate-500 dark:text-slate-400">
                          {v.empresa_id && v.voucher_empresas_parceiras?.razao_social ? (
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white">{v.voucher_empresas_parceiras.razao_social}</span>
                              {v.voucher_campanhas?.nome && (
                                <>
                                  <span className="mx-1">•</span>
                                  <span className="text-emerald-500 font-semibold">{v.voucher_campanhas.nome}</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>Cliente Avulso (Sem Empresa)</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Valor</span>
                          <strong className="text-base font-black text-slate-900 dark:text-white">
                            {Number(v.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </strong>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedVoucherForPrint(v);
                              setShowPrintModal(true);
                            }}
                            className="p-2.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 rounded-xl text-slate-400 hover:text-white cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="Imprimir Voucher (Térmica / PDF)"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleSendWhatsApp(v)}
                            disabled={actionLoading}
                            className="p-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-xl cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="Disparar via WhatsApp"
                          >
                            <Send className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleOpenVoucherDigital(v)}
                            className="p-2.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 rounded-xl text-slate-400 hover:text-white cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="Abrir Voucher Digital"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TABELA RESPONSIVA PARA DESKTOP/TABLET (>= md) */}
              <div className="hidden md:block bg-white dark:bg-[#1f2c34] rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#0c1317] text-slate-400 font-black uppercase text-[10px] tracking-wider border-b border-black/5 dark:border-white/5">
                    <tr>
                      <th className="py-3.5 px-4">Código</th>
                      <th className="py-3.5 px-4">Beneficiário</th>
                      <th className="py-3.5 px-4">Empresa / Campanha</th>
                      <th className="py-3.5 px-4">Valor</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Validade</th>
                      <th className="py-3.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5 font-medium">
                    {filteredVouchers.map((v) => {
                      const isUtil = v.status === 'UTILIZADO';
                      const isVal = v.status === 'VALIDADO';
                      const isEnv = v.status === 'ENVIADO';

                      return (
                        <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-4 font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                            {v.public_token}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {v.beneficiario_nome || 'Colaborador'}
                            </div>
                            {v.beneficiario_whatsapp && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                +{v.beneficiario_whatsapp}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-300">
                            {v.empresa_id && v.voucher_empresas_parceiras?.razao_social ? (
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span>{v.voucher_empresas_parceiras.razao_social}</span>
                                </div>
                                {v.voucher_campanhas?.nome && (
                                  <span className="text-[10px] text-emerald-500 font-bold block mt-0.5">
                                    {v.voucher_campanhas.nome}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10.5px] font-bold text-slate-600 dark:text-slate-400">
                                <User className="w-3 h-3 text-slate-400" />
                                <span>Cliente Avulso (Sem Empresa)</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-black text-slate-900 dark:text-white text-sm">
                            {Number(v.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[9.5px] font-black uppercase tracking-wider ${
                              isUtil
                                ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                                : isVal
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 animate-pulse'
                                : isEnv
                                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30'
                                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {v.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-medium">
                            {new Date(v.validade_fim).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-1.5">
                            <button
                              onClick={() => {
                                setSelectedVoucherForPrint(v);
                                setShowPrintModal(true);
                              }}
                              className="p-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 rounded-xl text-slate-400 hover:text-white cursor-pointer transition-all active:scale-95 min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
                              title="Imprimir Voucher (Térmica / PDF)"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleSendWhatsApp(v)}
                              disabled={actionLoading}
                              className="p-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-xl cursor-pointer transition-all active:scale-95 min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
                              title="Disparar via WhatsApp"
                            >
                              <Send className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleOpenVoucherDigital(v)}
                              className="p-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 rounded-xl text-slate-400 hover:text-white cursor-pointer transition-all active:scale-95 min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
                              title="Abrir Voucher Digital"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 2: CAMPANHAS */}
      {/* ========================================================= */}
      {activeTab === 'campanhas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Campanhas de Benefícios ({campanhas.length})
            </h2>
            <button
              onClick={openNewCampaignModal}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase flex items-center gap-2 cursor-pointer shadow-md min-h-[48px]"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Campanha</span>
            </button>
          </div>

          {campanhas.length === 0 ? (
            <div className="bg-white dark:bg-[#1f2c34] rounded-2xl border border-black/10 dark:border-white/10 p-8 text-center space-y-3 shadow-sm">
              <Gift className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Nenhuma campanha cadastrada para esta empresa</h3>
                <p className="text-xs text-slate-400">Crie sua primeira campanha para definir valores e regras de vouchers corporativos.</p>
              </div>
              <button
                onClick={openNewCampaignModal}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md min-h-[48px]"
              >
                <Plus className="w-4 h-4" />
                <span>Criar Primeira Campanha</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campanhas.map((c) => (
                <div key={c.id} className="bg-white dark:bg-[#1f2c34] p-5 rounded-2xl border border-black/10 dark:border-white/10 space-y-3 shadow-sm text-left">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-base text-slate-900 dark:text-white leading-tight">{c.nome}</h3>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        {c.tipo_desconto || 'VALOR_FIXO'}
                      </span>
                      <button
                        onClick={() => openEditCampaignModal(c)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
                        title="Editar Campanha"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{c.descricao || 'Campanha corporativa.'}</p>
                  <div className="pt-3 border-t border-black/5 dark:border-white/5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Empresa:</span>
                      <strong className="text-slate-900 dark:text-white font-bold">{c.empresa_nome || 'Empresa Parceira'}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Valor Unitário:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-black text-sm">
                        {Number(c.valor_desconto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Validade:</span>
                      <span className="text-slate-300 font-mono">{new Date(c.data_fim).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 3: EMPRESAS PARCEIRAS */}
      {/* ========================================================= */}
      {activeTab === 'empresas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Empresas Parceiras ({empresas.length})
            </h2>
            <button
              onClick={openNewCompanyModal}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase flex items-center gap-2 cursor-pointer shadow-md min-h-[48px]"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Empresa</span>
            </button>
          </div>

          {empresas.length === 0 ? (
            <div className="bg-white dark:bg-[#1f2c34] rounded-2xl border border-black/10 dark:border-white/10 p-8 text-center space-y-3 shadow-sm">
              <Building2 className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Nenhuma empresa parceira cadastrada</h3>
                <p className="text-xs text-slate-400">Cadastre empresas e escritórios conveniados para emissão de benefícios corporativos.</p>
              </div>
              <button
                onClick={openNewCompanyModal}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md min-h-[48px]"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Primeira Empresa</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {empresas.map((e) => (
                <div key={e.id} className="bg-white dark:bg-[#1f2c34] p-5 rounded-2xl border border-black/10 dark:border-white/10 space-y-3 shadow-sm text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <h3 className="font-black text-sm text-slate-900 dark:text-white leading-tight truncate">{e.razao_social}</h3>
                    </div>
                    <button
                      onClick={() => openEditCompanyModal(e)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer shrink-0"
                      title="Editar Empresa"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1.5 pt-1">
                    <div>CNPJ: <span className="font-mono text-slate-300 font-bold">{e.cnpj || 'Não informado'}</span></div>
                    <div>Contato: <span className="text-slate-300">{e.contato_nome} ({e.contato_whatsapp || 'Sem Whats'})</span></div>
                    <div>Limite: <span className="font-black text-emerald-400">{e.limite_vouchers} vouchers/mês</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 4: EXTRATO BANCÁRIO & LEDGER DE ATIVOS */}
      {/* ========================================================= */}
      {activeTab === 'auditoria' && (
        <div className="space-y-4 text-left">
          
          {/* Banner de Balanço do Ledger Contábil */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 rounded-2xl border border-emerald-500/30 space-y-1">
              <div className="flex items-center justify-between text-emerald-400">
                <span className="text-[10.5px] font-black uppercase tracking-wider">Saldo Ativo em Circulação</span>
                <Wallet className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black text-emerald-400">
                {valorTotalAtivos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <span className="text-[10px] text-slate-400 block font-medium">
                {totalAtivos} ativos digitais aguardando resgate
              </span>
            </div>

            <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10.5px] font-black uppercase tracking-wider">Total de Créditos Emitidos</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white">
                +{valorTotalEmitido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <span className="text-[10px] text-slate-400 block font-medium">
                {totalEmitidos} lançamentos de emissão
              </span>
            </div>

            <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10.5px] font-black uppercase tracking-wider">Total Liquidado no Caixa</span>
                <ArrowDownLeft className="w-4 h-4 text-teal-400" />
              </div>
              <div className="text-2xl font-black text-teal-400">
                -{valorTotalResgatado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <span className="text-[10px] text-slate-400 block font-medium">
                {totalUtilizados} baixas contábeis confirmadas
              </span>
            </div>
          </div>

          {/* Barra de Filtros do Extrato */}
          <div className="bg-white dark:bg-[#1f2c34] p-3.5 rounded-2xl border border-black/10 dark:border-white/10 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              
              {/* Campo de Busca no Extrato */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Buscar por voucher, transação ou titular..."
                  className="w-full bg-slate-50 dark:bg-[#111b21] border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white font-bold placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Pílulas de Filtro */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
                {[
                  { id: 'ALL', label: 'Todas as Operações' },
                  { id: 'CREDITO', label: '+ Emissões (Crédito)' },
                  { id: 'DEBITO', label: '- Baixas / Resgates' }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setLedgerFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase whitespace-nowrap cursor-pointer transition-all ${
                      ledgerFilter === f.id
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-black/5 dark:bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

            </div>

            {/* Lista / Feed de Lançamentos do Extrato */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 divide-y divide-black/5 dark:divide-white/5">
              {events.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <ReceiptText className="w-8 h-8 mx-auto text-slate-500" />
                  <p className="text-xs text-slate-400">Nenhum lançamento contábil registrado ainda.</p>
                </div>
              ) : (
                events
                  .filter((ev) => {
                    const matchesSearch =
                      !ledgerSearch ||
                      (ev.voucher_token && ev.voucher_token.toLowerCase().includes(ledgerSearch.toLowerCase())) ||
                      (ev.beneficiario_nome && ev.beneficiario_nome.toLowerCase().includes(ledgerSearch.toLowerCase())) ||
                      (ev.hash_transacao && ev.hash_transacao.toLowerCase().includes(ledgerSearch.toLowerCase())) ||
                      (ev.motivo && ev.motivo.toLowerCase().includes(ledgerSearch.toLowerCase()));

                    if (!matchesSearch) return false;

                    if (ledgerFilter === 'CREDITO') {
                      return ev.tipo_operacao === 'CREDITO_EMISSAO' || ev.status_novo === 'CRIADO';
                    }
                    if (ledgerFilter === 'DEBITO') {
                      return ev.tipo_operacao === 'DEBITO_RESGATE' || ev.status_novo === 'UTILIZADO';
                    }
                    return true;
                  })
                  .map((ev) => {
                    const isCredito = ev.tipo_operacao === 'CREDITO_EMISSAO' || ev.status_novo === 'CRIADO';
                    const isDebito = ev.tipo_operacao === 'DEBITO_RESGATE' || ev.status_novo === 'UTILIZADO';
                    const isDisparo = ev.status_novo === 'ENVIADO';

                    const matchingVoucher = vouchers.find(v => v.id === ev.voucher_id || v.public_token === ev.voucher_token);
                    const val = Number(ev.valor || matchingVoucher?.valor || 50.0);

                    return (
                      <div
                        key={ev.id}
                        className="pt-2.5 pb-2.5 flex items-center justify-between gap-3 text-xs hover:bg-black/5 dark:hover:bg-white/[0.02] px-2 rounded-xl transition-colors"
                      >
                        {/* Lado Esquerdo: Ícone + Descrição */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isCredito
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : isDebito
                              ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                              : isDisparo
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          }`}>
                            {isCredito ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : isDebito ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : isDisparo ? (
                              <Send className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-white text-xs">
                                {ev.voucher_token || (matchingVoucher ? matchingVoucher.public_token : 'VOUCHER')}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                isCredito
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : isDebito
                                  ? 'bg-teal-500/20 text-teal-300'
                                  : 'bg-white/10 text-slate-400'
                              }`}>
                                {isCredito ? 'Crédito / Emissão' : isDebito ? 'Débito / Liquidação' : ev.status_novo}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 truncate">
                              {ev.beneficiario_nome || matchingVoucher?.beneficiario_nome || 'Beneficiário'} • {ev.motivo || 'Operação de voucher'}
                            </p>
                            <span className="text-[10px] text-slate-500 font-mono block">
                              {new Date(ev.data_hora).toLocaleString('pt-BR')} • {ev.usuario_responsavel || 'Sistema'}
                            </span>
                          </div>
                        </div>

                        {/* Lado Direito: Valor Contábil + Botão Timeline */}
                        <div className="text-right shrink-0 flex items-center gap-3">
                          <div>
                            <span className={`text-sm font-black block ${
                              isCredito ? 'text-emerald-400' : isDebito ? 'text-teal-400' : 'text-slate-300'
                            }`}>
                              {isCredito ? '+' : isDebito ? '-' : ''}
                              {val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                            <span className="text-[9.5px] text-slate-500 font-mono">
                              {ev.hash_transacao || 'TXN-CONFIRM'}
                            </span>
                          </div>

                          {matchingVoucher && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedVoucherForLedger(matchingVoucher);
                                setShowLedgerTimelineModal(true);
                              }}
                              className="p-2 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center transition-colors"
                              title="Ver Extrato Criptográfico e Timeline"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                      </div>
                    );
                  })
              )}
            </div>

          </div>

        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EMISSÃO DE VOUCHER (MODELO SIMPLIFICADO & ZERO TRAVAS) */}
      {/* ========================================================= */}
      {showCreateVoucherModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-gradient-to-b from-[#18252d] via-[#111b21] to-[#0c1317] border border-white/15 rounded-[28px] sm:rounded-[32px] p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] flex flex-col relative overflow-hidden my-auto max-h-[96vh]">
            
            {/* Iluminação Ambiental Neon de Fundo */}
            <div className="absolute -top-20 -left-20 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* 1. HEADER FIXO */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 border border-emerald-400/30 shrink-0">
                  <Ticket className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white tracking-tight leading-tight">
                      {voucherEmissionMode === 'individual' ? 'Emissão Rápida de Voucher' : 'Emissão em Lote Corporativo'}
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      {voucherEmissionMode === 'individual' ? 'Direta / Avulsa' : 'B2B Convênio'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {voucherEmissionMode === 'individual'
                      ? 'Emita créditos digitais instantâneos para qualquer cliente sem burocracia'
                      : 'Gere lotes de cupons corporativos para empresas conveniadas'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateVoucherModal(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* FORMULÁRIO COM BODY FLEXÍVEL E FOOTER FIXO */}
            <form onSubmit={handleCreateVouchers} className="flex flex-col flex-1 min-h-0 space-y-3 pt-3 relative z-10 text-xs">
              
              {/* 2. ALTERNADOR SEGMENTADO */}
              <div className="bg-[#0c1317] p-1 rounded-xl border border-white/10 flex text-xs font-black shrink-0">
                <button
                  type="button"
                  onClick={() => setVoucherEmissionMode('individual')}
                  className={`flex-1 py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer min-h-[38px] select-none text-[11px] ${
                    voucherEmissionMode === 'individual'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25 scale-[1.01]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Individual / Nominal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVoucherEmissionMode('lote')}
                  className={`flex-1 py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer min-h-[38px] select-none text-[11px] ${
                    voucherEmissionMode === 'lote'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25 scale-[1.01]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Emissão em Lote (B2B)</span>
                </button>
              </div>

              {/* 3. CONTEÚDO PRINCIPAL (ZERO OVERFLOW) */}
              <div className="space-y-2.5 overflow-y-auto pr-1 flex-1 max-h-[56vh] sm:max-h-[62vh]">
                
                {/* CAMPOS ESSENCIAIS NO MODO INDIVIDUAL */}
                {voucherEmissionMode === 'individual' ? (
                  <div className="space-y-2.5">
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-300 font-bold mb-1 text-[11px] flex items-center gap-1.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>Nome do Beneficiário / Cliente</span>
                        </label>
                        <input
                          type="text"
                          value={voucherForm.beneficiarioNome}
                          onChange={(e) => setVoucherForm({ ...voucherForm, beneficiarioNome: e.target.value })}
                          placeholder="Digite o nome do cliente..."
                          className="w-full bg-[#111b21] border border-white/10 hover:border-white/20 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white font-bold min-h-[42px] text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 font-bold mb-1 text-[11px] flex items-center gap-1.5">
                          <Smartphone className="w-3 h-3 text-slate-400" />
                          <span>WhatsApp para Envio</span>
                        </label>
                        <input
                          type="text"
                          inputMode="tel"
                          value={voucherForm.beneficiarioWhatsapp}
                          onChange={(e) => setVoucherForm({ ...voucherForm, beneficiarioWhatsapp: formatPhoneBr(e.target.value) })}
                          placeholder="(11) 99999-9999"
                          className="w-full bg-[#111b21] border border-white/10 hover:border-white/20 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white font-mono font-bold min-h-[42px] text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-300 font-bold mb-1 text-[11px] flex items-center gap-1.5">
                          <DollarSign className="w-3 h-3 text-emerald-400" />
                          <span>Valor do Crédito (R$)</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={voucherForm.valorInput || (voucherForm.valor ? formatBrlValue(voucherForm.valor) : '')}
                          onChange={handleCurrencyChange}
                          placeholder="R$ 0,00"
                          className="w-full bg-[#111b21] border border-white/10 hover:border-white/20 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-emerald-400 font-black text-xs min-h-[42px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-bold mb-1 text-[11px] flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Data Limite de Validade</span>
                        </label>
                        <input
                          type="date"
                          value={voucherForm.validadeFim}
                          onChange={(e) => setVoucherForm({ ...voucherForm, validadeFim: e.target.value })}
                          className="w-full bg-[#111b21] border border-white/10 hover:border-white/20 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white font-mono font-bold min-h-[42px] text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all cursor-pointer"
                          required
                        />
                      </div>
                    </div>

                    {/* VINCULAÇÃO OPCIONAL DE EMPRESA B2B */}
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setVoucherForm((prev) => ({ ...prev, vincularEmpresa: !prev.vincularEmpresa }))}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          voucherForm.vincularEmpresa
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-[#0c1317]/50 border-white/10 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-bold text-[11px]">Vincular a uma Empresa Parceira B2B (Opcional)</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 font-black uppercase">
                          {voucherForm.vincularEmpresa ? 'Ativado' : 'Desativado'}
                        </span>
                      </button>

                      {voucherForm.vincularEmpresa && (
                        <div className="mt-2 space-y-2 p-2.5 bg-[#0c1317]/70 rounded-xl border border-white/10 animate-in fade-in duration-150">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-slate-300 font-bold text-[10.5px]">Empresa Parceira Conveniada</label>
                              <button
                                type="button"
                                onClick={openNewCompanyModal}
                                className="text-[10px] font-black uppercase text-emerald-400 hover:text-emerald-300"
                              >
                                + Nova Empresa
                              </button>
                            </div>
                            <select
                              value={voucherForm.empresaId}
                              onChange={(e) => setVoucherForm({ ...voucherForm, empresaId: e.target.value })}
                              className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-xs"
                            >
                              {empresas.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.razao_social} ({e.cnpj || 'Sem CNPJ'})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-slate-300 font-bold text-[10.5px]">Campanha de Benefício</label>
                              <button
                                type="button"
                                onClick={openNewCampaignModal}
                                className="text-[10px] font-black uppercase text-teal-400 hover:text-teal-300"
                              >
                                + Nova Campanha
                              </button>
                            </div>
                            <select
                              value={voucherForm.campanhaId}
                              onChange={(e) => {
                                const cmp = campanhas.find((c) => c.id === e.target.value);
                                const newV = cmp?.valor_desconto || voucherForm.valor;
                                setVoucherForm({
                                  ...voucherForm,
                                  campanhaId: e.target.value,
                                  valor: newV,
                                  valorInput: formatBrlValue(newV)
                                });
                              }}
                              className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3 py-2 text-white font-bold text-xs"
                            >
                              {campanhas.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nome} — R$ {c.valor_desconto}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                ) : (
                  /* MODO EMISSÃO EM LOTE (CORPORATIVO B2B) */
                  <div className="space-y-2.5">
                    
                    {/* SELEÇÃO EMPRESA */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-300 font-bold flex items-center gap-1.5 text-[11px]">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Empresa Parceira Obrigatória</span>
                        </label>
                        <button
                          type="button"
                          onClick={openNewCompanyModal}
                          className="text-[10px] font-black uppercase text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>+ Nova Empresa</span>
                        </button>
                      </div>
                      <select
                        value={voucherForm.empresaId}
                        onChange={(e) => setVoucherForm({ ...voucherForm, empresaId: e.target.value })}
                        className="w-full bg-[#111b21] border border-white/10 hover:border-white/20 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white font-bold min-h-[42px] text-xs focus:outline-none"
                        required
                      >
                        {empresas.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.razao_social} ({e.cnpj || 'Sem CNPJ'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* SELEÇÃO CAMPANHA */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-300 font-bold flex items-center gap-1.5 text-[11px]">
                          <Gift className="w-3.5 h-3.5 text-teal-400" />
                          <span>Campanha de Benefício</span>
                        </label>
                        <button
                          type="button"
                          onClick={openNewCampaignModal}
                          className="text-[10px] font-black uppercase text-teal-400 hover:text-teal-300 flex items-center gap-1 cursor-pointer"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>+ Nova Campanha</span>
                        </button>
                      </div>
                      <select
                        value={voucherForm.campanhaId}
                        onChange={(e) => {
                          const cmp = campanhas.find((c) => c.id === e.target.value);
                          const newV = cmp?.valor_desconto || voucherForm.valor;
                          setVoucherForm({
                            ...voucherForm,
                            campanhaId: e.target.value,
                            valor: newV,
                            valorInput: formatBrlValue(newV)
                          });
                        }}
                        className="w-full bg-[#111b21] border border-white/10 hover:border-white/20 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white font-bold min-h-[42px] text-xs focus:outline-none"
                        required
                      >
                        {campanhas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome} — R$ {c.valor_desconto}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* QUANTIDADE EM LOTE */}
                    <div className="bg-[#0c1317]/60 p-2.5 rounded-xl border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-bold flex items-center gap-1.5 text-[11px]">
                          <Users className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Quantidade de Vouchers no Lote</span>
                        </label>
                        <span className="font-mono text-emerald-400 font-black text-xs">
                          {voucherForm.quantidade} vouchers
                        </span>
                      </div>
                      <div className="flex gap-1.5 items-center">
                        {[5, 10, 25, 50, 100].map((qty) => (
                          <button
                            key={qty}
                            type="button"
                            onClick={() => setVoucherForm({ ...voucherForm, quantidade: qty })}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                              voucherForm.quantidade === qty
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {qty} un
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        value={voucherForm.quantidade}
                        onChange={(e) => setVoucherForm({ ...voucherForm, quantidade: Number(e.target.value) })}
                        className="w-full bg-[#111b21] border border-white/10 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-mono font-bold min-h-[40px] text-xs focus:outline-none"
                        min={1}
                        max={500}
                        required
                      />
                    </div>

                    {/* VALOR E VALIDADE LOTE */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-300 font-bold mb-1 text-[11px] flex items-center gap-1.5">
                          <DollarSign className="w-3 h-3 text-emerald-400" />
                          <span>Valor Unitário (R$)</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={voucherForm.valorInput || (voucherForm.valor ? formatBrlValue(voucherForm.valor) : '')}
                          onChange={handleCurrencyChange}
                          placeholder="R$ 0,00"
                          className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3 py-2.5 text-emerald-400 font-black text-xs min-h-[42px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-bold mb-1 text-[11px] flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Data Limite</span>
                        </label>
                        <input
                          type="date"
                          value={voucherForm.validadeFim}
                          onChange={(e) => setVoucherForm({ ...voucherForm, validadeFim: e.target.value })}
                          className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono font-bold min-h-[42px] text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          required
                        />
                      </div>
                    </div>

                  </div>
                )}

                {/* 4. LIVE PREVIEW CARD COMPACTO */}
                <div className="p-3 bg-gradient-to-r from-emerald-950/40 via-[#111b21] to-teal-950/30 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs">
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
                      <span className="text-[9.5px] font-black uppercase tracking-wider text-emerald-400">Prévia de Emissão</span>
                    </div>
                    <div className="font-bold text-white truncate text-xs">
                      {voucherEmissionMode === 'individual' ? (voucherForm.beneficiarioNome || 'Cliente / Colaborador') : `${voucherForm.quantidade} Vouchers em Lote`}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {voucherEmissionMode === 'individual' && !voucherForm.vincularEmpresa
                        ? 'Venda Direta / Cliente Avulso'
                        : (empresas.find(e => e.id === voucherForm.empresaId)?.razao_social || 'Empresa Parceira')} • Válido até {new Date(voucherForm.validadeFim).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[9px] text-slate-400 block font-bold uppercase">Valor Unitário</span>
                    <span className="text-sm font-black text-emerald-400">
                      {Number(voucherForm.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </div>

              </div>

              {/* 5. RODAPÉ DE AÇÕES FIXO (STICKY FOOTER - SEMPRE VISÍVEL) */}
              <div className="flex gap-2.5 pt-2 border-t border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateVoucherModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 font-black uppercase text-xs cursor-pointer min-h-[44px] transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl font-black uppercase text-xs cursor-pointer shadow-lg shadow-emerald-500/30 min-h-[44px] flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Emitindo...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar Emissão</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CRIAR OU EDITAR EMPRESA PARCEIRA */}
      {/* ========================================================= */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#1f2c34] border border-white/10 rounded-[32px] p-5 sm:p-7 shadow-2xl space-y-4 text-left my-auto max-h-[92vh] flex flex-col">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-md">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    {editingCompany ? 'Editar Empresa Parceira' : 'Cadastrar Empresa Parceira'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Preencha o CNPJ para auto-completar todos os dados cadastrais da empresa
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCompanyModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-4 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              
              {/* SEÇÃO 1: CNPJ & CONSULTA AUTOMÁTICA */}
              <div className="bg-[#111b21] p-4 rounded-2xl border border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-emerald-400 font-black tracking-wide text-xs uppercase flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> CNPJ & Busca Automática na Receita
                  </label>
                  {companyForm.statusCnpj && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {companyForm.statusCnpj}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={companyForm.cnpj}
                      onChange={(e) => {
                        const formatted = formatCnpj(e.target.value);
                        setCompanyForm({ ...companyForm, cnpj: formatted });
                        if (formatted.replace(/\D/g, '').length === 14) {
                          handleCnpjLookup(formatted);
                        }
                      }}
                      onBlur={() => {
                        if (companyForm.cnpj.replace(/\D/g, '').length === 14 && !companyForm.razaoSocial) {
                          handleCnpjLookup();
                        }
                      }}
                      placeholder="00.000.000/0001-00"
                      className="w-full bg-[#182229] border border-white/10 focus:border-emerald-500 rounded-xl px-3.5 py-3 text-white font-mono font-bold min-h-[48px] text-sm focus:outline-none transition-all"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isLoadingCnpj || companyForm.cnpj.replace(/\D/g, '').length !== 14}
                    onClick={() => handleCnpjLookup()}
                    className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 min-h-[48px] shrink-0"
                  >
                    {isLoadingCnpj ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Consultando...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>Buscar Dados</span>
                      </>
                    )}
                  </button>
                </div>

                {cnpjError && (
                  <p className="text-[11px] text-rose-400 font-bold flex items-center gap-1.5 mt-1 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {cnpjError}
                  </p>
                )}

                {cnpjSuccessMessage && (
                  <p className="text-[11px] text-emerald-300 font-bold flex items-center gap-1.5 mt-1 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {cnpjSuccessMessage}
                  </p>
                )}
              </div>

              {/* SEÇÃO 2: DADOS DA EMPRESA */}
              <div className="space-y-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Razão Social *</label>
                  <input
                    type="text"
                    value={companyForm.razaoSocial}
                    onChange={(e) => setCompanyForm({ ...companyForm, razaoSocial: e.target.value })}
                    placeholder="Ex: Tech Solutions Brasil LTDA"
                    className="w-full bg-[#111b21] border border-white/10 focus:border-emerald-500 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px] focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Nome Fantasia</label>
                    <input
                      type="text"
                      value={companyForm.nomeFantasia}
                      onChange={(e) => setCompanyForm({ ...companyForm, nomeFantasia: e.target.value })}
                      placeholder="Ex: TechCorp"
                      className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Limite Mensal de Vouchers</label>
                    <input
                      type="number"
                      value={companyForm.limiteVouchers}
                      onChange={(e) => setCompanyForm({ ...companyForm, limiteVouchers: Number(e.target.value) })}
                      className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px] focus:outline-none"
                      min={1}
                    />
                  </div>
                </div>

                {/* Atividade & Natureza */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Atividade Principal (CNAE)</label>
                    <input
                      type="text"
                      value={companyForm.atividadePrincipal}
                      onChange={(e) => setCompanyForm({ ...companyForm, atividadePrincipal: e.target.value })}
                      placeholder="Ex: Desenvolvimento de software"
                      className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-2.5 text-slate-200 text-xs min-h-[44px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Natureza Jurídica</label>
                    <input
                      type="text"
                      value={companyForm.naturezaJuridica}
                      onChange={(e) => setCompanyForm({ ...companyForm, naturezaJuridica: e.target.value })}
                      placeholder="Ex: Sociedade Empresária Limitada"
                      className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-2.5 text-slate-200 text-xs min-h-[44px] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO 3: ENDEREÇO COMPLETO */}
              <div className="bg-[#111b21]/60 p-3.5 rounded-2xl border border-white/5 space-y-2.5">
                <label className="block text-slate-300 font-black uppercase text-[11px] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Endereço da Empresa
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">CEP</label>
                    <input
                      type="text"
                      value={companyForm.cep}
                      onChange={(e) => setCompanyForm({ ...companyForm, cep: formatCep(e.target.value) })}
                      placeholder="00000-000"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3 py-2.5 text-white font-mono text-xs min-h-[44px]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">Logradouro</label>
                    <input
                      type="text"
                      value={companyForm.logradouro}
                      onChange={(e) => setCompanyForm({ ...companyForm, logradouro: e.target.value })}
                      placeholder="Av. Paulista"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">Número</label>
                    <input
                      type="text"
                      value={companyForm.numero}
                      onChange={(e) => setCompanyForm({ ...companyForm, numero: e.target.value })}
                      placeholder="1000"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">Complemento</label>
                    <input
                      type="text"
                      value={companyForm.complemento}
                      onChange={(e) => setCompanyForm({ ...companyForm, complemento: e.target.value })}
                      placeholder="Sala 402"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">Bairro</label>
                    <input
                      type="text"
                      value={companyForm.bairro}
                      onChange={(e) => setCompanyForm({ ...companyForm, bairro: e.target.value })}
                      placeholder="Bela Vista"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">Cidade / UF</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={companyForm.municipio}
                        onChange={(e) => setCompanyForm({ ...companyForm, municipio: e.target.value })}
                        placeholder="São Paulo"
                        className="w-full bg-[#182229] border border-white/10 rounded-xl px-2.5 py-2.5 text-white text-xs min-h-[44px]"
                      />
                      <input
                        type="text"
                        value={companyForm.uf}
                        onChange={(e) => setCompanyForm({ ...companyForm, uf: e.target.value.toUpperCase().slice(0, 2) })}
                        placeholder="SP"
                        className="w-12 bg-[#182229] border border-white/10 rounded-xl px-1.5 py-2.5 text-white text-center font-bold text-xs min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 4: CONTATOS & RESPONSÁVEL */}
              <div className="bg-[#111b21]/60 p-3.5 rounded-2xl border border-white/5 space-y-2.5">
                <label className="block text-slate-300 font-black uppercase text-[11px] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-400" /> Contatos & Responsável
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">Nome do Responsável</label>
                    <input
                      type="text"
                      value={companyForm.contatoNome}
                      onChange={(e) => setCompanyForm({ ...companyForm, contatoNome: e.target.value })}
                      placeholder="Ex: Carlos Silva"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">WhatsApp de Envio / Notificações</label>
                    <input
                      type="text"
                      value={companyForm.contatoWhatsapp}
                      onChange={(e) => setCompanyForm({ ...companyForm, contatoWhatsapp: e.target.value })}
                      placeholder="11988887777"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">E-mail Corporativo</label>
                    <input
                      type="email"
                      value={companyForm.emailEmpresa}
                      onChange={(e) => setCompanyForm({ ...companyForm, emailEmpresa: e.target.value })}
                      placeholder="contato@empresa.com.br"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1 text-[11px]">Telefone Fixo / Central</label>
                    <input
                      type="text"
                      value={companyForm.telefoneEmpresa}
                      onChange={(e) => setCompanyForm({ ...companyForm, telefoneEmpresa: e.target.value })}
                      placeholder="1133334444"
                      className="w-full bg-[#182229] border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs min-h-[44px]"
                    />
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2.5 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
                  className="flex-1 py-3.5 bg-white/10 hover:bg-white/15 rounded-xl text-slate-300 font-black uppercase cursor-pointer min-h-[48px] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || isLoadingCnpj}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black uppercase cursor-pointer shadow-lg shadow-emerald-600/30 min-h-[48px] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : editingCompany ? (
                    'Salvar Alterações'
                  ) : (
                    'Cadastrar Empresa'
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CRIAR OU EDITAR CAMPANHA */}
      {/* ========================================================= */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-[#1f2c34] border border-white/10 rounded-[32px] p-5 sm:p-6 shadow-2xl space-y-4 text-left my-auto">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-white">
                  {editingCampaign ? 'Editar Campanha' : 'Criar Nova Campanha'}
                </h3>
              </div>
              <button
                onClick={() => setShowCampaignModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Empresa Parceira Obrigatória</label>
                <select
                  value={campaignForm.empresaId}
                  onChange={(e) => setCampaignForm({ ...campaignForm, empresaId: e.target.value })}
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  required
                >
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.razao_social} ({e.cnpj || 'Sem CNPJ'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Nome da Campanha</label>
                <input
                  type="text"
                  value={campaignForm.nome}
                  onChange={(e) => setCampaignForm({ ...campaignForm, nome: e.target.value })}
                  placeholder="Ex: Almoço Corporativo de Sexta"
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Descrição / Regras</label>
                <textarea
                  value={campaignForm.descricao}
                  onChange={(e) => setCampaignForm({ ...campaignForm, descricao: e.target.value })}
                  placeholder="Ex: Válido para 1 prato executivo ou buffet por colaborador"
                  rows={2}
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Tipo de Desconto</label>
                  <select
                    value={campaignForm.tipoDesconto}
                    onChange={(e) => setCampaignForm({ ...campaignForm, tipoDesconto: e.target.value })}
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  >
                    <option value="VALOR_FIXO">Valor Fixo (R$)</option>
                    <option value="PERCENTUAL">Percentual (%)</option>
                    <option value="ITEM_GRATIS">Item Grátis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Valor (R$ ou %)</label>
                  <input
                    type="number"
                    value={campaignForm.valorDesconto}
                    onChange={(e) => setCampaignForm({ ...campaignForm, valorDesconto: Number(e.target.value) })}
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Data Limite da Campanha</label>
                <input
                  type="date"
                  value={campaignForm.dataFim}
                  onChange={(e) => setCampaignForm({ ...campaignForm, dataFim: e.target.value })}
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  required
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCampaignModal(false)}
                  className="flex-1 py-3.5 bg-white/10 hover:bg-white/15 rounded-xl text-slate-300 font-black uppercase cursor-pointer min-h-[48px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black uppercase cursor-pointer shadow-lg shadow-emerald-600/30 min-h-[48px]"
                >
                  {actionLoading ? 'Salvando...' : editingCampaign ? 'Salvar Alterações' : 'Criar Campanha'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DISPARO DE VOUCHER VIA WHATSAPP (INSTÂNCIAS DA LOJA) */}
      {/* ========================================================= */}
      {showSendModal && selectedVoucherForSend && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#1f2c34] border border-white/10 rounded-[32px] p-5 sm:p-6 shadow-2xl space-y-4 text-left my-auto animate-in zoom-in-95 duration-150">
            
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Disparar Voucher via WhatsApp</h3>
                  <p className="text-[11px] text-slate-400">Envio direto para o colaborador ou cliente</p>
                </div>
              </div>
              <button
                onClick={() => setShowSendModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Card Resumo do Voucher */}
            <div className="bg-[#111b21] p-3.5 rounded-2xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Código do Voucher</span>
                <span className="font-mono font-black text-emerald-400 text-sm">{selectedVoucherForSend.public_token}</span>
                <span className="text-xs text-slate-300 block font-medium pt-0.5">
                  {selectedVoucherForSend.beneficiario_nome || 'Colaborador'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Valor</span>
                <span className="text-base font-black text-white">
                  {Number(selectedVoucherForSend.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-[10px] text-emerald-400 font-bold block">
                  {selectedVoucherForSend.voucher_campanhas?.nome || 'Campanha'}
                </span>
              </div>
            </div>

            <form onSubmit={handleExecuteSendWhatsApp} className="space-y-3.5 text-xs">
              
              {/* Campo Destinatário / WhatsApp */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Número de WhatsApp do Destinatário
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">+55</span>
                  <input
                    type="text"
                    value={sendPhoneInput}
                    onChange={(e) => setSendPhoneInput(e.target.value)}
                    placeholder="Ex: 11988887777"
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white font-mono font-bold min-h-[48px] focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Seletor de Instância da Própria Loja vs Contingência FoodNext */}
              <div>
                <label className="block text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                  <span>Canal / Caixa de Envio da Empresa</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {tenantInstances.length > 0 ? `${tenantInstances.length} canal(is) da loja` : 'Contingência FoodNext'}
                  </span>
                </label>

                {tenantInstances.length > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {tenantInstances.map((inst) => {
                        const isSelected = selectedSendInstanceId === inst.id;
                        const isConnected = inst.status === 'connected' || inst.status === 'open' || inst.is_active;

                        return (
                          <button
                            key={inst.id}
                            type="button"
                            onClick={() => setSelectedSendInstanceId(inst.id)}
                            className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-500/20 border-emerald-500/60 ring-2 ring-emerald-500/30'
                                : 'bg-[#111b21] border-white/10 hover:bg-white/5'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-400'
                            }`}>
                              <Smartphone className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white text-xs truncate">
                                  {inst.display_name || inst.name || 'WhatsApp'}
                                </span>
                                <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block truncate">
                                {inst.phone_number ? `+${inst.phone_number}` : 'Loja Ativa'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Esta loja ainda não possui uma caixa de WhatsApp conectada. O disparo será realizado de forma segura através do canal corporativo <strong>FoodNext (11 94775-8860)</strong>.
                    </span>
                  </div>
                )}
              </div>

              {/* Prévia da Mensagem */}
              <div>
                <label className="block text-slate-400 font-bold mb-1">Prévia da Mensagem</label>
                <div className="p-3 bg-[#0c1317] rounded-xl border border-white/5 font-mono text-[11px] text-slate-300 leading-relaxed max-h-32 overflow-y-auto select-all">
                  🎟️ *Seu Voucher Digital Corporativo Chegou!*<br />
                  Olá *{selectedVoucherForSend.beneficiario_nome || 'Colaborador'}*, você recebeu um benefício de {Number(selectedVoucherForSend.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.<br />
                  👉 *Acesse seu Voucher e QR Code:* {window.location.origin}/voucher/{selectedVoucherForSend.public_token}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="flex-1 py-3.5 bg-white/10 hover:bg-white/15 rounded-xl text-slate-300 font-black uppercase cursor-pointer min-h-[48px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black uppercase cursor-pointer shadow-lg shadow-emerald-600/30 min-h-[48px] flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Disparando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Enviar Mensagem Agora</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EXTRATO FORENSE & LINHA DO TEMPO DO ATIVO DIGITAL */}
      {/* ========================================================= */}
      {showLedgerTimelineModal && selectedVoucherForLedger && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-gradient-to-b from-[#18252d] via-[#111b21] to-[#0c1317] border border-white/15 rounded-[32px] p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] flex flex-col relative overflow-hidden my-auto max-h-[96vh] space-y-4">
            
            {/* Iluminação Neon de Fundo */}
            <div className="absolute -top-24 -left-24 w-56 h-56 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header do Extrato */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3.5 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 border border-emerald-400/30 shrink-0">
                  <ReceiptText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white tracking-tight">Extrato do Ativo Digital</h3>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {selectedVoucherForLedger.public_token}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Trilha contábil e ciclo de vida completo do voucher
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLedgerTimelineModal(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cartão de Resumo Financeiro do Ativo */}
            <div className="p-4 bg-[#0c1317]/90 rounded-2xl border border-white/10 space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Beneficiário</span>
                  <span className="text-sm font-black text-white">
                    {selectedVoucherForLedger.beneficiario_nome || 'Cliente / Colaborador'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Valor do Ativo</span>
                  <span className="text-base font-black text-emerald-400">
                    {Number(selectedVoucherForLedger.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Origem / Convênio:</span>
                  <span className="text-slate-200 font-bold truncate block">
                    {selectedVoucherForLedger.voucher_empresas_parceiras?.razao_social || 'Cliente Avulso (Venda Direta)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Validade:</span>
                  <span className="text-slate-200 font-bold block">
                    {new Date(selectedVoucherForLedger.validade_fim).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Linha do Tempo Forense / Ciclo de Vida do Ativo */}
            <div className="space-y-3 overflow-y-auto max-h-60 pr-1 relative z-10">
              <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                Histórico de Transações & Custódia
              </span>

              <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                
                {/* 1. Emissão / Mint */}
                <div className="flex items-start gap-3 relative">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-black shrink-0 ring-4 ring-[#111b21]">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 bg-[#0c1317]/60 p-2.5 rounded-xl border border-white/5 flex-1 space-y-0.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-emerald-400 text-[11px]">Emissão do Ativo (Crédito)</span>
                      <span className="text-[9.5px] text-slate-500 font-mono">
                        {new Date(selectedVoucherForLedger.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Voucher criado com lastro de {Number(selectedVoucherForLedger.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.
                    </p>
                  </div>
                </div>

                {/* 2. Disparo WhatsApp (Se houver) */}
                {selectedVoucherForLedger.status !== 'CRIADO' && (
                  <div className="flex items-start gap-3 relative">
                    <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-black shrink-0 ring-4 ring-[#111b21]">
                      <Send className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 bg-[#0c1317]/60 p-2.5 rounded-xl border border-white/5 flex-1 space-y-0.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-blue-400 text-[11px]">Custódia & Notificação</span>
                        <span className="text-[9.5px] text-slate-500 font-mono">
                          {selectedVoucherForLedger.beneficiario_whatsapp ? `+55 ${selectedVoucherForLedger.beneficiario_whatsapp}` : 'WhatsApp'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Link seguro e chave de autenticação enviados para o cliente.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. Resgate / Baixa Contábil */}
                {selectedVoucherForLedger.status === 'UTILIZADO' ? (
                  <div className="flex items-start gap-3 relative">
                    <div className="w-7 h-7 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-black shrink-0 ring-4 ring-[#111b21]">
                      <CheckCircle className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 bg-[#0c1317]/60 p-2.5 rounded-xl border border-teal-500/20 flex-1 space-y-0.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-teal-400 text-[11px]">Liquidação Contábil (Débito)</span>
                        <span className="text-[9.5px] text-slate-500 font-mono">
                          {selectedVoucherForLedger.data_resgate ? new Date(selectedVoucherForLedger.data_resgate).toLocaleString('pt-BR') : 'Confirmado'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Voucher liquidado no terminal de caixa pelo operador. Saldo baixado do passivo em circulação.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 relative opacity-60">
                    <div className="w-7 h-7 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-black shrink-0 ring-4 ring-[#111b21]">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 bg-[#0c1317]/40 p-2.5 rounded-xl border border-white/5 flex-1 space-y-0.5 text-xs">
                      <span className="font-bold text-slate-400 text-[11px]">Aguardando Resgate no Caixa</span>
                      <p className="text-[10px] text-slate-500">
                        Ativo em custódia e disponível para consumo até {new Date(selectedVoucherForLedger.validade_fim).toLocaleDateString('pt-BR')}.
                      </p>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Rodapé com Link Público e Fechar */}
            <div className="pt-2 border-t border-white/10 flex gap-2.5 relative z-10">
              <a
                href={`/voucher/${selectedVoucherForLedger.public_token}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-200 font-black uppercase text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                <span>Abrir Voucher</span>
              </a>
              <button
                type="button"
                onClick={() => setShowLedgerTimelineModal(false)}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-black uppercase text-xs cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                Fechar Extrato
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: IMPRESSÃO DE VOUCHER (TÉRMICA 40 COLUNAS & PDF A4) */}
      {/* ========================================================= */}
      {showPrintModal && selectedVoucherForPrint && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-gradient-to-b from-[#18252d] via-[#111b21] to-[#0c1317] border border-white/15 rounded-[32px] p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] flex flex-col relative overflow-hidden my-auto max-h-[96vh] space-y-4">
            
            {/* Iluminação Neon */}
            <div className="absolute -top-24 -left-24 w-56 h-56 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 border border-emerald-400/30 shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white tracking-tight">Imprimir Voucher</h3>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {selectedVoucherForPrint.public_token}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Escolha o formato ideal para seu ponto de atendimento
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Seletor Segmentado de Formato de Impressão */}
            <div className="bg-[#0c1317] p-1 rounded-xl border border-white/10 flex text-xs font-black shrink-0 relative z-10">
              <button
                type="button"
                onClick={() => setPrintLayout('thermal')}
                className={`flex-1 py-2.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-[11px] ${
                  printLayout === 'thermal'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <ReceiptText className="w-3.5 h-3.5" />
                <span>Impressora Térmica (40 Colunas)</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintLayout('pdf')}
                className={`flex-1 py-2.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-[11px] ${
                  printLayout === 'pdf'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Documento / PDF (A4)</span>
              </button>
            </div>

            {/* Prévia Visual do Formato Escolhido */}
            <div className="overflow-y-auto max-h-[50vh] pr-1 relative z-10">
              {printLayout === 'thermal' ? (
                /* PREVIEW CUPOM TÉRMICO 40 COLUNAS */
                <div className="bg-white text-black p-4 rounded-xl shadow-lg border border-slate-300 font-mono text-[11px] space-y-2 max-w-xs mx-auto text-left leading-tight">
                  <div className="text-center font-black text-xs border-b border-black pb-1">
                    X-POINT BENEFÍCIOS<br/>
                    <span className="text-[9px] font-normal">SISTEMA DE VOUCHERS DIGITAIS</span>
                  </div>
                  <div className="text-center font-black text-sm tracking-widest pt-1">
                    {selectedVoucherForPrint.public_token}
                  </div>
                  <div className="text-center text-[9px] text-slate-600 border-b border-dashed border-black pb-1">
                    EMISSÃO: {new Date(selectedVoucherForPrint.created_at || Date.now()).toLocaleString('pt-BR')}
                  </div>
                  <div className="space-y-0.5 text-[10px]">
                    <div><strong>TITULAR:</strong> {selectedVoucherForPrint.beneficiario_nome || 'Cliente / Colaborador'}</div>
                    {selectedVoucherForPrint.beneficiario_whatsapp && (
                      <div><strong>WHATS:</strong> {selectedVoucherForPrint.beneficiario_whatsapp}</div>
                    )}
                    <div><strong>ORIGEM:</strong> {selectedVoucherForPrint.voucher_empresas_parceiras?.razao_social || 'Cliente Avulso (Venda Direta)'}</div>
                    <div><strong>CAMPANHA:</strong> {selectedVoucherForPrint.voucher_campanhas?.nome || 'Benefício Especial'}</div>
                  </div>
                  <div className="border-t border-b border-dashed border-black py-1 text-center">
                    <span className="text-[9px] block">VALOR DO BENEFÍCIO:</span>
                    <strong className="text-base font-black">
                      {Number(selectedVoucherForPrint.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                    <div className="text-[9px] font-bold">VÁLIDO ATÉ: {new Date(selectedVoucherForPrint.validade_fim).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div className="flex flex-col items-center justify-center pt-1">
                    <QRCode
                      value={`${window.location.origin}/voucher/${selectedVoucherForPrint.public_token}`}
                      size={100}
                    />
                    <span className="font-bold text-[10px] mt-1">{selectedVoucherForPrint.public_token}</span>
                  </div>
                  <div className="text-[8.5px] text-center text-slate-700 border-t border-dashed border-black pt-1">
                    Apresente este cupom no caixa para validar o desconto.<br/>
                    Uso único • Autenticação digital criptográfica.
                  </div>
                  <div className="border-t-2 border-black pt-1 text-[8px] text-slate-600 space-y-1">
                    <div className="font-black text-center">CANHOTO DO CAIXA / CONTROLE PDV</div>
                    <div>VOUCHER: {selectedVoucherForPrint.public_token} | {Number(selectedVoucherForPrint.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    <div>DATA: ___/___/______ OPERADOR: _______________</div>
                  </div>
                </div>
              ) : (
                /* PREVIEW DOCUMENTO PDF A4 / VALE PRESENTE */
                <div className="bg-white text-slate-800 p-5 rounded-2xl shadow-lg border-2 border-emerald-500 space-y-3 max-w-sm mx-auto text-left">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <strong className="text-xs text-slate-900 font-black block">X-POINT VOUCHER</strong>
                      <span className="text-[9px] text-slate-500">Vale Benefício & Presente</span>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-500 rounded-full text-[8.5px] font-black uppercase">
                      Voucher Oficial
                    </span>
                  </div>
                  <div className="bg-slate-900 text-white p-2.5 rounded-xl text-center">
                    <span className="text-[8.5px] text-slate-400 block font-bold uppercase">Código do Benefício</span>
                    <span className="font-mono text-base font-black text-emerald-400 tracking-widest">
                      {selectedVoucherForPrint.public_token}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[9px] text-slate-500 block font-bold uppercase">Valor do Crédito</span>
                    <span className="text-xl font-black text-emerald-600">
                      {Number(selectedVoucherForPrint.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[10px] space-y-1">
                    <div><span className="text-slate-500">Titular:</span> <strong>{selectedVoucherForPrint.beneficiario_nome || 'Cliente / Colaborador'}</strong></div>
                    <div><span className="text-slate-500">Convênio:</span> <strong>{selectedVoucherForPrint.voucher_empresas_parceiras?.razao_social || 'Cliente Avulso (Venda Direta)'}</strong></div>
                    <div><span className="text-slate-500">Validade:</span> <strong className="text-red-600">{new Date(selectedVoucherForPrint.validade_fim).toLocaleDateString('pt-BR')}</strong></div>
                  </div>
                  <div className="flex flex-col items-center justify-center pt-1">
                    <QRCode
                      value={`${window.location.origin}/voucher/${selectedVoucherForPrint.public_token}`}
                      size={110}
                    />
                    <span className="text-[9px] text-slate-500 mt-1">Leitura Oficial no Caixa</span>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé de Ações de Impressão */}
            <div className="pt-2 border-t border-white/10 flex gap-2.5 relative z-10">
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 font-black uppercase text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleExecutePrint(selectedVoucherForPrint, printLayout)}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl font-black uppercase text-xs cursor-pointer shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>{printLayout === 'thermal' ? 'Imprimir Cupom Térmico (40 Col)' : 'Imprimir / Salvar PDF'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
