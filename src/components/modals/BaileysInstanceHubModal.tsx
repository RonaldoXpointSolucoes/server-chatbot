import React, { useState, useEffect } from 'react';
import {
  X, Shield, Store, ShoppingBag, Zap, PhoneOff, Lock, RefreshCw, Check,
  Sparkles, User, Image as ImageIcon, Globe, Mail, MapPin, Tag, MessageSquare,
  Ban, PhoneCall, Video, Copy, ExternalLink, AlertTriangle, CheckCircle2, Send
} from 'lucide-react';
import { invokeBaileysAction } from '../../services/whatsappEngine';
import { supabase } from '../../services/supabase';

interface BaileysInstanceHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  instanceId: string;
  instanceName?: string;
  activeChatJid?: string;
  embedded?: boolean;
  initialTab?: 'profile' | 'business' | 'catalog' | 'shortcuts' | 'security';
}

export const BaileysInstanceHubModal: React.FC<BaileysInstanceHubModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  instanceId,
  instanceName,
  activeChatJid,
  embedded = false,
  initialTab
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'business' | 'catalog' | 'shortcuts' | 'security'>(initialTab || 'catalog');

  useEffect(() => {
    if (initialTab && isOpen) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(instanceId || '');
  const [instancesList, setInstancesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Aba 1: Perfil & Privacidade (Itens 17 e 18)
  const [profileName, setProfileName] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [privacy, setPrivacy] = useState<any>({
    lastSeen: 'all',
    online: 'all',
    readReceipts: 'all',
    callAdd: 'all',
    profilePicture: 'all',
    groupsAdd: 'all'
  });

  // Aba 2: Perfil Comercial & Capa (Item 8)
  const [bizDescription, setBizDescription] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizWebsite, setBizWebsite] = useState('');
  const [bizCoverUrl, setBizCoverUrl] = useState('');

  // Aba 3: Catálogo & GastroFood Sync (Item 7)
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncStats, setSyncStats] = useState<any>(null);

  // Aba 4: Respostas Rápidas & Etiquetas CRM (Itens 9 e 10)
  const [syncedLabels, setSyncedLabels] = useState<any[]>([]);
  const [quickRepliesCount, setQuickRepliesCount] = useState<number | null>(null);

  // Aba 5: Saúde do Chip, Chamadas & Bloqueios (Itens 14, 15, 16)
  const [healthData, setHealthData] = useState<any>(null);
  const [rejectCalls, setRejectCalls] = useState(false);
  const [rejectMessage, setRejectMessage] = useState(
    'Olá! 🤖 Não atendemos chamadas de voz ou vídeo por este número. Por favor, envie uma mensagem de texto ou áudio que responderemos em instantes!'
  );
  const [generatedCallLink, setGeneratedCallLink] = useState<string | null>(null);
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [newBlockJid, setNewBlockJid] = useState('');

  useEffect(() => {
    if (instanceId) setSelectedInstanceId(instanceId);
  }, [instanceId]);

  useEffect(() => {
    if (!isOpen && !embedded) return;
    const loadInstances = async () => {
      if (!tenantId) return;
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id, display_name, phone_number, status')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (data && data.length > 0) {
        setInstancesList(data);
        if (!selectedInstanceId) {
          const connected = data.find(d => d.status === 'connected') || data[0];
          setSelectedInstanceId(connected.id);
          setProfileName(connected.display_name || '');
        }
      }
    };
    loadInstances();
  }, [isOpen, embedded, tenantId]);

  useEffect(() => {
    if ((!isOpen && !embedded) || !selectedInstanceId || !tenantId) return;
    if (activeTab === 'profile') {
      loadPrivacySettings();
    } else if (activeTab === 'business') {
      loadBusinessProfile();
    } else if (activeTab === 'catalog') {
      loadCatalog();
    } else if (activeTab === 'security') {
      loadSecurityAndCalls();
    }
  }, [activeTab, selectedInstanceId, isOpen, embedded]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadPrivacySettings = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'getPrivacySettings', {});
      if (res?.ok && res.settings) {
        setPrivacy({
          lastSeen: res.settings.last || 'all',
          online: res.settings.online || 'all',
          readReceipts: res.settings.readreceipts || 'all',
          callAdd: res.settings.calladd || 'all',
          profilePicture: res.settings.profile || 'all',
          groupsAdd: res.settings.groupadd || 'all'
        });
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const loadBusinessProfile = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'getBusinessProfile', {});
      if (res?.ok && res.result) {
        setBizDescription(res.result.description || '');
        setBizAddress(res.result.address || '');
        setBizEmail(res.result.email || '');
        setBizWebsite(Array.isArray(res.result.website) ? res.result.website[0] || '' : '');
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'getCatalog', { limit: 40 });
      if (res?.ok && Array.isArray(res.result?.products) && res.result.products.length > 0) {
        setCatalogProducts(res.result.products);
      } else if (tenantId && tenantId !== '00000000-0000-0000-0000-000000000000') {
        const { data: localProds } = await supabase
          .from('cardapio_produtos')
          .select('*')
          .eq('tenant_id', tenantId)
          .or('ativo.eq.true,ativo.is.null')
          .order('name', { ascending: true })
          .limit(40);
        if (localProds) {
          setCatalogProducts(localProds.map((p: any) => ({ ...p, _fromCardapioDb: true })));
        }
      } else {
        setCatalogProducts([]);
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const loadSecurityAndCalls = async () => {
    setLoading(true);
    try {
      const [healthRes, callRes, blockRes] = await Promise.all([
        invokeBaileysAction(tenantId, selectedInstanceId, 'getAccountHealthLimits', {}),
        invokeBaileysAction(tenantId, selectedInstanceId, 'getCallSettings', {}),
        invokeBaileysAction(tenantId, selectedInstanceId, 'fetchBlocklist', {})
      ]);
      if (healthRes?.ok) setHealthData(healthRes);
      if (callRes?.ok) {
        setRejectCalls(Boolean(callRes.rejectCalls));
        if (callRes.rejectMessage) setRejectMessage(callRes.rejectMessage);
      }
      if (blockRes?.ok && Array.isArray(blockRes.blocklist)) {
        setBlocklist(blockRes.blocklist.filter(Boolean));
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  // Handlers Aba 1
  const handleSaveInstanceProfile = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'updateInstanceProfile', {
        name: profileName || undefined,
        status: profileStatus || undefined,
        pictureUrl: profilePicUrl || undefined
      });
      if (res?.ok) {
        showToast('success', 'Nome, Recado (Bio) e Foto atualizados no aparelho WhatsApp!');
      } else {
        showToast('error', res?.error || 'Não foi possível atualizar o perfil.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrivacy = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'updatePrivacySettings', privacy);
      if (res?.ok) {
        showToast('success', 'Configurações de privacidade do chip atualizadas no WhatsApp!');
      } else {
        showToast('error', res?.error || 'Falha ao salvar privacidade.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Handlers Aba 2
  const handleSaveBusinessProfile = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'updateBusinessProfile', {
        description: bizDescription,
        address: bizAddress,
        email: bizEmail,
        websites: bizWebsite ? [bizWebsite] : [],
        coverPhotoUrl: bizCoverUrl || undefined
      });
      if (res?.ok) {
        showToast('success', 'Perfil comercial e capa do WhatsApp Business atualizados!');
      } else {
        showToast('error', res?.error || 'Nota: Recursos comerciais exigem conta WhatsApp Business.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Handlers Aba 3
  const handleSyncGastrofoodToCatalog = async () => {
    setSyncingCatalog(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'syncGastrofoodCatalog', { limit: 40 });
      if (res?.ok) {
        setSyncStats(res);
        showToast('success', res.message || 'Cardápio GastroFood sincronizado com a vitrine do WhatsApp!');
        await loadCatalog();
      } else {
        showToast('error', res?.error || 'Falha ao sincronizar catálogo.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSyncingCatalog(false);
    }
  };

  const handleSendProductToActiveChat = async (prod: any) => {
    const target = activeChatJid || prompt('Digite o WhatsApp de destino (ex: 5511999999999):');
    if (!target) return;
    setLoading(true);
    try {
      const isLocalDbProd = Boolean(prod._fromCardapioDb || 'grupo_id' in prod);
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'sendProduct', {
        jid: target,
        product: {
          id: prod.id,
          title: prod.name || prod.nome,
          description: prod.description || prod.descricao || '',
          price: isLocalDbProd ? Number(prod.price ?? prod.preco ?? 0) : (prod.price ? Number(prod.price) / 1000 : Number(prod.preco || 0)),
          imageUrl: prod.imageUrls?.original || prod.image || prod.imagem_url || prod.imageUrl,
          url: prod.url
        }
      });
      if (res?.ok) {
        showToast('success', `Card do produto "${prod.name || prod.nome}" enviado na conversa!`);
      } else {
        showToast('error', res?.error || 'Falha ao enviar card do produto.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Handlers Aba 4
  const handleSyncQuickReplies = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'syncQuickReplies', {});
      if (res?.ok) {
        setQuickRepliesCount(res.synced || 0);
        showToast('success', res.message || 'Respostas rápidas sincronizadas com o celular!');
      } else {
        showToast('error', res?.error || 'Erro ao sincronizar respostas rápidas.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncLabelsWithCrm = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'syncLabelsWithCrm', {});
      if (res?.ok) {
        setSyncedLabels(res.syncedLabels || []);
        showToast('success', 'Etiquetas do Kanban CRM sincronizadas com as Etiquetas do WhatsApp Business!');
      } else {
        showToast('error', res?.error || 'Falha ao sincronizar etiquetas.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Handlers Aba 5
  const handleSaveCallSettings = async () => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'updateCallSettings', {
        rejectCalls,
        rejectMessage
      });
      if (res?.ok) {
        showToast('success', 'Configuração de Rejeição Automática de Chamadas salva com sucesso!');
      } else {
        showToast('error', res?.error || 'Falha ao salvar configuração de chamadas.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCallLink = async (media: 'audio' | 'video') => {
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'createCallLink', { media });
      if (res?.ok && res.url) {
        setGeneratedCallLink(res.url);
        navigator.clipboard?.writeText(res.url).catch(() => {});
        showToast('success', 'Link de chamada gerado e copiado para a área de transferência!');
      } else {
        showToast('error', res?.error || 'Não foi possível gerar o link de chamada.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBlockUnblock = async (jid: string, action: 'block' | 'unblock') => {
    if (!jid) return;
    setLoading(true);
    try {
      const res = await invokeBaileysAction(tenantId, selectedInstanceId, 'updateBlockStatus', { jid, action });
      if (res?.ok) {
        showToast('success', action === 'block' ? `Contato ${jid} bloqueado no WhatsApp!` : `Contato ${jid} desbloqueado!`);
        setNewBlockJid('');
        await loadSecurityAndCalls();
      } else {
        showToast('error', res?.error || 'Falha ao alterar status de bloqueio.');
      }
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen && !embedded) return null;

  const content = (
    <div className={`${embedded ? 'w-full' : 'max-w-5xl w-full max-h-[90vh]'} bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 backdrop-blur-xl`}>
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Central Nativa WhatsApp Business & Baileys v7
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                18 Superpoderes Ativos
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Catálogo GastroFood, Perfil Comercial, Privacidade do Chip, Etiquetas CRM, Anti-Chamadas e Limites da Meta
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {instancesList.length > 0 && (
            <select
              value={selectedInstanceId}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              {instancesList.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  📱 {inst.display_name || inst.phone_number || inst.id.slice(0, 8)} ({inst.status})
                </option>
              ))}
            </select>
          )}
          {!embedded && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Toast Feedback */}
      {feedback && (
        <div className={`mx-6 mt-4 px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
          feedback.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
            : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
        }`}>
          <span className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            {feedback.text}
          </span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="px-6 pt-3 border-b border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none bg-slate-950/40">
        {[
          { id: 'catalog', label: 'Catálogo & GastroFood', icon: ShoppingBag },
          { id: 'business', label: 'Perfil Comercial & Capa', icon: Store },
          { id: 'profile', label: 'Perfil & Privacidade do Chip', icon: Shield },
          { id: 'shortcuts', label: 'Atalhos / & Etiquetas CRM', icon: Tag },
          { id: 'security', label: 'Anti-Chamadas, Saúde & Bloqueios', icon: PhoneOff }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                active
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-t-xl'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Body Content */}
      <div className="p-6 overflow-y-auto flex-1 space-y-6">
        {/* ABA 3: CATÁLOGO & GASTROFOOD (ITEM 7) */}
        {activeTab === 'catalog' && (
          <div className="space-y-5">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900 border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30">
                    Integração Nativa GastroFood ➔ WhatsApp Business
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">
                  Sincronizar Cardápio Digital com a Vitrine do WhatsApp
                </h3>
                <p className="text-xs text-slate-300 max-w-2xl">
                  Importa automaticamente todos os produtos ativos do seu cardápio GastroFood (fotos, títulos, descrições e preços) direto para o Catálogo Nativo do WhatsApp Business do restaurante. Quando o cliente montar um carrinho, a IA e o Chat lerão os itens e valores automaticamente!
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={loadCatalog}
                  disabled={loading || syncingCatalog}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar Lista
                </button>
                <button
                  onClick={handleSyncGastrofoodToCatalog}
                  disabled={syncingCatalog}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingCatalog ? 'animate-spin' : ''}`} />
                  {syncingCatalog ? 'Sincronizando Catálogo...' : 'Sincronizar Cardápio GastroFood Agora'}
                </button>
              </div>
            </div>

            {syncStats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
                  <div className="text-lg font-bold text-white">{syncStats.totalProcessed || 0}</div>
                  <div className="text-[11px] text-slate-400">Produtos Processados</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-center">
                  <div className="text-lg font-bold text-emerald-400">{syncStats.createdCount || 0}</div>
                  <div className="text-[11px] text-emerald-300">Criados no WhatsApp</div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-center">
                  <div className="text-lg font-bold text-indigo-400">{syncStats.updatedCount || 0}</div>
                  <div className="text-[11px] text-indigo-300">Atualizados no WhatsApp</div>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Produtos Disponíveis para Envio Rápido ({catalogProducts.length})
                </h4>
              </div>
              {catalogProducts.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-400">
                  Nenhum produto carregado ainda. Clique em <b>"Sincronizar Cardápio GastroFood Agora"</b> acima para popular a vitrine!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[340px] overflow-y-auto pr-1">
                  {catalogProducts.map((prod, idx) => {
                    const isLocalDbProd = Boolean(prod._fromCardapioDb || 'grupo_id' in prod);
                    const title = prod.name || prod.nome || 'Produto';
                    const price = isLocalDbProd ? Number(prod.price ?? prod.preco ?? 0) : (prod.price ? Number(prod.price) / 1000 : Number(prod.preco || 0));
                    const img = prod.imageUrls?.original || prod.image || prod.imagem_url || prod.imageUrl;
                    return (
                      <div key={prod.id || idx} className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between gap-3 hover:border-emerald-500/40 transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          {img ? (
                            <img src={img} alt={title} className="w-12 h-12 rounded-lg object-cover bg-slate-900 shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-slate-500 shrink-0">
                              <ShoppingBag className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{title}</div>
                            <div className="text-xs font-semibold text-emerald-400">
                              R$ {price.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleSendProductToActiveChat(prod)}
                          title="Enviar Card Nativo deste Produto para o Cliente"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          Enviar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 2: PERFIL COMERCIAL WHATSAPP BUSINESS & CAPA (ITEM 8) */}
        {activeTab === 'business' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-emerald-400" />
                  Descrição Comercial do Restaurante / Empresa
                </label>
                <textarea
                  rows={3}
                  value={bizDescription}
                  onChange={(e) => setBizDescription(e.target.value)}
                  placeholder="Ex: Hamburgueria Artesanal — Peça pelo nosso Cardápio Digital!"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    Endereço Físico Comercial
                  </label>
                  <input
                    type="text"
                    value={bizAddress}
                    onChange={(e) => setBizAddress(e.target.value)}
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    Site / Link do Cardápio Digital
                  </label>
                  <input
                    type="url"
                    value={bizWebsite}
                    onChange={(e) => setBizWebsite(e.target.value)}
                    placeholder="https://seu-cardapio.com.br"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  E-mail Comercial
                </label>
                <input
                  type="email"
                  value={bizEmail}
                  onChange={(e) => setBizEmail(e.target.value)}
                  placeholder="contato@empresa.com.br"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  URL da Foto de Capa Comercial (Opcional)
                </label>
                <input
                  type="url"
                  value={bizCoverUrl}
                  onChange={(e) => setBizCoverUrl(e.target.value)}
                  placeholder="https://.../capa-restaurante.jpg"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveBusinessProfile}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Salvar Perfil Comercial & Capa no WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* ABA 1: PERFIL & PRIVACIDADE DO CHIP (ITENS 17 E 18) */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Coluna 1: Nome, Recado e Foto */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <User className="w-4 h-4" />
                17. Identidade Pública do Chip WhatsApp
              </h3>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nome de Exibição (PushName)</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Ex: Atendimento Burguer Plus"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Recado / Bio do Status</label>
                <input
                  type="text"
                  value={profileStatus}
                  onChange={(e) => setProfileStatus(e.target.value)}
                  placeholder="Ex: 🍔 Peça agora pelo link fixado na conversa!"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">URL da Nova Foto de Perfil</label>
                <input
                  type="url"
                  value={profilePicUrl}
                  onChange={(e) => setProfilePicUrl(e.target.value)}
                  placeholder="https://.../logo-quadrada.png"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <button
                onClick={handleSaveInstanceProfile}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Atualizar Perfil no Aparelho
              </button>
            </div>

            {/* Coluna 2: Privacidade do Chip */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                18. Configurações de Privacidade do Chip
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Visto por Último</label>
                  <select
                    value={privacy.lastSeen}
                    onChange={(e) => setPrivacy({ ...privacy, lastSeen: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="all">Todos</option>
                    <option value="contacts">Meus Contatos</option>
                    <option value="none">Ninguém (Oculto)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Status Online</label>
                  <select
                    value={privacy.online}
                    onChange={(e) => setPrivacy({ ...privacy, online: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="all">Todos</option>
                    <option value="match_last_seen">Igual ao Visto por Último</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Confirmação de Leitura (Tique Azul)</label>
                  <select
                    value={privacy.readReceipts}
                    onChange={(e) => setPrivacy({ ...privacy, readReceipts: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="all">Ativado (Tique Azul)</option>
                    <option value="none">Desativado (Invisível)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Quem Pode Ligar</label>
                  <select
                    value={privacy.callAdd}
                    onChange={(e) => setPrivacy({ ...privacy, callAdd: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="all">Todos</option>
                    <option value="known">Apenas Contatos Conhecidos</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Foto do Perfil</label>
                  <select
                    value={privacy.profilePicture}
                    onChange={(e) => setPrivacy({ ...privacy, profilePicture: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="all">Todos</option>
                    <option value="contacts">Meus Contatos</option>
                    <option value="none">Ninguém</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Adicionar em Grupos</label>
                  <select
                    value={privacy.groupsAdd}
                    onChange={(e) => setPrivacy({ ...privacy, groupsAdd: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="all">Todos</option>
                    <option value="contacts">Apenas Meus Contatos</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleSavePrivacy}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 mt-2 cursor-pointer"
              >
                <Shield className="w-4 h-4" />
                Aplicar Privacidade no Chip
              </button>
            </div>
          </div>
        )}

        {/* ABA 4: RESPOSTAS RÁPIDAS / & ETIQUETAS KANBAN CRM (ITENS 9 E 10) */}
        {activeTab === 'shortcuts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-4">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <MessageSquare className="w-4 h-4" />
                9. Respostas Rápidas Nativas do Aparelho (/)
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Envia todas as Respostas Rápidas cadastradas no ChatBoot diretamente para a memória nativa do aparelho WhatsApp Business (atalhos acionados ao digitar <code>/</code> no celular).
              </p>
              <button
                onClick={handleSyncQuickReplies}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Sincronizar Atalhos "/" com Aparelho Agora
              </button>
              {quickRepliesCount !== null && (
                <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3">
                  ✅ {quickRepliesCount} atalhos sincronizados com o aparelho conectado!
                </div>
              )}
            </div>

            <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-4">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
                <Tag className="w-4 h-4" />
                10. Sincronização Bidirecional de Etiquetas (Labels)
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Espelha as colunas do seu Kanban CRM diretamente nas Etiquetas Coloridas do WhatsApp Business. Quando uma etiqueta for aplicada no celular, a tag aparece automaticamente no ChatBoot!
              </p>
              <button
                onClick={handleSyncLabelsWithCrm}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Sincronizar Etiquetas CRM ➔ WhatsApp Business
              </button>
              {syncedLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {syncedLabels.map((lbl) => (
                    <span key={lbl.id} className="px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-200 text-[11px] font-semibold">
                      🏷️ {lbl.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 5: SAÚDE DO CHIP, ANTI-CHAMADAS & BLOQUEIOS (ITENS 14, 15, 16) */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Item 14: Reachout Timelock & NewChatMessageCap */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  14. Diagnóstico Oficial da Meta: Reachout Timelock & Cota de Novas Conversas
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  Verifica diretamente nos servidores do WhatsApp se o chip possui restrição temporária para abordar novos contatos antes de disparar campanhas.
                </p>
                {healthData && (
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                      healthData.reachoutTimelock?.isActive
                        ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                        : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    }`}>
                      {healthData.reachoutTimelock?.isActive
                        ? '⚠️ Timelock Ativo (Restrição Temporária)'
                        : '✅ Sem Restrição de Abordagem (Timelock Livre)'}
                    </span>
                    <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-200">
                      📊 Cota de Novas Conversas: {healthData.newChatMessageCap?.cap ?? 'Ilimitada / Normal'}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={loadSecurityAndCalls}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Consultar Agora
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Item 16: Rejeição Automática de Chamadas & Link de Chamada */}
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                    <PhoneOff className="w-4 h-4" />
                    16. Rejeição Automática de Ligações
                  </h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rejectCalls}
                      onChange={(e) => setRejectCalls(e.target.checked)}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                    <span className="text-xs font-bold text-white">Recusar Chamadas</span>
                  </label>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Mensagem enviada automaticamente ao recusar ligação:
                  </label>
                  <textarea
                    rows={3}
                    value={rejectMessage}
                    onChange={(e) => setRejectMessage(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                <button
                  onClick={handleSaveCallSettings}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                >
                  Salvar Regra Anti-Chamadas
                </button>

                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-300">Gerar Link Oficial de Chamada WhatsApp:</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCreateCallLink('audio')}
                      className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <PhoneCall className="w-3.5 h-3.5" /> Link de Voz
                    </button>
                    <button
                      onClick={() => handleCreateCallLink('video')}
                      className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-sky-300 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" /> Link de Vídeo
                    </button>
                  </div>
                  {generatedCallLink && (
                    <div className="p-2 rounded-lg bg-slate-950 border border-emerald-500/30 flex items-center justify-between gap-2 text-[11px] text-emerald-300 font-mono">
                      <span className="truncate">{generatedCallLink}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(generatedCallLink);
                          showToast('success', 'Link copiado!');
                        }}
                        className="p-1 hover:text-white shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Item 15: Bloquear / Desbloquear Contatos */}
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                  <Ban className="w-4 h-4" />
                  15. Lista de Bloqueio Direto no WhatsApp ({blocklist.length})
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBlockJid}
                    onChange={(e) => setNewBlockJid(e.target.value)}
                    placeholder="5511999999999"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                  <button
                    onClick={() => handleBlockUnblock(newBlockJid, 'block')}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Bloquear
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {blocklist.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-4 text-center">
                      Nenhum número bloqueado nesta instância.
                    </div>
                  ) : (
                    blocklist.map((bJid) => (
                      <div key={bJid} className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-300">{bJid.split('@')[0]}</span>
                        <button
                          onClick={() => handleBlockUnblock(bJid, 'unblock')}
                          className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                        >
                          Desbloquear
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      {content}
    </div>
  );
};
