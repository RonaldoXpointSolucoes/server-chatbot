import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useWaCallsStore } from '../store/useWaCallsStore';
import QRCode from 'react-qr-code';
import { useDevStore } from '../store/devStore';
import { Smartphone, CheckCircle, Loader2, AlertCircle, RefreshCw, Key, Shield, MessageSquare, Terminal, Eye, Link, Unlink, Activity, ShieldAlert, Cpu, Network, FileDown, Lock, Server, Users, StopCircle, QrCode, RefreshCcw, LogOut, Download, Clock, Zap, Building2, HelpCircle, Archive, Trash2, Edit3, Save, X, PlusCircle, Maximize2, MoreVertical, Copy, ArrowRight, Settings, CheckCircle2, ChevronRight, Phone, UserCircle2, Signal, Plus, EyeOff, EyeIcon, User } from 'lucide-react';

interface WhatsAppInstance {
  id: string;
  display_name: string;
  status: string;
  phone_number: string | null;
  profile_picture_url: string | null;
  whatsapp_name?: string | null;
  api_key?: string;
  tenant_id?: string | null;
  settings?: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

interface TenantItem {
  id: string;
  name: string;
}

import { supabase } from '../services/supabase';
import { createInstance, migrateInstanceHistory } from '../services/whatsappEngine';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

export default function InstancesDashboard() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [stats, setStats] = useState<Record<string, { contacts: number, messages: number }>>({});
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [connectMode, setConnectMode] = useState<'qr' | 'pairing'>('qr');
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Multi-Tenant Company States
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('all');
  const [createTenantId, setCreateTenantId] = useState<string>('');
  const [editingTenantInstance, setEditingTenantInstance] = useState<WhatsAppInstance | null>(null);
  const [newTenantForInstance, setNewTenantForInstance] = useState<string>('');
  
  // UI states
  const [deletingInstance, setDeletingInstance] = useState<WhatsAppInstance | null>(null);
  const [successConnectId, setSuccessConnectId] = useState<string | null>(null);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState<string | null>(null);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [showHelpModal, setShowHelpModal] = useState<string | null>(null);


  // WaCalls States and Actions
  const { 
    sessions: wacallsSessions, 
    qrCodes: wacallsQrCodes,
    createSession: createWacallsSession,
    pairSession: pairWacallsSession,
    logoutSession: logoutWacallsSession,
    fetchSessions: fetchWacallsSessions
  } = useWaCallsStore();
  
  const [showWacallsQr, setShowWacallsQr] = useState<string | null>(null);

  const handleStartWacallsPair = async (sid: string) => {
    setShowWacallsQr(sid);
    try {
      const existingSession = wacallsSessions.find(s => s.id === sid);
      
      if (existingSession) {
        if (existingSession.paired) {
          // Se já estiver pareada, desloga primeiro para limpar as credenciais antigas no Go e liberar re-pareamento
          await logoutWacallsSession(sid);
        }
        // Inicia o pareamento
        await pairWacallsSession(sid);
      } else {
        // Se não existir no Go, cria e inicia o pareamento
        await createWacallsSession(sid);
        await pairWacallsSession(sid);
      }
    } catch (err: any) {
      alert(err.message || "Erro ao iniciar pareamento de chamadas de voz.");
      setShowWacallsQr(null);
    }
  };

  const handleCancelWacallsPair = (sid: string) => {
    setShowWacallsQr(null);
  };

  const handleDisconnectWacalls = async (sid: string) => {
    if (window.confirm("Desativar as chamadas de voz neste número? O dispositivo virtual de ligações pareado no WhatsApp será desconectado.")) {
      try {
        await logoutWacallsSession(sid);
      } catch (err: any) {
        alert(err.message || "Erro ao desativar chamadas de voz.");
      }
    }
  };

  const handleTestWacallsConnection = async (sid: string, instName: string) => {
    const logger = useDevStore.getState();
    
    logger.addLog({
      type: 'info',
      message: `==================================================`,
      source: 'WaCalls Diagnostic'
    });
    logger.addLog({
      type: 'info',
      message: `INICIANDO DIAGNÓSTICO DE VOZ (WaCalls) PARA A INSTÂNCIA: "${instName}" (${sid})`,
      source: 'WaCalls Diagnostic'
    });

    try {
      // 1. Validando Conexão do Frontend com o Backend Node.js
      logger.addLog({
        type: 'info',
        message: `Passo 1/5: Testando resposta do Backend Node.js local...`,
        source: 'WaCalls Diagnostic'
      });
      
      const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || localStorage.getItem('tenantId');
      const nodeStatusStart = Date.now();
      const nodeResponse = await fetch(`${ENGINE_URL}/api/v1/instances/${sid}/status`, {
        headers: {
          'x-tenant-id': tenantId || ''
        }
      }).catch(() => null);
      
      if (nodeResponse && nodeResponse.ok) {
        logger.addLog({
          type: 'success',
          message: `✔ Backend Node.js respondendo na porta 9000! Latência: ${Date.now() - nodeStatusStart}ms`,
          source: 'WaCalls Diagnostic'
        });
      } else {
        logger.addLog({
          type: 'error',
          message: `✖ Falha ao conectar no Backend Node.js (${ENGINE_URL}). Verifique se a porta 9000 está ativa!`,
          source: 'WaCalls Diagnostic'
        });
      }

      // 2. Validando Proxy de Eventos SSE do WaCalls no Backend
      logger.addLog({
        type: 'info',
        message: `Passo 2/5: Testando endpoint de sessões WaCalls no Backend...`,
        source: 'WaCalls Diagnostic'
      });
      
      const sessions = await fetchWacallsSessions().catch(() => null);
      if (sessions) {
        logger.addLog({
          type: 'success',
          message: `✔ Sucesso ao buscar sessões do WaCalls Go! Retornadas ${sessions.length} sessões ativas.`,
          source: 'WaCalls Diagnostic'
        });
      } else {
        logger.addLog({
          type: 'error',
          message: `✖ Falha de comunicação com o WaCalls Go (porta 8080) através do proxy do backend. Verifique se o servidor Go está ativo!`,
          source: 'WaCalls Diagnostic'
        });
      }

      // 3. Verificando se a Sessão da Instância existe no WaCalls
      logger.addLog({
        type: 'info',
        message: `Passo 3/5: Verificando se a instância atual tem sessão criada no WaCalls...`,
        source: 'WaCalls Diagnostic'
      });
      
      const currentSession = wacallsSessions.find(s => s.id === sid);
      if (currentSession) {
        logger.addLog({
          type: 'success',
          message: `✔ Sessão de VoIP encontrada no WaCalls! Estado: ${currentSession.state} | Pareado: ${currentSession.paired ? "SIM" : "NÃO"}`,
          source: 'WaCalls Diagnostic',
          details: currentSession
        });
      } else {
        logger.addLog({
          type: 'warn',
          message: `⚠ Nenhuma sessão de VoIP encontrada para esta instância no WaCalls. Ela precisará ser criada ao clicar em 'Ativar Voz'.`,
          source: 'WaCalls Diagnostic'
        });
      }

      // 4. Verificando o Canal de Eventos em Tempo Real (SSE)
      logger.addLog({
        type: 'info',
        message: `Passo 4/5: Verificando a conexão do canal de eventos em tempo real (SSE)...`,
        source: 'WaCalls Diagnostic'
      });
      
      const isConnectedSSE = useWaCallsStore.getState().isConnectedSSE;
      if (isConnectedSSE) {
        logger.addLog({
          type: 'success',
          message: `✔ Canal SSE de voz está CONECTADO e pronto para receber eventos!`,
          source: 'WaCalls Diagnostic'
        });
      } else {
        logger.addLog({
          type: 'warn',
          message: `⚠ Canal SSE de voz não está conectado no frontend. O recebimento de chamadas pode não funcionar em tempo real.`,
          source: 'WaCalls Diagnostic'
        });
      }

      // 5. Consolidando Diagnóstico
      logger.addLog({
        type: 'info',
        message: `Passo 5/5: Consolidando status final...`,
        source: 'WaCalls Diagnostic'
      });
      
      const isEverythingOk = nodeResponse?.ok && sessions && isConnectedSSE;
      if (isEverythingOk) {
        logger.addLog({
          type: 'success',
          message: `🎉 DIAGNÓSTICO CONCLUÍDO COM SUCESSO! A infraestrutura local do WaCalls está 100% saudável.`,
          source: 'WaCalls Diagnostic'
        });
      } else {
        logger.addLog({
          type: 'warn',
          message: `⚠ Diagnóstico concluído com alguns alertas. Verifique os passos acima!`,
          source: 'WaCalls Diagnostic'
        });
      }

    } catch (e: any) {
      logger.addLog({
        type: 'error',
        message: `✖ Erro inesperado durante o diagnóstico: ${e.message}`,
        source: 'WaCalls Diagnostic',
        details: e
      });
    }
    
    logger.addLog({
      type: 'info',
      message: `==================================================`,
      source: 'WaCalls Diagnostic'
    });
  };

  useEffect(() => {
    fetchTenants();
    fetchInstances();
    fetchWacallsSessions().catch(console.error);

    // Inscrição para Realtime Sync
    const channel = supabase
      .channel('public:whatsapp_instances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_instances' }, () => {
        fetchInstances();
      })
      .subscribe();

    fetchActiveInstance();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    fetchInstances();
  }, [selectedTenantFilter]);

  const fetchTenants = async () => {
    try {
      const { data } = await supabase.from('tenants').select('id, name').order('name');
      if (data && data.length > 0) {
        setTenants(data);
        const currentT = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
        if (currentT && data.some(t => t.id === currentT)) {
          setCreateTenantId(currentT);
        } else {
          setCreateTenantId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Erro ao buscar empresas:', e);
    }
  };

  // Limpa o estado de pareamento quando a sessão do WaCalls é conectada com sucesso
  useEffect(() => {
    if (showWacallsQr) {
      const sess = wacallsSessions.find(s => s.id === showWacallsQr);
      if (sess?.paired) {
        setShowWacallsQr(null);
      }
    }
  }, [wacallsSessions, showWacallsQr]);

  const fetchActiveInstance = async () => {
    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      const { data } = await supabase.from('companies').select('evolution_api_instance, name').eq('id', tenantId).maybeSingle();
      if (data) {
        setActiveInstanceId(data.evolution_api_instance);
        setUserName(data.name || 'Admin');
      }
    } catch(e) {}
  };

  const fetchInstances = async () => {
    try {
      setLoading(true);
      const activeTenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      let query = supabase.from('whatsapp_instances').select('*').order('created_at', { ascending: false });

      if (selectedTenantFilter && selectedTenantFilter !== 'all') {
        query = query.eq('tenant_id', selectedTenantFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const instancesData = data || [];
      
      // Validação Cirúrgica NATIVA (Corrige os Falsos Positivos do Banco)
      const liveInstances = await Promise.all(instancesData.map(async (inst) => {
          // Sempre checa na Engine para limpar falsos positivos de online/offline do banco de dados.
          try {
              const targetTenantHeader = inst.tenant_id || activeTenantId || '';
              const res = await fetch(`${ENGINE_URL}/api/v1/instances/${inst.id}/status`, {
                  headers: { 
                    'x-tenant-id': targetTenantHeader,
                    'apikey': inst.api_key || '' 
                  }
              });
              if (res.ok) {
                 const statusData = await res.json();
                 if (statusData.data?.status === 'connected' || statusData.data?.status === 'connected_local' || statusData.data?.status === 'open') {
                      return { ...inst, status: 'connected' };
                 } else if (statusData.data?.status === 'connecting') {
                      return { ...inst, status: 'connecting' };
                 } else {
                      return { ...inst, status: 'offline' };
                 }
              } else {
                 return inst; // Se engine não responder 200, confia no Supabase
              }
          } catch(e) {
              return { ...inst, status: (inst.status === 'connected' || inst.status === 'connected_local') ? 'server_offline' : inst.status }; // Fallback
          }
      }));

      setInstances(liveInstances);
      
      if (liveInstances.length > 0) {
        liveInstances.forEach(inst => fetchStats(inst.id));
      }
    } catch (e) {
      console.error('Error fetching instances:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleReassignTenant = async (instanceId: string, targetTenantId: string) => {
    if (!targetTenantId) return;
    try {
      setLoading(true);
      const instBefore = instances.find(i => i.id === instanceId);
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ tenant_id: targetTenantId })
        .eq('id', instanceId);

      if (error) throw error;

      const instAfter = instBefore ? { ...instBefore, tenant_id: targetTenantId } : null;
      await useChatStore.getState().logOperation('UPDATE', 'whatsapp_instances', instanceId, instBefore || null, instAfter);

      setEditingTenantInstance(null);
      await fetchInstances();
      alert('Empresa da instância atualizada com sucesso!');
    } catch (e: any) {
      alert('Erro ao reatribuir empresa da instância: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (instanceId: string) => {
    try {
       const [contactsRes, messagesRes] = await Promise.all([
          supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('instance_id', instanceId),
          supabase.from('messages').select('*', { count: 'exact', head: true }).eq('instance_id', instanceId)
       ]);
       setStats(prev => ({
         ...prev,
         [instanceId]: {
           contacts: contactsRes.count || 0,
           messages: messagesRes.count || 0
         }
       }));
    } catch(e) {}
  };

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameStr = newInstanceName.trim();
    if (!nameStr) {
       alert("Nome é obrigatório.");
       return;
    }
    
    setLoading(true);
    try {
      const defaultSettings = { reject_calls: false, ignore_groups: false, always_online: true, sync_history: false, read_messages: false };
      
      const activeTenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      const targetTenantId = createTenantId || activeTenantId;

      const { v4: uuidv4 } = await import('uuid');
      const newEngineId = uuidv4(); 
      const finalApiKey = 'sk_' + uuidv4().replace(/-/g, '');

      const newInstObj = {
        id: newEngineId,
        display_name: nameStr,
        status: 'offline',
        settings: defaultSettings,
        tenant_id: targetTenantId,
        api_key: finalApiKey
      };
      const { error } = await supabase.from('whatsapp_instances').insert([newInstObj]);
      if (!error) {
        await useChatStore.getState().logOperation('INSERT', 'whatsapp_instances', newEngineId, null, newInstObj);
      }
      
      if (error) throw error;
      
      await createInstance(targetTenantId!, newEngineId, finalApiKey);
      
      setIsCreating(false);
      setNewInstanceName('');
      fetchInstances();
    } catch (e) {
      alert('Falha ao criar instância!');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (inst: WhatsAppInstance) => {
    setDeletingInstance(inst);
  };

  const handleMigrateAndDelete = async (oldInst: WhatsAppInstance, targetInstId: string) => {
    if (!oldInst || !targetInstId) return;
    try {
      setLoading(true);
      await migrateInstanceHistory(oldInst.id, targetInstId);

      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      await fetch(`${ENGINE_URL}/api/v1/instances/${oldInst.id}`, { 
          method: 'DELETE',
          headers: { 
            'x-tenant-id': tenantId!,
            'apikey': oldInst.api_key || ''
          }
      }).catch(() => {});
      
      await supabase.from('whatsapp_instances').delete().eq('id', oldInst.id);
      await useChatStore.getState().logOperation('DELETE', 'whatsapp_instances', oldInst.id, oldInst, null);
      
      alert(`Histórico migrado da caixa "${oldInst.display_name}" com sucesso para a caixa ativa! A caixa antiga foi removida.`);
      fetchInstances();
      useChatStore.getState().fetchContacts();
    } catch (e: any) {
      console.error(e);
      alert('Erro ao migrar histórico: ' + (e.message || String(e)));
    } finally {
      setLoading(false);
      setDeletingInstance(null);
    }
  };

  const confirmDelete = async () => {
    if (!deletingInstance) return;
    try {
      setLoading(true);
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      
      const cleanDelPhone = deletingInstance.phone_number ? deletingInstance.phone_number.replace(/\D/g, '') : '';
      const otherActiveInst = instances.find(i => 
        i.id !== deletingInstance.id && 
        (i.status === 'connected' || i.status === 'connected_local') && 
        (cleanDelPhone ? (i.phone_number?.replace(/\D/g, '') === cleanDelPhone) : true)
      );

      if (otherActiveInst) {
        await migrateInstanceHistory(deletingInstance.id, otherActiveInst.id);
      } else {
        await supabase.from('messages').update({ instance_id: null }).eq('instance_id', deletingInstance.id);
        await supabase.from('conversations').update({ instance_id: null }).eq('instance_id', deletingInstance.id);
        await supabase.from('contacts').update({ instance_id: null }).eq('instance_id', deletingInstance.id);
      }

      await fetch(`${ENGINE_URL}/api/v1/instances/${deletingInstance.id}`, { 
          method: 'DELETE',
          headers: { 
            'x-tenant-id': tenantId!,
            'apikey': deletingInstance.api_key || ''
          }
      }).catch(() => {});
      
      await supabase.from('whatsapp_instances').delete().eq('id', deletingInstance.id);
      await useChatStore.getState().logOperation('DELETE', 'whatsapp_instances', deletingInstance.id, deletingInstance, null);
      
      fetchInstances();
    } catch (e) {
      console.error(e);
      alert('Falha ao excluir!');
    } finally {
      setLoading(false);
      setDeletingInstance(null);
    }
  };
  
  const handleSetAsActive = async (id: string) => {
    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      const companyBefore = useChatStore.getState().tenantInfo;
      await supabase.from('companies').update({ evolution_api_instance: id }).eq('id', tenantId);
      const companyAfter = companyBefore ? { ...companyBefore, evolution_api_instance: id } : { evolution_api_instance: id };
      await useChatStore.getState().logOperation('UPDATE', 'companies', tenantId, companyBefore || null, companyAfter);
      setActiveInstanceId(id);
      alert('Instância definida como principal com sucesso!');
    } catch(err) {
      console.error(err);
      alert('Falha ao usar existente');
    }
  };

  const handleDisconnect = async (id: string, apiKey?: string) => {
    if (!window.confirm('Isto fará logoff do WhatsApp atual mas manterá a instância. Deseja Continuar?')) return;
    // O delete sem apagar do banco. O /delete agora apaga tudo se feito via painel se não mudarmos
    const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
    await fetch(`${ENGINE_URL}/api/v1/instances/${id}/disconnect`, { 
        method: 'POST',
        headers: { 
          'x-tenant-id': tenantId!,
          'apikey': apiKey || ''
        }
    }).catch(() => {}); 
  };

  const fireEngineAction = async (id: string, apiKey: string | undefined, action: string, successMsg: string) => {
    try {
       const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
       const res = await fetch(`${ENGINE_URL}/api/v1/instances/${id}/${action}`, { 
           method: 'POST',
           headers: { 
             'x-tenant-id': tenantId!,
             'apikey': apiKey || ''
           }
       });
       const data = await res.json();
       alert(data.message || successMsg);
    } catch(err) {
       alert('Erro de comunicação central com a Engine');
    }
  };

  const handleConnect = async (id: string, apiKey?: string) => {
    setShowQrModal(id);
    setQrCode(null);
    setQrLoading(true);

    const currentInst = instances.find(i => i.id === id);
    if (currentInst && currentInst.phone_number) {
      setPairingPhone(currentInst.phone_number);
    } else {
      setPairingPhone('');
    }

    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      await fetch(`${ENGINE_URL}/api/v1/instances/${id}/connect`, { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'x-tenant-id': tenantId!,
          'apikey': apiKey || ''
        },
        body: JSON.stringify({ instanceId: id })
      });
      pollQrCode(id, apiKey);
    } catch(err) {
      alert("Falha de rede ao contatar engine. Verifique a porta 9000");
      setQrLoading(false);
      setShowQrModal(null);
    }
  };

  const pollQrCode = (id: string, apiKey?: string) => {
    let secondsElapsed = 0;
    const interval = setInterval(async () => {
      try {
        secondsElapsed += 2;
        const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
        const res = await fetch(`${ENGINE_URL}/api/v1/instances/${id}/status`, {
            headers: { 
              'x-tenant-id': tenantId!,
              'apikey': apiKey || ''
            }
        });
        const respJson = await res.json();
        const data = respJson.data;
        
        if (data && (data.status === 'connected' || data.status === 'connected_local')) {
          setQrLoading(false);
          setShowQrModal(null);
          setSuccessConnectId(id);
          setTimeout(() => setSuccessConnectId(null), 2000);
          clearInterval(interval);
          fetchInstances();
        } else if (data && data.status === 'offline') {
           setQrLoading(false);
           clearInterval(interval);
        } else if (data && data.whatsapp_instance_runtime && data.whatsapp_instance_runtime[0]?.qr_code) {
          // Previne que a Imagem pisque a cada 2 segundos no DOM injetando só se for string diferente
          const qrSrc = data.whatsapp_instance_runtime[0].qr_code;
          setQrCode(prevQr => {
            if(prevQr !== qrSrc) return qrSrc;
            return prevQr;
          });
          setQrLoading(false);
        }

        // Caso não ocorra sucesso a cada 30 segundos, RE-SOLICITA QR Novo (força Engine Restart)
        if (secondsElapsed >= 30) {
          secondsElapsed = 0; // Renova ciclo da UI
          console.log('[UI] 30 Segundos Ociosos. Renovando QR Code do Motor via API...');
          setQrLoading(true);
          await fetch(`${ENGINE_URL}/api/v1/instances/${id}/connect`, { 
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'x-tenant-id': tenantId!,
              'apikey': apiKey || ''
            },
            body: JSON.stringify({ instanceId: id })
          }).catch(() => {});
        }

      } catch (e) {
        clearInterval(interval);
      }
    }, 2000);

    setTimeout(() => { clearInterval(interval); }, 180000); // Timeout max de 3 mins
  };

  const handleRequestPairingCode = async (id: string, apiKey?: string) => {
    if (!pairingPhone) {
      alert("Por favor, digite o número do telefone com código do país (ex: 5511991649959).");
      return;
    }
    
    const logger = useDevStore.getState();
    logger.setShowServerLogs(true);
    
    logger.addLog({
      type: 'info',
      message: `==================================================`,
      source: 'WhatsApp Pairing (Dashboard)'
    });
    logger.addLog({
      type: 'info',
      message: `INICIANDO SOLICITAÇÃO DE PAIRING CODE PARA O NÚMERO: ${pairingPhone}`,
      source: 'WhatsApp Pairing (Dashboard)'
    });
    
    setPairingLoading(true);
    setPairingCode(null);
    
    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      
      logger.addLog({
        type: 'info',
        message: `Passo 1/3: Comunicando com API do gateway: ${ENGINE_URL}/api/v1/instances/${id}/pairing-code`,
        source: 'WhatsApp Pairing (Dashboard)'
      });
      
      const res = await fetch(`${ENGINE_URL}/api/v1/instances/${id}/pairing-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId!,
          'apikey': apiKey || ''
        },
        body: JSON.stringify({ phoneNumber: pairingPhone })
      });
      
      const data = await res.json();
      if (res.ok && data.ok) {
        logger.addLog({
          type: 'success',
          message: `Passo 2/3: Código gerado com sucesso: "${data.code}"! Por favor, insira este código no celular.`,
          source: 'WhatsApp Pairing (Dashboard)',
          details: data
        });
        setPairingCode(data.code);
        // Salva o número associado no banco apenas se tiver um número válido
        const cleanPhone = pairingPhone ? pairingPhone.replace(/\D/g, '') : '';
        if (cleanPhone && cleanPhone.length >= 7) {
          await supabase.from('whatsapp_instances').update({ phone_number: cleanPhone }).eq('id', id);
        }
        fetchInstances();
        pollPairingStatus(id, apiKey);
      } else {
        const errMsg = data.error || "Erro ao solicitar código de pareamento.";
        logger.addLog({
          type: 'error',
          message: `Falha na resposta da API ao gerar código: ${errMsg}`,
          source: 'WhatsApp Pairing (Dashboard)',
          details: data
        });
        alert(errMsg);
      }
    } catch (err: any) {
      logger.addLog({
        type: 'error',
        message: `Falha de rede/comunicação com a Engine: ${err.message || err}`,
        source: 'WhatsApp Pairing (Dashboard)'
      });
      alert("Erro de comunicação com o servidor ao gerar o código.");
    } finally {
      setPairingLoading(false);
    }
  };

  const pollPairingStatus = (id: string, apiKey?: string) => {
    const logger = useDevStore.getState();
    logger.addLog({
      type: 'info',
      message: `Passo 3/3: Iniciando polling de status da instância no servidor de produção para detectar vinculação...`,
      source: 'WhatsApp Pairing (Dashboard)'
    });
    
    const interval = setInterval(async () => {
      try {
        const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
        const res = await fetch(`${ENGINE_URL}/api/v1/instances/${id}/status`, {
            headers: { 
              'x-tenant-id': tenantId!,
              'apikey': apiKey || ''
            }
        });
        const respJson = await res.json();
        const data = respJson.data;
        
        logger.addLog({
          type: 'info',
          message: `[Poll Status] Estado da Engine: "${data?.status || 'desconhecido'}" | Erro registrado no nó: "${data?.last_error || 'nenhum'}"`,
          source: 'WhatsApp Pairing (Dashboard)',
          details: data
        });
        
        if (data && (data.status === 'connected' || data.status === 'connected_local')) {
          logger.addLog({
            type: 'success',
            message: `SUCESSO: Conexão com o WhatsApp estabelecida! O celular confirmou o pareamento.`,
            source: 'WhatsApp Pairing (Dashboard)'
          });
          setShowQrModal(null);
          setPairingCode(null);
          setPairingPhone('');
          setSuccessConnectId(id);
          setTimeout(() => setSuccessConnectId(null), 2000);
          clearInterval(interval);
          fetchInstances();
        } else if (data && data.status === 'offline') {
           logger.addLog({
             type: 'error',
             message: `CONEXÃO FECHADA: A conexão foi encerrada pela Engine ou WhatsApp.`,
             source: 'WhatsApp Pairing (Dashboard)'
           });
           clearInterval(interval);
        }
      } catch (e: any) {
        logger.addLog({
          type: 'warn',
          message: `Aviso no polling: falha temporária ao obter status da Engine (${e.message || e})`,
          source: 'WhatsApp Pairing (Dashboard)'
        });
      }
    }, 3000);

    setTimeout(() => { 
      clearInterval(interval);
      logger.addLog({
        type: 'error',
        message: `TIMEOUT: Limite de tempo esgotado esperando a confirmação do pareamento no celular (180s). Tente novamente.`,
        source: 'WhatsApp Pairing (Dashboard)'
      });
    }, 180000); // 3 mins
  };

  const toggleSetting = async (id: string, currentSettings: any, key: string) => {
    const newSettings = { ...(currentSettings || {}), [key]: !currentSettings?.[key] };
    
    // Optimistic Update
    setInstances(prev => prev.map(inst => inst.id === id ? { ...inst, settings: newSettings } : inst));
    
    const instBefore = instances.find(inst => inst.id === id);
    const { error } = await supabase.from('whatsapp_instances').update({ settings: newSettings }).eq('id', id);
    if (!error) {
       const instAfter = instBefore ? { ...instBefore, settings: newSettings } : { settings: newSettings };
       await useChatStore.getState().logOperation('UPDATE', 'whatsapp_instances', id, instBefore || null, instAfter);
    }
    if (error) {
       // Rollback se falhar
       setInstances(prev => prev.map(inst => inst.id === id ? { ...inst, settings: currentSettings } : inst));
       console.error("Falha ao salvar setting", error);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'connected' || status === 'connected_local' || status === 'open') return <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"><Signal size={12} className="animate-pulse" /> Conectado</span>;
    if (status === 'connecting') return <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-orange-500/10 text-orange-600 border border-orange-500/20"><RefreshCcw size={12} className="animate-spin" /> Conectando</span>;
    if (status === 'server_offline') return <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/10 text-red-600 border border-red-500/20"><AlertCircle size={12} /> Servidor Offline</span>;
    return <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-500/10 text-gray-600 border border-gray-500/20"><AlertCircle size={12} /> Desconectado</span>;
  };

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-[#f3f4f6] dark:bg-[#0b141a] p-4 sm:p-8 transition-colors custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#111b21] p-6 sm:p-8 border-b border-[#2a3942] rounded-t-[20px] gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <Smartphone className="text-emerald-500" size={32} />
              Minhas Conexões
            </h1>
            <p className="text-gray-400 mt-2">Olá <span className="text-white font-semibold">{userName || 'Usuário'}</span>, gerencie o pareamento de suas instâncias por Empresa (Tenant).</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Filtro por Empresa */}
            <div className="flex items-center gap-2 bg-[#202c33] border border-[#2a3942] rounded-[1.2rem] px-3 py-2 text-xs font-semibold text-white">
              <Building2 size={16} className="text-emerald-400" />
              <select 
                value={selectedTenantFilter} 
                onChange={e => setSelectedTenantFilter(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#111b21] text-white">Todas as Empresas ({instances.length})</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id} className="bg-[#111b21] text-white">
                    🏢 {t.name}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={() => setIsCreating(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-5 py-3 rounded-[1.2rem] flex items-center gap-2 font-bold transition-all shadow-[0_5px_15px_-5px_rgba(16,185,129,0.5)] active:scale-95">
              <Plus size={20} />
              Nova Instância
            </button>
          </div>
        </div>

         {/* Modal de Criação */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-in fade-in duration-200">
             <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95">
               <h2 className="text-2xl font-bold dark:text-white mb-6">Criar Conexão</h2>
               <form onSubmit={handleCreateInstance}>
                 <div className="space-y-4">
                    <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da Instância</label>
                     <input required autoFocus value={newInstanceName} onChange={e => setNewInstanceName(e.target.value)} type="text" placeholder="Ex: Comercial 1" className="w-full bg-gray-100 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"/>
                   </div>

                   <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                       <Building2 size={14} className="text-emerald-500" />
                       Empresa (Tenant) Responsável
                     </label>
                     <select 
                       value={createTenantId} 
                       onChange={e => setCreateTenantId(e.target.value)}
                       className="w-full bg-gray-100 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                     >
                       {tenants.map(t => (
                         <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                           {t.name}
                         </option>
                       ))}
                     </select>
                   </div>

                   <div className="flex gap-3 mt-6">
                     <button type="button" onClick={() => setIsCreating(false)} className="flex-1 bg-gray-100 dark:bg-black/30 hover:bg-gray-200 dark:hover:bg-black/50 text-gray-800 dark:text-white font-semibold py-3 rounded-2xl transition-all">Cancelar</button>
                     <button type="submit" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-2xl transition-all shadow-md">Criar</button>
                   </div>
                 </div>
               </form>
             </div>
          </div>
        )}

        {/* Modal de Reatribuição de Empresa */}
        {editingTenantInstance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xl animate-in fade-in duration-200">
             <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95">
               <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 border border-emerald-500/20">
                 <Building2 size={24} className="text-emerald-500" />
               </div>
               <h2 className="text-xl font-bold dark:text-white mb-2">Associar Empresa</h2>
               <p className="text-xs text-gray-400 mb-4">
                 Selecione qual Empresa (Tenant) será proprietária da caixa <strong className="text-white">"{editingTenantInstance.display_name}"</strong>.
               </p>

               <div className="space-y-4">
                 <div>
                   <label className="block text-xs font-semibold text-gray-300 mb-1.5">Nova Empresa Proprietária</label>
                   <select 
                     value={newTenantForInstance} 
                     onChange={e => setNewTenantForInstance(e.target.value)}
                     className="w-full bg-gray-100 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                   >
                     {tenants.map(t => (
                       <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                         {t.name}
                       </option>
                     ))}
                   </select>
                 </div>

                 <div className="flex gap-3 pt-2">
                   <button type="button" onClick={() => setEditingTenantInstance(null)} className="flex-1 bg-gray-100 dark:bg-black/30 hover:bg-gray-200 dark:hover:bg-black/50 text-gray-800 dark:text-white font-semibold py-3 rounded-2xl text-xs transition-all">Cancelar</button>
                   <button type="button" onClick={() => handleReassignTenant(editingTenantInstance.id, newTenantForInstance)} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-2xl text-xs transition-all shadow-md">Salvar</button>
                 </div>
               </div>
             </div>
          </div>
        )}

        {/* Modal de Exclusão Inteligente */}
        {deletingInstance && (() => {
          const cleanDelPhone = deletingInstance.phone_number ? deletingInstance.phone_number.replace(/\D/g, '') : '';
          const targetInst = instances.find(i => 
            i.id !== deletingInstance.id && 
            (i.status === 'connected' || i.status === 'connected_local' || (cleanDelPhone && i.phone_number?.replace(/\D/g, '') === cleanDelPhone))
          );

          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-200">
               <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-2xl p-8 max-w-md w-full animate-in zoom-in-95">
                 <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20 mx-auto">
                   <Trash2 size={32} className="text-red-500" />
                 </div>
                 <h2 className="text-2xl font-bold dark:text-white mb-2 text-center">Excluir Conexão?</h2>
                 <p className="text-gray-500 dark:text-gray-400 mb-4 font-medium text-center text-sm">
                   Esta ação removerá a caixa <strong className="text-gray-800 dark:text-white">"{deletingInstance.display_name}"</strong>.
                 </p>
                 
                 {targetInst ? (
                   <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 p-4 rounded-2xl text-xs leading-relaxed font-semibold mb-6 flex flex-col gap-2">
                     <span className="flex items-center gap-1.5 font-bold text-sm text-emerald-600 dark:text-emerald-400">
                       <RefreshCcw size={16} /> Caixa Ativa Encontrada: "{targetInst.display_name}"
                     </span>
                     <p>
                       Recomendamos transferir todo o histórico de conversas, contatos e mensagens desta caixa para a caixa ativa <strong>"{targetInst.display_name}"</strong> antes da exclusão.
                     </p>
                   </div>
                 ) : (
                   <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3 rounded-2xl text-xs leading-relaxed font-semibold mb-6">
                     ⚠️ O histórico de conversas e mensagens será preservado com segurança no Supabase.
                   </div>
                 )}

                 <div className="flex flex-col gap-2.5">
                   {targetInst && (
                     <button 
                       onClick={() => handleMigrateAndDelete(deletingInstance, targetInst.id)} 
                       className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-md text-xs flex items-center justify-center gap-2"
                     >
                       <RefreshCcw size={14} />
                       Sim, Migrar Histórico para "{targetInst.display_name}" & Excluir
                     </button>
                   )}
                   <div className="flex gap-2">
                     <button onClick={() => setDeletingInstance(null)} className="flex-1 bg-gray-100 dark:bg-black/30 hover:bg-gray-200 dark:hover:bg-black/50 text-gray-800 dark:text-white font-semibold py-3 rounded-2xl text-xs transition-all">Cancelar</button>
                     <button onClick={confirmDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-2xl text-xs transition-all shadow-md">
                       {targetInst ? "Excluir Sem Migrar" : "Sim, Excluir"}
                     </button>
                   </div>
                 </div>
               </div>
            </div>
          );
        })()}

        {/* Modal Sucesso Conexão */}
        {successConnectId && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xl animate-in fade-in duration-300">
               <div className="bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.2)] p-8 max-w-sm w-full flex flex-col items-center animate-in zoom-in-95 bounce-in relative">
                 <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-5 border-2 border-emerald-500/50">
                   <CheckCircle2 size={40} className="text-emerald-500" />
                 </div>
                 <h2 className="text-3xl font-black text-gray-800 dark:text-white mb-2 text-center">Conectado!</h2>
                 <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center mb-8 px-2 leading-relaxed">A instância local foi vinculada com sucesso ao seu WhatsApp.</p>
                 <button onClick={() => setSuccessConnectId(null)} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-2xl transition-all shadow-[0_10px_20px_-10px_rgba(16,185,129,0.5)]">
                   Concluir Pareamento
                 </button>
               </div>
            </div>
        )}

        {/* Banner de Detecção de Instâncias Duplicadas no mesmo Número */}
        {(() => {
          const duplicateGroups: Record<string, WhatsAppInstance[]> = {};
          instances.forEach(inst => {
            const raw = inst.phone_number || (inst.settings as any)?.phone_number || (inst.settings as any)?.pairing_phone;
            const clean = raw ? raw.replace(/\D/g, '') : '';
            if (clean && clean.length >= 8) {
              if (!duplicateGroups[clean]) duplicateGroups[clean] = [];
              duplicateGroups[clean].push(inst);
            }
          });

          const duplicateEntries = Object.entries(duplicateGroups).filter(([_, group]) => group.length > 1);
          if (duplicateEntries.length === 0) return null;

          return (
            <div className="space-y-4 mb-6">
              {duplicateEntries.map(([phone, group]) => {
                const activeInst = group.find(i => i.status === 'connected' || i.status === 'connected_local') || group[0];
                const oldInsts = group.filter(i => i.id !== activeInst.id);

                return (
                  <div key={phone} className="bg-amber-500/10 border-2 border-amber-500/30 rounded-3xl p-6 shadow-xl animate-in fade-in flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-amber-500/20 text-amber-500 rounded-2xl shrink-0 border border-amber-500/30">
                        <ShieldAlert size={28} className="animate-pulse text-amber-500" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-extrabold text-amber-700 dark:text-amber-300">
                            Instância Duplicada Detectada (Número +{phone})
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            {group.length} Caixas
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                          Detectamos que a caixa ativa <strong>"{activeInst.display_name}"</strong> (ID: <code className="font-mono text-emerald-600 dark:text-emerald-400">{activeInst.id.substring(0, 8)}...</code>) compartilha o mesmo número de WhatsApp com {oldInsts.length} {oldInsts.length === 1 ? 'outra caixa' : 'outras caixas'}.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0 w-full lg:w-auto">
                      {oldInsts.map(oldInst => (
                        <button
                          key={oldInst.id}
                          onClick={() => {
                            if (window.confirm(`Deseja transferir todo o histórico de conversas, mensagens e contatos da caixa "${oldInst.display_name}" (${oldInst.id.substring(0, 8)}...) para a caixa ativa "${activeInst.display_name}" (${activeInst.id.substring(0, 8)}...) e excluir a caixa antiga?`)) {
                              handleMigrateAndDelete(oldInst, activeInst.id);
                            }
                          }}
                          className="w-full lg:w-auto px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-2xl text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer"
                        >
                          <RefreshCcw size={14} className="animate-spin duration-1000" />
                          <span>Migrar Dados de "{oldInst.display_name}" para Caixa Ativa & Excluir Antiga</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Grid Principal */}
        {loading && instances.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" size={40} /></div>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white/40 dark:bg-slate-900/40 rounded-3xl border border-gray-200/50 dark:border-white/5 border-dashed">
            <Archive size={48} className="text-gray-400 mb-4" />
            <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">Nenhuma conexão.</h3>
            <p className="text-gray-500">Crie sua primeira instância para conectar um número.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pb-32">
            {instances.map(inst => (
              <div key={inst.id} className="bg-white/80 dark:bg-[#111b21]/90 backdrop-blur-3xl p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-200/60 dark:border-white/5 hover:border-emerald-500/30 transition-all flex flex-col group">
                
                {/* Cabeçalho Premium */}
                <div className="flex justify-between items-start mb-6 border-b border-gray-100 dark:border-white/5 pb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner overflow-hidden">
                       <Smartphone size={28} className="text-emerald-500" />
                    </div>
                    <div className="flex flex-col">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate pr-2 max-w-[200px]">{inst.display_name}</h3>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold tracking-wide bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-md w-max">
                         <Building2 size={12} className="text-emerald-400 shrink-0" />
                         <span className="truncate max-w-[140px]">{tenants.find(t => t.id === inst.tenant_id)?.name || 'Empresa Geral'}</span>
                         <button 
                           onClick={() => { setEditingTenantInstance(inst); setNewTenantForInstance(inst.tenant_id || ''); }}
                           className="text-gray-400 hover:text-white ml-1 p-0.5 rounded hover:bg-emerald-500/20 transition-all"
                           title="Trocar Empresa Proprietária"
                         >
                           <Edit3 size={11} />
                         </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {getStatusBadge(inst.status)}
                    <button 
                      onClick={() => {
                        setShowHelpModal(showHelpModal === inst.id ? null : inst.id);
                        setShowSettings(null); // Fecha configurações se abrir ajuda
                      }} 
                      className={`p-2.5 rounded-xl transition-all ${showHelpModal === inst.id ? 'bg-[#00a884] text-white shadow-lg shadow-[#00a884]/20' : 'text-gray-400 hover:text-[#00a884] bg-gray-100 dark:bg-[#202c33] hover:dark:bg-[#00a884]/10'}`}
                      title="Guia Explicativo das Ações"
                    >
                      <HelpCircle size={18} />
                    </button>
                    <button 
                      onClick={() => {
                        setShowSettings(showSettings === inst.id ? null : inst.id);
                        setShowHelpModal(null); // Fecha ajuda se abrir configurações
                      }} 
                      className={`p-2.5 rounded-xl transition-all ${showSettings === inst.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-400 hover:text-emerald-500 bg-gray-100 dark:bg-[#202c33] hover:dark:bg-emerald-500/10'}`}
                    >
                      <Settings size={18} />
                    </button>
                  </div>
                </div>

                {/* Especificidades e Diagnóstico */}
                <div className="grid grid-cols-2 gap-3 mb-6 bg-gray-50/50 dark:bg-black/20 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                   <div className="col-span-2">
                     <span className="text-[10px] uppercase font-bold text-gray-400 mb-1 flex items-center gap-1"><Key size={12}/> API Key</span>
                     <p className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate bg-white dark:bg-black/40 p-2 border border-gray-200 dark:border-white/5 rounded-lg select-all">
                       {inst.api_key || 'Não gerada'}
                     </p>
                   </div>
                   
                   <div className="col-span-1 flex items-center gap-3 bg-white dark:bg-black/40 p-3 border border-gray-200 dark:border-white/5 rounded-xl">
                      <Phone className="text-emerald-500 shrink-0" size={18} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Celular</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm whitespace-nowrap">
                           {(() => {
                               const p = inst.phone_number || inst.settings?.phone_number || inst.settings?.pairing_phone;
                               return p ? `+${p}` : 'N/A';
                            })()}
                        </span>
                      </div>
                   </div>

                   <div className="col-span-1 flex items-center gap-3 bg-white dark:bg-black/40 p-3 border border-gray-200 dark:border-white/5 rounded-xl">
                      <UserCircle2 className="text-emerald-500 shrink-0" size={18} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Usuário</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm whitespace-nowrap">
                           {inst.phone_number ? 'Ativado' : 'Aguardando'}
                        </span>
                      </div>
                   </div>

                   <div className="col-span-1 flex items-center gap-3 bg-white dark:bg-black/40 p-3 border border-gray-200 dark:border-white/5 rounded-xl">
                      <Users className="text-blue-500 shrink-0" size={18} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Contatos</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm whitespace-nowrap">
                           {stats[inst.id]?.contacts || 0} sync
                        </span>
                      </div>
                   </div>

                   <div className="col-span-1 flex items-center gap-3 bg-white dark:bg-black/40 p-3 border border-gray-200 dark:border-white/5 rounded-xl">
                      <MessageSquare className="text-violet-500 shrink-0" size={18} />
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Mensagens</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm whitespace-nowrap">
                           {stats[inst.id]?.messages || 0} flows
                        </span>
                      </div>
                   </div>

                  {/* Seção WaCalls (Chamadas de Voz) */}
                  {(() => {
                    const wacallSession = wacallsSessions.find((s) => s.id === inst.id);
                    const wacallsQrCode = wacallsQrCodes[inst.id];
                    
                    return (
                      <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-[#2a3942] flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-emerald-500" />
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Módulo de Chamadas (Voz)</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            wacallSession?.paired 
                              ? "bg-emerald-100 dark:bg-emerald-950/40 text-[#00a884]"
                              : wacallSession?.status === "connecting"
                              ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 animate-pulse"
                              : "bg-gray-100 dark:bg-[#202c33] text-gray-500 dark:text-gray-400"
                          }`}>
                            {wacallSession?.paired ? "Ativo" : wacallSession?.status === "connecting" ? "Pareando" : "Inativo"}
                          </span>
                        </div>

                        {/* QR Code de Voz Inline */}
                        {showWacallsQr === inst.id && wacallsQrCode && (
                          <div className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-black/30 rounded-2xl border border-gray-100 dark:border-white/5 animate-in fade-in duration-300">
                            <p className="text-[10px] text-gray-400 mb-3 text-center">{"Escaneie o código com o WhatsApp > Aparelhos Conectados"}</p>
                            <div className="w-40 h-40 bg-white p-3 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-800 shadow-sm">
                              <QRCode value={wacallsQrCode} size={136} style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
                            </div>
                            <button 
                              onClick={() => handleCancelWacallsPair(inst.id)} 
                              className="mt-3 text-xs text-red-500 hover:text-red-600 font-bold transition-colors"
                            >
                              Cancelar Pareamento
                            </button>
                          </div>
                        )}

                        {showWacallsQr !== inst.id && (
                          <div className="flex gap-2">
                            {!wacallSession?.paired ? (
                              <button
                                onClick={() => handleStartWacallsPair(inst.id)}
                                className="flex-1 text-xs py-2.5 bg-emerald-500/10 hover:bg-[#00a884] text-[#00a884] hover:text-white font-semibold rounded-xl border border-emerald-500/20 hover:border-emerald-500 transition-all flex justify-center items-center gap-1.5 active:scale-95 shadow-sm"
                              >
                                <QrCode size={14} /> Ativar Chamadas de Voz
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleStartWacallsPair(inst.id)}
                                  className="flex-1 text-xs py-2.5 bg-blue-500/10 hover:bg-blue-500 hover:text-white text-blue-500 dark:text-blue-400 font-semibold rounded-xl border border-blue-500/20 hover:border-blue-500 transition-all flex justify-center items-center gap-1.5 active:scale-95"
                                  title="Gerar novo QR code para re-conectar"
                                >
                                  <RefreshCcw size={14} /> Re-parear Voz
                                </button>
                                <button
                                  onClick={() => handleDisconnectWacalls(inst.id)}
                                  className="px-3 py-2.5 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 font-semibold rounded-xl border border-red-500/20 hover:border-red-500 transition-all flex justify-center items-center gap-1.5 active:scale-95"
                                  title="Desativar voz e desparear device de chamadas"
                                >
                                  <LogOut size={14} /> Desativar Voz
                                </button>
                                <button
                                  onClick={() => handleTestWacallsConnection(inst.id, inst.display_name)}
                                  className="px-3 py-2.5 bg-violet-500/10 hover:bg-violet-500 hover:text-white text-violet-500 font-semibold rounded-xl border border-violet-500/20 hover:border-violet-500 transition-all flex justify-center items-center gap-1.5 active:scale-95"
                                  title="Testar conexões de ligações de voz e logar no Dev Logger"
                                >
                                  <Activity size={14} /> Testar
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Instancias List Card */}
                  <div className="p-4 sm:p-6 pb-4 border-b border-[#2a3942]/50 flex flex-col gap-4">
                    {/* Credentials Block */}
                    <div className="bg-black/5 dark:bg-black/30 p-4 rounded-2xl border border-gray-200/50 dark:border-white/5 flex flex-col gap-3 group/token backdrop-blur-sm">
                       <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold flex items-center gap-1"><Smartphone size={12}/> INSTANCE ID</span>
                          <div className="flex-1 text-right font-mono text-[10px] sm:text-xs tracking-wide text-gray-900 dark:text-gray-300 truncate">
                             {inst.id}
                          </div>
                       </div>
                       
                       <div className="flex items-center justify-between gap-3 border-t border-gray-200/50 dark:border-white/5 pt-3">
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-500 uppercase tracking-widest font-bold flex items-center gap-1"><Key size={12}/> API KEY</span>
                          <div className="flex-1 text-right font-mono text-[10px] sm:text-[11px] tracking-wide text-emerald-600 dark:text-emerald-400/80 group-hover/token:text-emerald-500 transition-colors truncate px-2">
                             {showToken[inst.id] ? (inst.api_key || 'Chave não definida') : '••••••••••••••••••••••••••••••••'}
                          </div>
                          <button onClick={() => setShowToken(prev => ({...prev, [inst.id]: !prev[inst.id]}))} className="text-gray-400 hover:text-emerald-500 transition-colors shrink-0">
                             {showToken[inst.id] ? <EyeOff size={16} /> : <EyeIcon size={16} />}
                          </button>
                       </div>
                    </div>

                    {/* WhatsApp Profile Banner */}
                    <div className="flex items-center gap-4 bg-white/50 dark:bg-white/5 p-3 rounded-2xl border border-gray-100 dark:border-white/5">
                      <div className="w-14 h-14 bg-gray-100 dark:bg-black/40 rounded-full border-2 border-emerald-500/20 flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-4 ring-emerald-500/5">
                      {inst.profile_picture_url ? (
                        <img src={inst.profile_picture_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className="text-gray-400" size={24} />
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                       <h4 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate flex items-center gap-2">
                          {inst.whatsapp_name || inst.display_name}
                       </h4>
                       <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {inst.phone_number ? `+${inst.phone_number}` : 'Aguardando Pareamento Device'}
                       </p>
                    </div>
                  </div>
                  
                  {/* Badges Info (Contatos, Mensagens) */}
                  <div className="flex gap-4 pt-2 sm:pt-1">
                     <div className="flex-1 flex flex-col justify-center bg-gray-50 dark:bg-black/20 rounded-xl p-3 border border-gray-100 dark:border-white/5">
                       <div className="flex items-center gap-2 mb-1">
                         <MessageSquare size={14} className="text-blue-500" />
                         <span className="text-[10px] font-bold text-gray-500 uppercase">Mensagens</span>
                       </div>
                       <span className="text-lg font-black text-gray-900 dark:text-white">{stats[inst.id]?.messages?.toLocaleString('pt-BR') || '0'}</span>
                     </div>
                     <div className="flex-1 flex flex-col justify-center bg-gray-50 dark:bg-black/20 rounded-xl p-3 border border-gray-100 dark:border-white/5">
                       <div className="flex items-center gap-2 mb-1">
                         <Users size={14} className="text-indigo-500" />
                         <span className="text-[10px] font-bold text-gray-500 uppercase">Contatos</span>
                       </div>
                       <span className="text-lg font-black text-gray-900 dark:text-white">{stats[inst.id]?.contacts?.toLocaleString('pt-BR') || '0'}</span>
                     </div>
                  </div>
                </div>

                {/* Painel Configurações Oculto */}
                {showSettings === inst.id && (
                   <div className="mb-6 bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/5 rounded-2xl p-5 shadow-inner">
                     <h5 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2 border-b dark:border-white/5 pb-3"><Settings size={14}/> Comportamento da Instância</h5>
                     <div className="space-y-4">
                        {[
                          { key: 'reject_calls', title: 'Rejeitar Chamadas', desc: 'Rejeitar todas as chamadas' },
                          { key: 'ignore_groups', title: 'Ignorar Grupos', desc: 'Ignorar todas as mensagens de grupos' },
                          { key: 'always_online', title: 'Sempre Online', desc: 'Permanecer sempre online' },
                          { key: 'read_messages', title: 'Visualizar Mensagens', desc: 'Marcar todas as mensagens como lidas' },
                          { key: 'sync_history', title: 'Sincronizar Histórico Completo', desc: 'Sincronizar o histórico completo ao ler o QR Code' },
                        ].map((setting) => (
                           <div key={setting.key} className="flex justify-between items-center gap-4">
                             <div>
                               <p className="text-sm font-bold text-gray-800 dark:text-white">{setting.title}</p>
                               <p className="text-xs text-gray-500 dark:text-[#8696a0]">{setting.desc}</p>
                             </div>
                             <button
                               onClick={() => toggleSetting(inst.id, inst.settings, setting.key)}
                               className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-1 cursor-pointer shrink-0 ${inst.settings?.[setting.key] ? 'bg-[#00a884]' : 'bg-gray-300 dark:bg-white/10'}`}
                             >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${inst.settings?.[setting.key] ? 'translate-x-6' : 'translate-x-0'}`} />
                             </button>
                           </div>
                        ))}

                         <div className="border-t border-gray-100 dark:border-white/5 pt-4 mt-4">
                           <label className="block text-xs font-bold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider mb-2">Número de WhatsApp Associado</label>
                           <div className="flex gap-2">
                             <input
                               type="text"
                               placeholder="Ex: 5511991649959"
                               defaultValue={inst.phone_number || ''}
                               onBlur={async (e) => {
                                 const val = e.target.value.replace(/\D/g, '');
                                 if (val && val.length >= 7 && val !== (inst.phone_number || '')) {
                                   const { error } = await supabase.from('whatsapp_instances').update({ phone_number: val }).eq('id', inst.id);
                                   if (error) {
                                     alert("Erro ao associar número: " + error.message);
                                   } else {
                                     fetchInstances();
                                     alert("Número associado com sucesso!");
                                   }
                                 }
                               }}
                               className="w-full bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/5 rounded-xl px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition-all"
                             />
                           </div>
                           <p className="text-[10px] text-gray-400 mt-1">Este número será pré-preenchido automaticamente na tela de pareamento por código de 8 dígitos.</p>
                         </div>
                      </div>
                   </div>
                )}

                 {/* Painel Ajuda Explicativo */}
                 {showHelpModal === inst.id && (
                    <div className="mb-6 bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/5 rounded-2xl p-5 shadow-inner animate-in fade-in slide-in-from-top-2 duration-200 max-h-[400px] overflow-y-auto custom-scrollbar">
                      <h5 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2 border-b dark:border-white/5 pb-3">
                        <HelpCircle size={16} className="text-[#00a884]" /> Guia de Funções e Ações
                      </h5>
                      <div className="space-y-4">
                        {[
                          { title: '📞 Módulo de Chamadas (Voz)', desc: 'Gera um QR code secundário exclusivo de VoIP. Permite fazer e receber ligações telefônicas nativas de WhatsApp diretamente pela tela do operador no navegador.' },
                          { title: '🟢 Status da Conexão', desc: 'Mostra a saúde do bot de texto. "Conectado" significa que o chatbot principal e o envio de mensagens de texto estão funcionando normalmente.' },
                          { title: '🔄 Sync (Sincronizar Contatos)', desc: 'Força a atualização imediata dos contatos do celular com o painel do sistema. Sincroniza fotos, nomes e conversas recentes.' },
                          { title: '📶 Forçar ON', desc: 'Envia sinal de atividade para o WhatsApp. Deixa o robô ou atendente visível como "Online" para os clientes, otimizando as interações e tempo de resposta.' },
                          { title: '🗑️ Limpar Memória (Cache)', desc: 'Limpa a memória temporária (RAM) de mensagens cacheadas no servidor para evitar lentidão, sem apagar nenhum dado do banco de dados principal.' },
                          { title: '⚡ Reiniciar', desc: 'Recarrega a conexão do soquete do WhatsApp no servidor. Útil se houver queda de sinal, atraso no envio ou desconexão momentânea.' },
                          { title: '🔌 Desparear', desc: 'Desconecta e desvincula a conta do WhatsApp do servidor do sistema (remove o dispositivo conectado nas configurações do seu celular).' },
                          { title: '⭐ Usar Existente (Primária)', desc: 'Seleciona essa instância como a conexão primária de envio. As mensagens disparadas por essa empresa no chat usarão este número.' },
                          { title: '🔴 Excluir Instância (Lixeira)', desc: 'Apaga permanentemente todas as chaves, sessões salvas e conexões daquela instância do servidor do sistema. Ação irreversível.' },
                        ].map((item, idx) => (
                          <div key={idx} className="border-b border-gray-100 dark:border-white/5 pb-3 last:border-none last:pb-0 text-left">
                            <p className="text-xs font-bold text-gray-800 dark:text-white mb-0.5">{item.title}</p>
                            <p className="text-[11px] text-gray-500 dark:text-[#8696a0] leading-relaxed">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                 )}

                 {/* Área de Pareamento Inline (Substitui Modal) */}
                 {showQrModal === inst.id && (
                    <div className="mt-6 w-full flex flex-col items-center justify-center p-6 bg-gray-50/50 dark:bg-black/30 border border-gray-200/50 dark:border-white/5 rounded-3xl animate-in fade-in zoom-in-95">
                       <h4 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                         <QrCode className="text-emerald-500" /> Vincular WhatsApp
                       </h4>

                       {/* Seletor de Abas */}
                       <div className="flex gap-2 mb-6 bg-gray-200/50 dark:bg-white/5 p-1 rounded-2xl w-full max-w-sm">
                         <button
                           onClick={() => {
                             setConnectMode('qr');
                             handleConnect(inst.id, inst.api_key);
                           }}
                           className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${connectMode === 'qr' ? 'bg-[#00a884] text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/30'}`}
                         >
                           <QrCode size={14} /> Escanear QR Code
                         </button>
                         <button
                           onClick={() => {
                             setConnectMode('pairing');
                             setQrCode(null);
                             setPairingPhone(inst.phone_number || '');
                           }}
                           className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${connectMode === 'pairing' ? 'bg-[#00a884] text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/30'}`}
                         >
                           <Phone size={14} /> Código de 8 Dígitos
                         </button>
                       </div>

                       {connectMode === 'qr' && (
                         <>
                           <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 text-center max-w-sm">Abra "Aparelhos Conectados" no seu WhatsApp e aponte a câmera para o QR.</p>
                           <div className="w-56 h-56 bg-white rounded-2xl shadow-inner border border-gray-200 dark:border-gray-800 flex items-center justify-center overflow-hidden mb-5 relative">
                              {qrLoading ? (
                                <div className="flex flex-col items-center gap-2">
                                  <Loader2 className="animate-spin text-emerald-500" size={28} />
                                  <span className="text-[10px] font-bold text-gray-400">GERANDO...</span>
                                </div>
                              ) : qrCode ? (
                                <img src={qrCode} alt="QR Code Inline" className="w-full h-full object-cover animate-in fade-in" />
                              ) : (
                                <span className="text-xs font-semibold text-red-400">QR Code falhou.</span>
                              )}
                           </div>
                         </>
                       )}

                       {connectMode === 'pairing' && (
                         <div className="w-full max-w-sm flex flex-col items-center">
                           {!pairingCode ? (
                             <>
                               <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 text-center">Digite o número completo do WhatsApp no formato internacional para gerar o código de pareamento.</p>
                               <div className="w-full mb-4 text-left">
                                 <label className="block text-[10px] font-bold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider mb-1">Número do WhatsApp (com DDI e DDD)</label>
                                 <input
                                   type="text"
                                   placeholder="Ex: 5511991649959"
                                   value={pairingPhone}
                                   onChange={(e) => setPairingPhone(e.target.value)}
                                   className="w-full bg-white dark:bg-[#202c33] border border-gray-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-semibold text-gray-800 dark:text-white focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] transition-all"
                                 />
                                 <p className="text-[10px] text-amber-500 dark:text-amber-400 mt-1.5 leading-relaxed">
                                   ⚠️ <strong>Dica Brasil (DDI 55):</strong> Se o celular exibir "Não foi possível conectar o dispositivo", tente gerar o código novamente <strong>removendo o primeiro 9</strong> após o DDD (ex: 551191649959). Contas antigas costumam requerer o formato de 8 dígitos.
                                 </p>
                               </div>
                               <button
                                 onClick={() => handleRequestPairingCode(inst.id, inst.api_key)}
                                 disabled={pairingLoading}
                                 className="w-full py-3.5 bg-[#00a884] hover:bg-[#008f6f] disabled:bg-[#00a884]/50 text-white rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 mb-4 cursor-pointer"
                               >
                                 {pairingLoading ? (
                                   <>
                                     <Loader2 className="animate-spin" size={16} /> Gerando Código...
                                   </>
                                 ) : (
                                   'Gerar Código de Pareamento'
                                 )}
                               </button>
                             </>
                           ) : (
                             <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
                               <p className="text-xs text-gray-500 dark:text-[#8696a0] mb-2 text-center font-semibold">Seu código de pareamento do WhatsApp:</p>
                               <div className="px-6 py-4 bg-gray-100 dark:bg-black/40 rounded-2xl border border-gray-200 dark:border-white/5 mb-5 font-mono text-2xl font-bold text-[#00a884] tracking-widest uppercase flex items-center gap-3">
                                 {pairingCode ? `${pairingCode.slice(0, 4)} - ${pairingCode.slice(4)}` : ''}
                                 <button
                                   onClick={() => {
                                     if (pairingCode) {
                                       navigator.clipboard.writeText(pairingCode.replace(/[^a-zA-Z0-9]/g, ''));
                                       alert("Código copiado!");
                                     }
                                   }}
                                   className="p-1.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg text-gray-500 dark:text-[#8696a0] transition-colors cursor-pointer"
                                   title="Copiar código"
                                 >
                                   <Copy size={16} />
                                 </button>
                               </div>
                               <div className="w-full bg-gray-100 dark:bg-[#202c33]/40 p-4 rounded-2xl border border-gray-200 dark:border-white/5 text-left mb-5 space-y-2.5">
                                 <h6 className="text-[10px] font-bold text-gray-800 dark:text-white uppercase tracking-wide">Instruções no Celular:</h6>
                                 <ol className="list-decimal list-inside text-xs text-gray-500 dark:text-[#8696a0] space-y-1.5 leading-relaxed">
                                   <li>Abra o **WhatsApp** no seu celular.</li>
                                   <li>Vá em **Dispositivos Conectados &gt; Conectar um dispositivo**.</li>
                                   <li>Escolha **"Conectar com número de telefone em vez disso"** (na parte inferior).</li>
                                   <li>Digite o código **{pairingCode ? `${pairingCode.slice(0, 4)} - ${pairingCode.slice(4)}` : ''}** no seu celular.</li>
                                 </ol>
                               </div>
                               <div className="flex items-center gap-2 text-xs text-[#00a884] font-bold mb-4 animate-pulse">
                                 <Loader2 className="animate-spin" size={14} /> Aguardando pareamento no celular...
                               </div>
                             </div>
                           )}
                         </div>
                       )}

                       <button 
                         onClick={() => {
                           setShowQrModal(null);
                           setPairingCode(null);
                           setPairingPhone('');
                         }} 
                         className="w-full py-3 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 hover:dark:bg-white/20 text-gray-700 dark:text-white rounded-[14px] font-bold transition-all text-sm cursor-pointer"
                       >
                         Cancelar
                       </button>
                    </div>
                 )}

                {/* Botões Bottom (Não exibir se estiver mostrando o QR inline) */}
                {showQrModal !== inst.id && (
                  <div className="mt-auto pt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 dark:border-white/5">
                    {inst.status === 'offline' ? (
                       <button onClick={() => handleConnect(inst.id, inst.api_key)} className="flex-1 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3.5 px-4 rounded-[14px] transition-all flex justify-center items-center gap-2">
                         Escanear QR Code Aqui
                       </button>
                    ) : inst.status === 'connecting' ? (
                       <button onClick={() => handleConnect(inst.id, inst.api_key)} className="flex-1 bg-[#00a884] hover:bg-[#008f6f] text-white font-bold py-3.5 px-4 rounded-[14px] transition-all flex justify-center items-center gap-2">
                         <RefreshCcw size={18} className="animate-spin" /> Ver QR Code Aqui
                       </button>
                    ) : (
                       <>
                           <button disabled className="flex-1 bg-[#00a884]/20 text-[#00a884] font-bold py-3.5 px-4 rounded-[14px] flex justify-center items-center gap-2 cursor-default border border-[#00a884]/30">
                             Conectado
                           </button>
                           <button onClick={() => fireEngineAction(inst.id, inst.api_key, 'sync-contacts', 'Sincronizado!')} className="px-3 py-3.5 bg-blue-500/10 hover:bg-blue-500 hover:text-white text-blue-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-blue-500/20 hover:border-blue-500" title="Ler Contatos Recentes">
                             <RefreshCcw size={18} /> Sync
                           </button>
                           <button onClick={() => fireEngineAction(inst.id, inst.api_key, 'presence', 'Status forçado!')} className="px-3 py-3.5 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-emerald-500/20 hover:border-emerald-500" title="Avisar que está online para todos">
                             <Signal size={18} /> Forçar ON
                           </button>
                           <button onClick={() => { if(window.confirm('Purgar Cache? As conversas de hoje serão apagadas da RAM temporária do servidor.')) fireEngineAction(inst.id, inst.api_key, 'clear-store', 'Cache Limpo') }} className="px-3 py-3.5 bg-gray-500/10 hover:bg-gray-500 hover:text-white text-gray-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-gray-500/20 hover:border-gray-500" title="Apagar Histórico em Memória">
                             <Trash2 size={18} /> Limpar Mem.
                           </button>
                           <button onClick={() => fireEngineAction(inst.id, inst.api_key, 'reconnect', 'Reiniciando...')} className="px-3 py-3.5 bg-gray-100 dark:bg-[#202c33] hover:dark:bg-white/10 text-gray-700 dark:text-white font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-gray-200 dark:border-white/5">
                             Reiniciar
                           </button>
                           <button onClick={() => handleDisconnect(inst.id, inst.api_key)} className="px-3 py-3.5 bg-orange-500/10 hover:bg-orange-500 hover:text-white text-orange-500 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-orange-500/20 hover:border-orange-500">
                             Desparear
                           </button>
                       </>
                    )}

                    {/* Botão Link de Conexão Direta (Sem Login) */}
                    <button 
                      onClick={() => {
                        const directUrl = `${window.location.origin}/connect-instance/${inst.id}`;
                        navigator.clipboard.writeText(directUrl);
                        alert(`🔗 Link de Conexão Direta (Sem Login) copiado!\n\n${directUrl}\n\nQualquer pessoa pode abrir este link no celular para conectar o WhatsApp sem precisar de login.`);
                      }}
                      className="px-4 py-3.5 bg-purple-500/10 hover:bg-purple-500 hover:text-white text-purple-400 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-purple-500/20 hover:border-purple-500 cursor-pointer"
                      title="Copiar Link de Conexão Direta (Sem Necessidade de Login)"
                    >
                      <Link size={18} /> Link QR
                    </button>

                    {/* Botão Associar a Empresa */}
                    <button 
                      onClick={() => { setEditingTenantInstance(inst); setNewTenantForInstance(inst.tenant_id || ''); }}
                      className="px-4 py-3.5 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 font-bold rounded-[14px] transition-all flex justify-center items-center gap-2 border border-emerald-500/20 hover:border-emerald-500 cursor-pointer"
                      title="Associar ou Trocar a Empresa Proprietária desta Instância"
                    >
                      <Building2 size={18} /> Associar a Empresa
                    </button>

                  {/* Botão Usar Esta Instância */}
                  {activeInstanceId === inst.id ? (
                      <button disabled className="px-5 py-3.5 bg-blue-500/20 text-blue-500 font-bold rounded-[14px] flex justify-center items-center gap-2 cursor-default border border-blue-500/30">
                        Primária
                      </button>
                   ) : (
                      <button onClick={() => handleSetAsActive(inst.id)} className="px-5 py-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-[14px] font-bold transition-all border border-transparent shadow-md hover:shadow-lg">
                        Usar Existente
                      </button>
                   )}
                  {/* Este é o botão excluir real, vou deixar vermelho isolado */}
                  <button onClick={() => handleDelete(inst)} className="p-3.5 bg-red-900/40 hover:bg-red-600 hover:text-white text-red-400 rounded-[14px] font-bold transition-all border border-transparent" title="Excluir Instância Permanentemente">
                     <Trash2 size={20} />
                  </button>
                </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
