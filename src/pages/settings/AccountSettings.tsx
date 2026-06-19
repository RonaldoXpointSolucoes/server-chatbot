import React, { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import { Settings2, Save, Link as LinkIcon, Briefcase, Store, MapPin, Clock, Plus, Trash2, Camera, Video, Utensils, Smartphone, Wifi, Battery, Signal, Home, Search, ClipboardList, User, ChevronLeft, ArrowLeft, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../services/supabase';

interface HorarioPeriodo {
  inicio: string;
  fim: string;
}

interface DiaTrabalho {
  dia: string;
  aberto: boolean;
  periodos: HorarioPeriodo[];
}

const DIAS_PADRAO: DiaTrabalho[] = [
  { dia: 'Segunda-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Terça-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Quarta-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Quinta-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Sexta-feira', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
  { dia: 'Sábado', aberto: true, periodos: [{ inicio: '18:00', fim: '00:00' }] },
  { dia: 'Domingo', aberto: true, periodos: [{ inicio: '18:00', fim: '23:00' }] },
];

const gerarTextoHorario = (dias: DiaTrabalho[]) => {
  const partes: string[] = [];
  dias.forEach(d => {
    if (d.aberto && d.periodos.length > 0) {
      const turnosText = d.periodos
        .map(p => `das ${p.inicio.replace(':', 'h')} às ${p.fim.replace(':', 'h')}`)
        .join(' e ');
      partes.push(`${d.dia}: ${turnosText}`);
    } else {
      partes.push(`${d.dia}: Não abre`);
    }
  });
  return partes.join('. ');
};

const GASTROFOOD_BASE_URL = 'https://service.xpointsolucoes.com.br:8443';
const CARDAPIO_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/server/nuvem/ProdutoPdvService/GetCardapioCompleto`;
const CEP_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/usuario_2.0/ConsultaCepService/Execute`;
const CLIENTE_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/usuario_2.0/LoginService/ValidaTelefone`;
const PEDIDO_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/server/nuvem/PedidoCardapioService/FinalizeOrder`;

const DEFAULT_CEP_PAYLOAD = `{
  "ACep": "06764365"
}`;

const DEFAULT_CLIENTE_PAYLOAD = `{
  "ATelefone": "973933247"
}`;

const DEFAULT_PEDIDO_PAYLOAD = `{
  "jsOrder": {
    "module": 1,
    "fkCustomer": "9EA3F679-5565-4DA0-930F-0971A8B8A3CD",
    "fkStore": "6A728D2A-8612-4DC1-8676-0B10E4D38AD5",
    "subTotal": 37,
    "received": 41,
    "txDelivery": 4,
    "discount": 0,
    "cpf": "51308379838",
    "pagto": "Debito com Maquininha",
    "address": {
      "Cep": "06754-160",
      "Logradouro": "Praça Miguel Ortega",
      "Numero": "340",
      "Bairro": "Parque Assuncao",
      "Cidade": "Taboão da Serra",
      "Complemento": "",
      "Referencia": "",
      "Uf": "SP",
      "Bloco": "",
      "Ap": "",
      "Latitude": "-23.604002",
      "Longitude": "-46.763923",
      "Distancia": "2,5",
      "Tempo": "10 mins"
    },
    "items": [
      {
        "code": "1",
        "codePdv": "001489",
        "name": "Plus Italiano",
        "amount": 1,
        "unitary": "UN",
        "price": 37,
        "complement": "",
        "imgProd": "https://service.xpointsolucoes.com.br:8443/xpoint/arquivos/Imagens/39768487000192/produto/IDFD938165-1AC8-40D7-8126-20466FA71443-1.png",
        "itemsCuston": [
          {
            "code": "1065",
            "name": "Ao ponto",
            "amount": 1,
            "price": 0,
            "typeCalc": 0,
            "codePdv": "C31",
            "fkPasso": "7D7FAF82-8EBD-4C94-9568-951F01ECBD89",
            "numberPasso": 1
          },
          {
            "code": "1861",
            "name": "Sem molho",
            "amount": 1,
            "price": 0,
            "typeCalc": 0,
            "codePdv": "C",
            "fkPasso": "F9CE4A1E-59D4-45A4-AA83-CBB677D7AD07",
            "numberPasso": 2
          }
        ]
      }
    ],
    "custumer": {
      "IdUsuario": "9EA3F679-5565-4DA0-930F-0971A8B8A3CD",
      "NomeRazao": "Valmir Teixeira",
      "Ddi": "+55",
      "Telefone": "11973933247"
    },
    "origin": 2,
    "estimatedDeliveryInMinutes": "3 mins"
  }
}`;

export default function AccountSettings() {
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const updateTenantSettings = useChatStore(state => state.updateTenantSettings);

  const [nomeIa, setNomeIa] = useState('');
  const [endereco, setEndereco] = useState('');
  const [diasHorarios, setDiasHorarios] = useState<DiaTrabalho[]>(DIAS_PADRAO);
  const [linkCardapio, setLinkCardapio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [googleMaps, setGoogleMaps] = useState('');
  const [youtube, setYoutube] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [cardapioJsonUrl, setCardapioJsonUrl] = useState(CARDAPIO_DEFAULT_URL);
  const [cardapioJsonToken, setCardapioJsonToken] = useState('');
  const [cardapioJsonPayload, setCardapioJsonPayload] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState('');
  const [activeResultTab, setActiveResultTab] = useState<'preview' | 'json'>('preview');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  
  // Estados para Detalhes do Produto & Passos (Adicionais)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [productSteps, setProductSteps] = useState<any | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [stepsError, setStepsError] = useState('');
  const [detailQty, setDetailQty] = useState(1);

  // Estados para Mapeamento no Supabase
  const [isMapping, setIsMapping] = useState(false);
  const [mappingProgress, setMappingProgress] = useState(0);
  const [mappingLogs, setMappingLogs] = useState<string[]>([]);
  const [estTimeRemaining, setEstTimeRemaining] = useState<number | null>(null);
  const [loadSource, setLoadSource] = useState<'api' | 'supabase'>('api');
  const [supabaseData, setSupabaseData] = useState<{ grupos: any[]; produtos: any[] } | null>(null);

  // Estados para controle de colapso
  const [isHorariosExpanded, setIsHorariosExpanded] = useState(false);
  const [isCardapioExpanded, setIsCardapioExpanded] = useState(false);
  const [isCepExpanded, setIsCepExpanded] = useState(false);
  const [isClienteExpanded, setIsClienteExpanded] = useState(false);
  const [isPedidoExpanded, setIsPedidoExpanded] = useState(false);

  // Estados para Consulta de CEP
  const [cepJsonUrl, setCepJsonUrl] = useState(CEP_DEFAULT_URL);
  const [cepJsonToken, setCepJsonToken] = useState('');
  const [cepJsonPayload, setCepJsonPayload] = useState(DEFAULT_CEP_PAYLOAD);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepResult, setCepResult] = useState<any>(null);
  const [cepError, setCepError] = useState('');

  // Estados para Consulta de Cliente
  const [clienteJsonUrl, setClienteJsonUrl] = useState(CLIENTE_DEFAULT_URL);
  const [clienteJsonToken, setClienteJsonToken] = useState('');
  const [clienteJsonPayload, setClienteJsonPayload] = useState(DEFAULT_CLIENTE_PAYLOAD);
  const [clienteLoading, setClienteLoading] = useState(false);
  const [clienteResult, setClienteResult] = useState<any>(null);
  const [clienteError, setClienteError] = useState('');

  // Estados para Envio de Pedido
  const [pedidoJsonUrl, setPedidoJsonUrl] = useState(PEDIDO_DEFAULT_URL);
  const [pedidoJsonToken, setPedidoJsonToken] = useState('');
  const [pedidoJsonPayload, setPedidoJsonPayload] = useState(DEFAULT_PEDIDO_PAYLOAD);
  const [pedidoLoading, setPedidoLoading] = useState(false);
  const [pedidoResult, setPedidoResult] = useState<any>(null);
  const [pedidoError, setPedidoError] = useState('');

  const handleTestGeneric = async (
    url: string,
    token: string,
    payload: string,
    setLoading: (l: boolean) => void,
    setResult: (r: any) => void,
    setError: (e: string) => void
  ) => {
    setLoading(true);
    setResult(null);
    setError('');
    try {
      if (!url) {
        throw new Error('A URL do endpoint é obrigatória para realizar o teste.');
      }

      let parsedPayload = null;
      if (payload) {
        try {
          parsedPayload = JSON.parse(payload);
        } catch (e) {
          throw new Error('O corpo da requisição (JSON Payload) não é um JSON válido. Verifique se aspas duplas, vírgulas e chaves estão corretas.');
        }
      }

      const apiBase = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || window.location.origin;
      const res = await fetch(`${apiBase}/api/v1/utils/test-cardapio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          token,
          payload: parsedPayload
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Erro na requisição. Status: ${res.status}`);
      }

      const resData = await res.json();
      setResult(resData);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro desconhecido.');
    } finally {
      setLoading(false);
    }
  };
  
  const cancelMappingRef = useRef(false);

  const loadCardapioFromSupabase = async (tenantId: string) => {
    try {
      const { data: dbGrupos, error: errG } = await supabase
        .from('cardapio_grupos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('ordem', { ascending: true });

      if (errG) throw errG;

      const { data: dbProdutos, error: errP } = await supabase
        .from('cardapio_produtos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      if (errP) throw errP;

      if (dbGrupos && dbGrupos.length > 0) {
        const gruposMapeados = dbGrupos.map(g => ({
          id: g.id,
          description: g.descricao,
          active: g.ativo
        }));

        const produtosMapeados = (dbProdutos || []).map(p => ({
          id: p.id,
          groupId: p.grupo_id,
          name: p.name,
          description: p.description,
          price: Number(p.price),
          image: p.image,
          active: p.ativo
        }));

        setSupabaseData({
          grupos: gruposMapeados,
          produtos: produtosMapeados
        });
        
        // Define o grupo ativo inicial se houver
        if (gruposMapeados.length > 0) {
          setActiveGroupId(gruposMapeados[0].id);
        }
      } else {
        setSupabaseData(null);
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados do Supabase:', err);
    }
  };

  useEffect(() => {
    if (tenantInfo?.id) {
      loadCardapioFromSupabase(tenantInfo.id);
    }
  }, [tenantInfo?.id]);

  const handleMapCardapio = async () => {
    setIsMapping(true);
    setMappingProgress(0);
    setMappingLogs([]);
    setEstTimeRemaining(null);
    cancelMappingRef.current = false;

    const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString('pt-BR');
      setMappingLogs(prev => [...prev, `[${time}] ${msg}`]);
    };

    addLog('Iniciando o mapeamento do cardápio...');

    try {
      const currentTenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!currentTenantId) {
        throw new Error('ID do Inquilino (tenant_id) não encontrado.');
      }

      if (!cardapioJsonUrl) {
        throw new Error('A URL do endpoint é obrigatória.');
      }

      if (cardapioJsonPayload) {
        try {
          JSON.parse(cardapioJsonPayload);
        } catch (e) {
          throw new Error('O corpo da requisição (JSON Payload) não é um JSON válido.');
        }
      }

      addLog('Buscando grupos e produtos do servidor externo Gastrofood...');
      const apiBase = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || window.location.origin;
      const res = await fetch(`${apiBase}/api/v1/utils/test-cardapio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: cardapioJsonUrl,
          token: cardapioJsonToken,
          payload: cardapioJsonPayload ? JSON.parse(cardapioJsonPayload) : null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Erro na requisição. Status: ${res.status}`);
      }

      const resData = await res.json();
      if (!resData.data || !Array.isArray(resData.data.grupos) || !Array.isArray(resData.data.produtos)) {
        throw new Error('Estrutura de resposta inválida.');
      }

      const { grupos, produtos } = resData.data;
      addLog(`Sucesso! Encontrados ${grupos.length} grupos e ${produtos.length} produtos.`);

      // 1. Salvar os grupos no Supabase
      addLog('Salvando grupos no Supabase...');
      const gruposToUpsert = grupos.map((g: any, index: number) => ({
        id: g.id,
        tenant_id: currentTenantId,
        ordem: index,
        descricao: g.description,
        ativo: g.active !== false
      }));

      const { error: errGrupos } = await supabase
        .from('cardapio_grupos')
        .upsert(gruposToUpsert, { onConflict: 'id' });

      if (errGrupos) throw errGrupos;
      addLog(`Grupos salvos com sucesso (${gruposToUpsert.length} itens).`);

      // 2. Salvar os produtos no Supabase
      addLog('Salvando produtos no Supabase...');
      const produtosToUpsert = produtos.map((p: any) => ({
        id: p.id,
        tenant_id: currentTenantId,
        grupo_id: p.groupId,
        name: p.name,
        description: p.description || null,
        price: p.price || 0.00,
        image: p.image || null,
        ativo: p.active !== false
      }));

      const { error: errProdutos } = await supabase
        .from('cardapio_produtos')
        .upsert(produtosToUpsert, { onConflict: 'id' });

      if (errProdutos) throw errProdutos;
      addLog(`Produtos salvos com sucesso (${produtosToUpsert.length} itens).`);

      // 3. Processamento sequencial e suave dos adicionais
      addLog('Iniciando mapeamento de adicionais (1 item a cada 5 segundos para evitar sobrecarga)...');

      // Calcula a URL de passos
      let stepsUrl = cardapioJsonUrl;
      if (stepsUrl.includes('/ProdutoPdvService/GetCardapioCompleto')) {
        stepsUrl = stepsUrl.replace('/ProdutoPdvService/GetCardapioCompleto', '/ProdutoCardapioService/ProdutoComPassos');
      } else {
        try {
          const urlObj = new URL(stepsUrl);
          urlObj.pathname = '/v6/server/nuvem/ProdutoCardapioService/ProdutoComPassos';
          stepsUrl = urlObj.toString();
        } catch (e) {
          stepsUrl = stepsUrl.replace(/\/v6\/server\/nuvem\/.*$/, '/v6/server/nuvem/ProdutoCardapioService/ProdutoComPassos');
        }
      }

      const total = produtos.length;
      for (let i = 0; i < total; i++) {
        if (cancelMappingRef.current) {
          addLog('Mapeamento cancelado pelo usuário.');
          break;
        }

        const product = produtos[i];
        const indexNum = i + 1;

        // Atualiza progresso e estimativa
        setMappingProgress(Math.round((i / total) * 100));
        setEstTimeRemaining((total - i) * 5);

        addLog(`[${indexNum}/${total}] Requisitando adicionais de "${product.name}"...`);

        try {
          const resSteps = await fetch(`${apiBase}/api/v1/utils/test-cardapio`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: stepsUrl,
              token: cardapioJsonToken,
              payload: {
                AIdProduto: product.id
              }
            })
          });

          if (resSteps.ok) {
            const stepsData = await resSteps.json();
            if (stepsData.status === 200 && stepsData.data) {
              const passosRaw = stepsData.data.passos || stepsData.data.Passos || [];
              const passos = Array.isArray(passosRaw) ? passosRaw : [];

              if (passos.length > 0) {
                addLog(`  -> Encontrados ${passos.length} passos de adicionais. Salvando...`);

                const passosToUpsert = passos.map((p: any, idx: number) => {
                  const idPasso = p.IdProdutoPassos || p.id || p.Id;
                  const pergunta = p.Pergunta || p.pergunta || p.SubTitulo || p.subTitulo || 'Opções';
                  const subTitulo = p.SubTitulo || p.subTitulo || null;
                  const qtdMin = p.QtdMin !== undefined ? p.QtdMin : (p.qtdMin !== undefined ? p.qtdMin : 0);
                  const qtdMax = p.QtdMax !== undefined ? p.QtdMax : (p.qtdMax !== undefined ? p.qtdMax : 1);
                  const ativo = p.Ativo !== false && p.ativo !== false;

                  return {
                    id: idPasso,
                    tenant_id: currentTenantId,
                    produto_id: product.id,
                    pergunta: pergunta,
                    sub_titulo: subTitulo,
                    qtd_min: qtdMin,
                    qtd_max: qtdMax,
                    ordem: idx,
                    ativo: ativo
                  };
                });

                const { error: errPassos } = await supabase
                  .from('cardapio_passos')
                  .upsert(passosToUpsert, { onConflict: 'id' });

                if (errPassos) throw errPassos;

                const opcoesToUpsert: any[] = [];
                passos.forEach((p: any) => {
                  const rawLista = p.ListaProdutos || p.listaProdutos || p.produtos || p.Produtos || [];
                  const idPasso = p.IdProdutoPassos || p.id || p.Id;

                  if (Array.isArray(rawLista)) {
                    rawLista.forEach((opt: any) => {
                      const precoList = opt.ListaPreco || opt.listaPreco || [];
                      const precoAdicional = precoList?.[0]?.Preco !== undefined 
                        ? precoList[0].Preco 
                        : (precoList?.[0]?.preco !== undefined 
                          ? precoList[0].preco 
                          : (opt.Preco !== undefined 
                            ? opt.Preco 
                            : (opt.preco !== undefined ? opt.preco : 0)));

                      const idOpcao = opt.IdProduto || opt.id || opt.Id;
                      const descricao = opt.Descricao || opt.descricao || 'Opção';
                      const imagem = opt.Imagem || opt.imagem || opt.image || null;
                      const ativoOpcao = opt.Ativo !== false && opt.ativo !== false;

                      opcoesToUpsert.push({
                        id: idOpcao,
                        tenant_id: currentTenantId,
                        passo_id: idPasso,
                        descricao: descricao,
                        preco: precoAdicional,
                        imagem: imagem,
                        ativo: ativoOpcao
                      });
                    });
                  }
                });

                if (opcoesToUpsert.length > 0) {
                  const { error: errOpcoes } = await supabase
                    .from('cardapio_opcoes')
                    .upsert(opcoesToUpsert, { onConflict: 'id' });

                  if (errOpcoes) throw errOpcoes;
                  addLog(`  -> ${opcoesToUpsert.length} opções salvas no Supabase.`);
                }
              } else {
                addLog(`  -> Nenhum opcional cadastrado para este produto.`);
              }
            } else {
              addLog(`  -> Aviso: Resposta de passos inválida ou vazia.`);
            }
          } else {
            addLog(`  -> Falha na API para buscar passos de "${product.name}" (Status ${resSteps.status}).`);
          }
        } catch (prodErr: any) {
          addLog(`  -> Erro ao processar passos de "${product.name}": ${prodErr.message}`);
        }

        // Aguarda 5 segundos de forma suave com contagem regressiva por segundo no log
        if (i < total - 1 && !cancelMappingRef.current) {
          for (let sec = 5; sec > 0; sec--) {
            if (cancelMappingRef.current) break;
            setEstTimeRemaining((total - i - 1) * 5 + sec);
            const subProgress = ((i + (5 - sec) / 5) / total) * 100;
            setMappingProgress(Math.round(subProgress));
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (cancelMappingRef.current) {
        addLog('Sincronização abortada pelo usuário.');
        setIsMapping(false);
        setEstTimeRemaining(null);
      } else {
        setMappingProgress(100);
        setEstTimeRemaining(0);
        addLog('🎉 Mapeamento concluído com sucesso (100%)!');
        
        // Limpa cache no backend para refletir o novo mapeamento imediatamente
        const apiBase = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || window.location.origin;
        fetch(`${apiBase}/api/v1/utils/clear-cardapio-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: currentTenantId })
        }).catch(err => console.error('Erro ao invalidar cache do cardápio pós-mapeamento:', err));

        await loadCardapioFromSupabase(currentTenantId);
        setLoadSource('supabase');
      }

    } catch (err: any) {
      console.error('Erro no mapeamento do cardápio:', err);
      addLog(`❌ ERRO: ${err.message || 'Ocorreu um erro inesperado.'}`);
      setEstTimeRemaining(null);
    } finally {
      setIsMapping(false);
    }
  };

  useEffect(() => {
    console.log("AccountSettings montou. tenantInfo:", tenantInfo);
    if (tenantInfo?.settings) {
      setNomeIa(tenantInfo.settings.nome_ia || '');
      setEndereco(tenantInfo.settings.endereco || '');
      setLinkCardapio(tenantInfo.settings.link_cardapio || '');
      setInstagram(tenantInfo.settings.instagram || '');
      setGoogleMaps(tenantInfo.settings.google_maps || '');
      setYoutube(tenantInfo.settings.youtube || '');
      setTiktok(tenantInfo.settings.tiktok || '');
      setCardapioJsonUrl(tenantInfo.settings.cardapio_json_url || CARDAPIO_DEFAULT_URL);
      setCardapioJsonToken(tenantInfo.settings.cardapio_json_token || '');
      setCardapioJsonPayload(tenantInfo.settings.cardapio_json_payload || '');

      setCepJsonUrl(tenantInfo.settings.cep_json_url || CEP_DEFAULT_URL);
      setCepJsonToken(tenantInfo.settings.cep_json_token || '');
      setCepJsonPayload(tenantInfo.settings.cep_json_payload || DEFAULT_CEP_PAYLOAD);

      setClienteJsonUrl(tenantInfo.settings.cliente_json_url || CLIENTE_DEFAULT_URL);
      setClienteJsonToken(tenantInfo.settings.cliente_json_token || '');
      setClienteJsonPayload(tenantInfo.settings.cliente_json_payload || DEFAULT_CLIENTE_PAYLOAD);

      setPedidoJsonUrl(tenantInfo.settings.pedido_json_url || PEDIDO_DEFAULT_URL);
      setPedidoJsonToken(tenantInfo.settings.pedido_json_token || '');
      setPedidoJsonPayload(tenantInfo.settings.pedido_json_payload || DEFAULT_PEDIDO_PAYLOAD);
      
      if (tenantInfo.settings.horarios_estrutura) {
        setDiasHorarios(tenantInfo.settings.horarios_estrutura);
      } else {
        setDiasHorarios(DIAS_PADRAO);
      }
    }
  }, [tenantInfo]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    const textoGerado = gerarTextoHorario(diasHorarios);
    console.log("Iniciando save com variáveis:", { nomeIa, endereco, textoGerado, linkCardapio, instagram, googleMaps, youtube, tiktok });
    try {
      await updateTenantSettings({ 
        nome_ia: nomeIa,
        endereco: endereco,
        horario_funcionamento: textoGerado,
        horarios_estrutura: diasHorarios,
        link_cardapio: linkCardapio,
        instagram,
        google_maps: googleMaps,
        youtube,
        tiktok,
        cardapio_json_url: cardapioJsonUrl,
        cardapio_json_token: cardapioJsonToken,
        cardapio_json_payload: cardapioJsonPayload,
        cep_json_url: cepJsonUrl,
        cep_json_token: cepJsonToken,
        cep_json_payload: cepJsonPayload,
        cliente_json_url: clienteJsonUrl,
        cliente_json_token: clienteJsonToken,
        cliente_json_payload: clienteJsonPayload,
        pedido_json_url: pedidoJsonUrl,
        pedido_json_token: pedidoJsonToken,
        pedido_json_payload: pedidoJsonPayload
      });
      console.log("Save concluído!");
      setSuccess(true);
      
      // Limpa cache no backend para refletir alterações globais e de cardápio instantaneamente
      const apiBase = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || window.location.origin;
      const currentTenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (currentTenantId) {
        fetch(`${apiBase}/api/v1/utils/clear-cardapio-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: currentTenantId })
        }).catch(err => console.error('Erro ao invalidar cache do cardápio:', err));
      }

      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Erro ao salvar as configurações:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestRequest = async () => {
    setTestLoading(true);
    setTestResult(null);
    setTestError('');
    try {
      if (!cardapioJsonUrl) {
        throw new Error('A URL do endpoint é obrigatória para realizar o teste.');
      }

      if (cardapioJsonPayload) {
        try {
          JSON.parse(cardapioJsonPayload);
        } catch (e) {
          throw new Error('O corpo da requisição (JSON Payload) não é um JSON válido. Verifique chaves, aspas duplas e vírgulas.');
        }
      }

      const apiBase = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || window.location.origin;
      const res = await fetch(`${apiBase}/api/v1/utils/test-cardapio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: cardapioJsonUrl,
          token: cardapioJsonToken,
          payload: cardapioJsonPayload ? JSON.parse(cardapioJsonPayload) : null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Erro na requisição. Status: ${res.status}`);
      }

      const resData = await res.json();
      setTestResult(resData);

      if (resData && resData.data && Array.isArray(resData.data.grupos) && resData.data.grupos.length > 0) {
        setActiveGroupId(resData.data.grupos[0].id);
      } else {
        setActiveGroupId(null);
      }
    } catch (err: any) {
      setTestError(err.message || 'Ocorreu um erro desconhecido ao testar a requisição.');
    } finally {
      setTestLoading(false);
    }
  };

  const handleConsultSupabase = async () => {
    setTestLoading(true);
    setTestError('');
    try {
      const currentTenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!currentTenantId) {
        throw new Error('ID do Inquilino (tenant_id) não encontrado.');
      }
      
      // Busca dados atuais do Supabase para fazer uma checagem local se há dados
      const { data: dbGrupos, error: errG } = await supabase
        .from('cardapio_grupos')
        .select('id')
        .eq('tenant_id', currentTenantId)
        .limit(1);

      if (errG) throw errG;

      if (!dbGrupos || dbGrupos.length === 0) {
        throw new Error('Nenhum dado de cardápio encontrado no Supabase para este estabelecimento. Por favor, execute o "Mapear Cardápio" primeiro.');
      }

      // Carrega os dados mais recentes do Supabase no estado local
      await loadCardapioFromSupabase(currentTenantId);
      
      // Força a exibição da visualização do celular usando o modo Supabase
      setTestResult({
        status: 200,
        fromSupabase: true,
        data: {
          grupos: [],
          produtos: []
        }
      });
      setLoadSource('supabase');
      setActiveResultTab('preview');
      
    } catch (err: any) {
      setTestError(err.message || 'Erro ao consultar o Supabase.');
    } finally {
      setTestLoading(false);
    }
  };

  const handleProductClick = async (product: any) => {
    setSelectedProduct(product);
    setProductSteps(null);
    setLoadingSteps(true);
    setStepsError('');
    setDetailQty(1);

    if (loadSource === 'supabase') {
      try {
        const { data: dbPassos, error: errPassos } = await supabase
          .from('cardapio_passos')
          .select('*')
          .eq('produto_id', product.id)
          .order('ordem', { ascending: true });

        if (errPassos) throw errPassos;

        if (dbPassos && dbPassos.length > 0) {
          const passosMapeados = [];
          for (const passo of dbPassos) {
            const { data: dbOpcoes, error: errOpcoes } = await supabase
              .from('cardapio_opcoes')
              .select('*')
              .eq('passo_id', passo.id)
              .order('descricao', { ascending: true });

            if (errOpcoes) throw errOpcoes;

            passosMapeados.push({
              IdProdutoPassos: passo.id,
              Pergunta: passo.pergunta || passo.sub_titulo || 'Opções',
              SubTitulo: passo.sub_titulo,
              QtdMin: passo.qtd_min,
              QtdMax: passo.qtd_max,
              Ativo: passo.ativo,
              ListaProdutos: (dbOpcoes || []).map(opt => ({
                IdProduto: opt.id,
                Descricao: opt.descricao,
                Imagem: opt.imagem,
                Ativo: opt.ativo,
                ListaPreco: [{ Preco: Number(opt.preco) }]
              }))
            });
          }

          setProductSteps({ passos: passosMapeados });
        } else {
          setProductSteps({ passos: [] });
        }
      } catch (err: any) {
        console.error('Erro ao buscar passos do Supabase:', err);
        setStepsError(err.message || 'Erro ao carregar os adicionais do banco.');
      } finally {
        setLoadingSteps(false);
      }
      return;
    }

    try {
      if (!cardapioJsonUrl) {
        throw new Error('A URL do endpoint é necessária.');
      }

      let stepsUrl = cardapioJsonUrl;
      if (stepsUrl.includes('/ProdutoPdvService/GetCardapioCompleto')) {
        stepsUrl = stepsUrl.replace('/ProdutoPdvService/GetCardapioCompleto', '/ProdutoCardapioService/ProdutoComPassos');
      } else {
        try {
          const urlObj = new URL(stepsUrl);
          urlObj.pathname = '/v6/server/nuvem/ProdutoCardapioService/ProdutoComPassos';
          stepsUrl = urlObj.toString();
        } catch (e) {
          stepsUrl = stepsUrl.replace(/\/v6\/server\/nuvem\/.*$/, '/v6/server/nuvem/ProdutoCardapioService/ProdutoComPassos');
        }
      }

      const apiBase = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || window.location.origin;
      const res = await fetch(`${apiBase}/api/v1/utils/test-cardapio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: stepsUrl,
          token: cardapioJsonToken,
          payload: {
            AIdProduto: product.id
          }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Erro. Status: ${res.status}`);
      }

      const resData = await res.json();
      if (resData.status === 200 && resData.data) {
        const rawPassos = resData.data.passos || resData.data.Passos || [];
        const passos = Array.isArray(rawPassos) ? rawPassos : [];

        const passosMapeados = passos.map((p: any) => {
          const idPasso = p.IdProdutoPassos || p.id || p.Id;
          const pergunta = p.Pergunta || p.pergunta || p.SubTitulo || p.subTitulo || 'Opções';
          const subTitulo = p.SubTitulo || p.subTitulo || '';
          const qtdMin = p.QtdMin !== undefined ? p.QtdMin : (p.qtdMin !== undefined ? p.qtdMin : 0);
          const qtdMax = p.QtdMax !== undefined ? p.QtdMax : (p.qtdMax !== undefined ? p.qtdMax : 1);
          const ativo = p.Ativo !== false && p.ativo !== false;

          const rawLista = p.ListaProdutos || p.listaProdutos || p.produtos || p.Produtos || [];
          const listaProdutos = Array.isArray(rawLista) ? rawLista : [];

          return {
            IdProdutoPassos: idPasso,
            Pergunta: pergunta,
            SubTitulo: subTitulo,
            QtdMin: qtdMin,
            QtdMax: qtdMax,
            Ativo: ativo,
            ListaProdutos: listaProdutos.map((opt: any) => {
              const precoList = opt.ListaPreco || opt.listaPreco || [];
              const precoAdicional = precoList?.[0]?.Preco !== undefined 
                ? precoList[0].Preco 
                : (precoList?.[0]?.preco !== undefined 
                  ? precoList[0].preco 
                  : (opt.Preco !== undefined 
                    ? opt.Preco 
                    : (opt.preco !== undefined ? opt.preco : 0)));

              return {
                IdProduto: opt.IdProduto || opt.id || opt.Id,
                Descricao: opt.Descricao || opt.descricao || 'Opção',
                Imagem: opt.Imagem || opt.imagem || opt.image || '',
                Ativo: opt.Ativo !== false && opt.ativo !== false,
                ListaPreco: [{ Preco: Number(precoAdicional) }]
              };
            })
          };
        });

        setProductSteps({ passos: passosMapeados });
      } else {
        throw new Error(resData.data?.error || `Erro retornado pelo servidor: Status ${resData.status}`);
      }
    } catch (err: any) {
      console.error('Erro ao buscar passos do produto:', err);
      setStepsError(err.message || 'Erro ao carregar os adicionais.');
    } finally {
      setLoadingSteps(false);
    }
  };

  const handleToggleDia = (index: number) => {
    setDiasHorarios(prev => prev.map((item, idx) => 
      idx === index ? { ...item, aberto: !item.aberto } : item
    ));
  };

  const handleAddPeriodo = (diaIndex: number) => {
    setDiasHorarios(prev => prev.map((item, idx) => {
      if (idx === diaIndex) {
        return {
          ...item,
          periodos: [...item.periodos, { inicio: '18:00', fim: '23:00' }]
        };
      }
      return item;
    }));
  };

  const handleRemovePeriodo = (diaIndex: number, periodoIndex: number) => {
    setDiasHorarios(prev => prev.map((item, idx) => {
      if (idx === diaIndex) {
        return {
          ...item,
          periodos: item.periodos.filter((_, pIdx) => pIdx !== periodoIndex)
        };
      }
      return item;
    }));
  };

  const handleChangePeriodo = (diaIndex: number, periodoIndex: number, campo: 'inicio' | 'fim', valor: string) => {
    setDiasHorarios(prev => prev.map((item, idx) => {
      if (idx === diaIndex) {
        const novosPeriodos = item.periodos.map((p, pIdx) => 
          pIdx === periodoIndex ? { ...p, [campo]: valor } : p
        );
        return { ...item, periodos: novosPeriodos };
      }
      return item;
    }));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden">
      
      {/* Header Premium */}
      <div className="h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex items-center justify-between px-8 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Briefcase size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              Conta
            </h1>
            <p className="text-sm text-gray-500 dark:text-[#aebac1]">
              Gerencie as configurações e variáveis globais da sua empresa.
            </p>
          </div>
        </div>

        <div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} className={cn(saving && "animate-pulse")} />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-4 py-3 rounded-xl animate-in slide-in-from-top-2 duration-300">
              Configurações salvas com sucesso!
            </div>
          )}

          {/* Seção Variáveis Globais da Empresa */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden p-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <Settings2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Variáveis Globais da Empresa (Luna IA)</h2>
                <p className="text-sm text-gray-500 dark:text-[#aebac1]">Configure os dados da sua empresa que serão inseridos de forma dinâmica nos prompts da Luna.</p>
              </div>
            </div>

            <div className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <Store size={16} className="text-gray-400" />
                    Nome da Empresa / Nome da IA
                  </label>
                  <input 
                    type="text"
                    value={nomeIa}
                    onChange={(e) => setNomeIa(e.target.value)}
                    placeholder="Ex: Pizzaria Bella Italia ou Luna"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[NOME_DA_EMPRESA]</code>.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <LinkIcon size={16} className="text-gray-400" />
                    Link do Cardápio Digital
                  </label>
                  <input 
                    type="url"
                    value={linkCardapio}
                    onChange={(e) => setLinkCardapio(e.target.value)}
                    placeholder="https://seu-cardapio.com.br"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_CARDAPIO]</code>.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                  <MapPin size={16} className="text-gray-400" />
                  Endereço da Unidade
                </label>
                <input 
                  type="text"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Ex: Av. Paulista, 1000 - Bela Vista, São Paulo - SP"
                  className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                  Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[ENDERECO_DA_EMPRESA]</code>.
                </p>
              </div>

              {/* Redes Sociais e Mapas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100 dark:border-[#222d34]/60">
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <Camera size={16} className="text-pink-500" />
                    Link do Instagram
                  </label>
                  <input 
                    type="url"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="https://instagram.com/sua-empresa"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_INSTAGRAM]</code>.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <MapPin size={16} className="text-emerald-500" />
                    Link do Google Maps
                  </label>
                  <input 
                    type="url"
                    value={googleMaps}
                    onChange={(e) => setGoogleMaps(e.target.value)}
                    placeholder="https://maps.google.com/?q=sua-empresa"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_GOOGLE_MAPS]</code>.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <Video size={16} className="text-red-500" />
                    Link do YouTube
                  </label>
                  <input 
                    type="url"
                    value={youtube}
                    onChange={(e) => setYoutube(e.target.value)}
                    placeholder="https://youtube.com/c/sua-empresa"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_YOUTUBE]</code>.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                    <LinkIcon size={16} className="text-purple-400" />
                    Link do TikTok
                  </label>
                  <input 
                    type="url"
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    placeholder="https://tiktok.com/@sua-empresa"
                    className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400"
                  />
                  <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-2">
                    Será substituído no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[LINK_TIKTOK]</code>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Seção Horário de Funcionamento (Configurador Semanal) - Agora colapsável */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <button
              type="button"
              onClick={() => setIsHorariosExpanded(!isHorariosExpanded)}
              className="w-full flex items-center justify-between p-8 text-left outline-none hover:bg-gray-50/50 dark:hover:bg-black/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Horário de Funcionamento (Configurador Semanal)</h2>
                  <p className="text-sm text-gray-500 dark:text-[#aebac1]">Configure o cronograma semanal de funcionamento da sua empresa.</p>
                </div>
              </div>
              <div className="text-gray-400 dark:text-gray-500 pr-2">
                {isHorariosExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>

            {isHorariosExpanded && (
              <div className="px-8 pb-8 pt-2 border-t border-gray-100 dark:border-[#222d34]/60 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-4 bg-[#f8f9fa] dark:bg-[#182229] border border-gray-200/50 dark:border-[#222d34] rounded-2xl p-6 shadow-inner">
                  {diasHorarios.map((d, dIdx) => (
                    <div key={d.dia} className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-3 border-b border-gray-100 dark:border-[#222d34]/60 last:border-b-0">
                      {/* Nome do dia e Toggle */}
                      <div className="flex items-center justify-between md:justify-start gap-4 min-w-[200px]">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200 w-28">{d.dia}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleDia(dIdx)}
                            className={cn(
                              "w-11 h-6 rounded-full relative transition-colors duration-200 outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner",
                              d.aberto ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"
                            )}
                          >
                            <span 
                              className={cn(
                                "w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform duration-200 shadow-sm",
                                d.aberto ? "translate-x-5" : "translate-x-0"
                              )}
                            />
                          </button>
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-wider select-none w-14",
                            d.aberto ? "text-emerald-500" : "text-gray-500 dark:text-gray-400"
                          )}>
                            {d.aberto ? 'ABERTO' : 'FECHADO'}
                          </span>
                        </div>
                      </div>

                      {/* Períodos de funcionamento */}
                      {d.aberto ? (
                        <div className="flex-1 flex flex-col gap-2.5">
                          {d.periodos.map((p, pIdx) => (
                            <div key={pIdx} className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                              <div className="flex items-center bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-3 py-1.5 shadow-sm">
                                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mr-2">Início</span>
                                <input
                                  type="time"
                                  value={p.inicio}
                                  onChange={(e) => handleChangePeriodo(dIdx, pIdx, 'inicio', e.target.value)}
                                  className="bg-transparent border-none text-xs text-gray-800 dark:text-gray-100 outline-none w-16"
                                />
                              </div>
                              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 px-1">às</span>
                              <div className="flex items-center bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-3 py-1.5 shadow-sm">
                                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mr-2">Fim</span>
                                <input
                                  type="time"
                                  value={p.fim}
                                  onChange={(e) => handleChangePeriodo(dIdx, pIdx, 'fim', e.target.value)}
                                  className="bg-transparent border-none text-xs text-gray-800 dark:text-gray-100 outline-none w-16"
                                />
                              </div>

                              {d.periodos.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemovePeriodo(dIdx, pIdx)}
                                  className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                  title="Remover período"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          
                          <button
                            type="button"
                            onClick={() => handleAddPeriodo(dIdx)}
                            className="flex items-center gap-1 text-[11px] font-bold text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 w-fit mt-1 px-2 py-1 rounded bg-indigo-500/5 hover:bg-indigo-500/10 transition-all border border-indigo-500/10"
                          >
                            <Plus size={12} />
                            Adicionar Turno
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center h-9 text-xs font-semibold text-gray-400 dark:text-gray-500">
                          Luna responderá que a empresa está fechada neste dia.
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-3 leading-relaxed">
                  Os horários configurados serão consolidados automaticamente em texto legível para a inteligência artificial substituir no token <code className="bg-gray-200 dark:bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-indigo-500 dark:text-indigo-300">[HORARIO_FUNCIONAMENTO]</code>.
                </p>
              </div>
            )}
          </div>

          {/* Seção Cardápio JSON Online (Integração de Produtos) - Agora colapsável */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <button
              type="button"
              onClick={() => setIsCardapioExpanded(!isCardapioExpanded)}
              className="w-full flex items-center justify-between p-8 text-left outline-none hover:bg-gray-50/50 dark:hover:bg-black/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <LinkIcon size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Cardápio JSON Online</h2>
                  <p className="text-sm text-gray-500 dark:text-[#aebac1]">Configure a busca e consulta de produtos diretamente via API JSON.</p>
                </div>
              </div>
              <div className="text-gray-400 dark:text-gray-500 pr-2">
                {isCardapioExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>

            {isCardapioExpanded && (
              <div className="px-8 pb-8 pt-2 border-t border-gray-100 dark:border-[#222d34]/60 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-6 max-w-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                        Token de Autorização (Bearer)
                      </label>
                      <input 
                        type="text"
                        value={cardapioJsonToken}
                        onChange={(e) => setCardapioJsonToken(e.target.value)}
                        placeholder="Bearer eyJ0eXAi..."
                        className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                        Corpo da Requisição (JSON Payload)
                      </label>
                      <textarea 
                        value={cardapioJsonPayload}
                        onChange={(e) => setCardapioJsonPayload(e.target.value)}
                        placeholder='{"AGuidEstab": "6D0187D9-E905-4479-AB15-B908F0222607"}'
                        rows={3}
                        className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={handleTestRequest}
                      disabled={testLoading || isMapping || !cardapioJsonUrl}
                      className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testLoading && !testResult?.fromSupabase ? 'Testando...' : 'Testar Requisição'}
                    </button>
                    <button
                      type="button"
                      onClick={handleConsultSupabase}
                      disabled={testLoading || isMapping}
                      className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testLoading && testResult?.fromSupabase ? 'Consultando...' : 'Consultar Supabase'}
                    </button>
                    <button
                      type="button"
                      onClick={isMapping ? () => { cancelMappingRef.current = true; } : handleMapCardapio}
                      disabled={testLoading || !cardapioJsonUrl}
                      className={cn(
                        "px-6 py-2.5 font-semibold rounded-xl shadow-lg flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                        isMapping
                          ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20 animate-pulse"
                          : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-emerald-500/20"
                      )}
                    >
                      {isMapping ? 'Cancelar Mapeamento' : 'Mapear Cardápio'}
                    </button>
                  </div>

                  {/* Painel de Logs e Progresso do Mapeamento */}
                  {(isMapping || mappingLogs.length > 0) && (
                    <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl space-y-4 border border-slate-800 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold font-mono tracking-wider text-emerald-400">STATUS DO MAPEAMENTO</span>
                        </div>
                        {estTimeRemaining !== null && estTimeRemaining > 0 && (
                          <span className="text-[11px] font-semibold text-slate-400 font-mono">
                            Tempo restante estimado: {Math.floor(estTimeRemaining / 60)}m {estTimeRemaining % 60}s
                          </span>
                        )}
                      </div>

                      {/* Barra de Progresso */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold font-mono">
                          <span>Progresso Geral</span>
                          <span className="text-emerald-400">{mappingProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-emerald-400 to-teal-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${mappingProgress}%` }}
                          />
                        </div>
                      </div>

                      {/* Terminal de Logs */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-mono">Terminal Logs</span>
                        <div className="bg-black/40 border border-slate-800/80 rounded-xl p-4 max-h-48 overflow-y-auto font-mono text-[11px] space-y-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                          {mappingLogs.map((log, idx) => (
                            <div key={idx} className={cn(
                              "leading-relaxed whitespace-pre-wrap text-left",
                              log.includes('❌') ? "text-rose-400" : log.includes('🎉') || log.includes('sucesso') || log.includes('concluído') ? "text-emerald-400" : "text-slate-300"
                            )}>
                              {log}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {testError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl text-sm animate-in fade-in duration-300 font-mono whitespace-pre-wrap">
                      <strong>Erro no teste:</strong> {testError}
                    </div>
                  )}

                  {testResult && (
                    <div className="bg-slate-50 dark:bg-[#182229] border border-slate-200 dark:border-[#222d34] p-6 rounded-2xl space-y-4 animate-in fade-in duration-300">
                      
                      {/* Cabeçalho de Status e Abas */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#222d34]/60">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                            {testResult.fromSupabase ? 'Consulta Banco de Dados:' : 'Resultado do Teste:'}
                          </span>
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                            testResult.status === 200 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                          )}>
                            {testResult.fromSupabase ? 'Supabase (Gravado)' : `Status: ${testResult.status}`}
                          </span>
                        </div>

                        <div className="flex items-center bg-gray-200/50 dark:bg-black/20 p-1 rounded-xl w-fit font-sans">
                          <button
                            type="button"
                            onClick={() => setActiveResultTab('preview')}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                              activeResultTab === 'preview'
                                ? "bg-white dark:bg-[#2a3942] text-gray-800 dark:text-gray-100 shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            )}
                          >
                            Visualização do Cardápio
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveResultTab('json')}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                              activeResultTab === 'json'
                                ? "bg-white dark:bg-[#2a3942] text-gray-800 dark:text-gray-100 shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            )}
                          >
                            JSON Bruto
                          </button>
                        </div>
                      </div>

                      {/* Aba de Visualização do Cardápio */}
                      {activeResultTab === 'preview' && (() => {
                        const cardapioExibido = loadSource === 'supabase' && supabaseData
                          ? supabaseData
                          : testResult?.data;
                        const hasData = cardapioExibido && Array.isArray(cardapioExibido.grupos) && Array.isArray(cardapioExibido.produtos);

                        return (
                          <div className="flex flex-col items-center gap-4 py-4 bg-slate-100/50 dark:bg-black/30 rounded-2xl w-full">
                            {/* Seletor de Origem (caso existam dados no Supabase) */}
                            {supabaseData && (
                              <div className="flex items-center bg-gray-200/50 dark:bg-black/20 p-1 rounded-xl w-fit font-sans shadow-sm">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLoadSource('api');
                                    if (testResult?.data?.grupos?.length > 0) {
                                      setActiveGroupId(testResult.data.grupos[0].id);
                                    }
                                  }}
                                  className={cn(
                                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                    loadSource === 'api'
                                      ? "bg-indigo-500 text-white shadow-sm"
                                      : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                  )}
                                >
                                  API Gastrofood (Bruto)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLoadSource('supabase');
                                    if (supabaseData?.grupos?.length > 0) {
                                      setActiveGroupId(supabaseData.grupos[0].id);
                                    }
                                  }}
                                  className={cn(
                                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                    loadSource === 'supabase'
                                      ? "bg-emerald-500 text-white shadow-sm"
                                      : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                  )}
                                >
                                  Supabase (Banco de Dados)
                                </button>
                              </div>
                            )}

                            {hasData ? (
                              <div className="w-[390px] h-[740px] bg-white text-gray-800 rounded-[36px] border-[8px] border-slate-800 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col relative font-sans">
                              {/* Barra de Status */}
                              <div className="h-6 bg-white flex justify-between items-center px-6 pt-1 text-[10px] font-bold text-gray-500 z-10 select-none flex-shrink-0">
                                <span>12:00</span>
                                <div className="flex items-center gap-1">
                                  <Signal size={10} />
                                  <Wifi size={10} />
                                  <Battery size={10} className="rotate-90" />
                                </div>
                              </div>

                              {selectedProduct ? (
                                /* Tela de Detalhes do Produto */
                                <div className="flex-grow flex flex-col overflow-hidden bg-slate-50 relative">
                                  {/* Botão de Voltar Flutuante */}
                                  <div className="absolute top-8 left-4 z-20">
                                    <button 
                                      type="button"
                                      onClick={() => setSelectedProduct(null)}
                                      className="w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-sm hover:bg-black/60 transition-colors shadow-md"
                                    >
                                      <ChevronLeft size={20} />
                                    </button>
                                  </div>

                                  {/* Imagem do Produto no Topo */}
                                  {selectedProduct.image ? (
                                    <div className="h-44 w-full bg-gray-100 flex-shrink-0 relative">
                                      <img 
                                        src={selectedProduct.image.split('|')[0]} 
                                        alt={selectedProduct.name} 
                                        className="w-full h-full object-cover"
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                    </div>
                                  ) : (
                                    <div className="h-28 w-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-400 border-b border-gray-200 flex-shrink-0">
                                      <Utensils size={32} />
                                    </div>
                                  )}

                                  {/* Informações Básicas do Produto */}
                                  <div className="bg-white p-4 space-y-1.5 border-b border-gray-100 flex-shrink-0 text-left">
                                    <h4 className="text-base font-extrabold text-gray-900 uppercase tracking-tight">
                                      {selectedProduct.name}
                                    </h4>
                                    {selectedProduct.description && (
                                      <p className="text-xs text-gray-500 leading-relaxed">
                                        {selectedProduct.description}
                                      </p>
                                    )}
                                    <span className="text-base font-black text-gray-950 block">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedProduct.price)}
                                    </span>
                                  </div>

                                  {/* Listagem de Passos / Adicionais */}
                                  <div className="flex-1 overflow-y-auto pb-4 space-y-4">
                                    {loadingSteps ? (
                                      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
                                        <div className="w-8 h-8 rounded-full border-4 border-indigo-500/20 border-t-indigo-600 animate-spin" />
                                        <span className="text-[11px] font-bold">Carregando adicionais...</span>
                                      </div>
                                    ) : stepsError ? (
                                      <div className="p-6 text-center text-xs text-rose-500 font-bold bg-white rounded-2xl mx-4 mt-4 shadow-sm border border-rose-100">
                                        {stepsError}
                                      </div>
                                    ) : productSteps && Array.isArray(productSteps.passos) && productSteps.passos.length > 0 ? (
                                      productSteps.passos.map((passo: any) => {
                                        const perguntaExibir = passo.Pergunta || passo.pergunta || passo.SubTitulo || passo.sub_titulo || 'Opções';
                                        const subTituloExibir = passo.SubTitulo || passo.sub_titulo || '';
                                        const isObrigatorio = (passo.QtdMin !== undefined ? passo.QtdMin : (passo.qtd_min !== undefined ? passo.qtd_min : 0)) > 0;
                                        const isSingle = (passo.QtdMax !== undefined ? passo.QtdMax : (passo.qtd_max !== undefined ? passo.qtd_max : 1)) === 1;

                                        return (
                                          <div key={passo.IdProdutoPassos || passo.id} className="space-y-1">
                                            {/* Cabeçalho do Passo */}
                                            <div className="bg-slate-100 dark:bg-slate-200/50 px-4 py-2 text-left flex flex-col gap-0.5">
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-black text-gray-700 tracking-tight">
                                                  {perguntaExibir}
                                                </span>
                                                {isObrigatorio && (
                                                  <span className="text-[8px] bg-red-500 text-white font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">
                                                    Obrigatório
                                                  </span>
                                                )}
                                              </div>
                                              {subTituloExibir && subTituloExibir !== perguntaExibir && (
                                                <span className="text-[9px] text-gray-400 font-bold leading-none">
                                                  {subTituloExibir}
                                                </span>
                                              )}
                                            </div>

                                            {/* Opções do Passo */}
                                            <div className="bg-white divide-y divide-gray-100">
                                              {Array.isArray(passo.ListaProdutos) && passo.ListaProdutos.map((opt: any) => {
                                                const precoList = opt.ListaPreco || opt.listaPreco || [];
                                                const precoAdicional = precoList?.[0]?.Preco !== undefined 
                                                  ? precoList[0].Preco 
                                                  : (precoList?.[0]?.preco !== undefined 
                                                    ? precoList[0].preco 
                                                    : (opt.preco !== undefined ? opt.preco : 0));
                                                const imageUrl = opt.Imagem ? opt.Imagem.split('|')[0] : (opt.imagem ? opt.imagem.split('|')[0] : '');

                                                return (
                                                  <div 
                                                    key={opt.IdProduto || opt.id}
                                                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
                                                  >
                                                    <div className="flex items-center flex-1 min-w-0">
                                                      {imageUrl && (
                                                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 mr-3 flex-shrink-0">
                                                          <img src={imageUrl} alt={opt.Descricao || opt.descricao} className="w-full h-full object-cover" />
                                                        </div>
                                                      )}
                                                      <span className="text-xs font-semibold text-gray-800 truncate">
                                                        {opt.Descricao || opt.descricao}
                                                      </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                      {precoAdicional > 0 && (
                                                        <span className="text-[11px] font-extrabold text-emerald-600">
                                                          +{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(precoAdicional)}
                                                        </span>
                                                      )}
                                                      {isSingle ? (
                                                        <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0">
                                                          <div className="w-2 h-2 rounded-full bg-red-600 opacity-0 hover:opacity-100 transition-opacity" />
                                                        </div>
                                                      ) : (
                                                        <div className="w-4 h-4 rounded border-2 border-gray-300 flex items-center justify-center flex-shrink-0 text-red-600 font-black text-[10px]">
                                                          +
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="p-8 text-center text-xs text-gray-400 font-medium">
                                        Nenhum opcional cadastrado para este produto.
                                      </div>
                                    )}
                                  </div>

                                  {/* Rodapé de Ação Detalhada */}
                                  <div className="h-16 bg-white border-t border-gray-100 px-4 flex items-center justify-between gap-4 flex-shrink-0">
                                    <div className="flex items-center bg-gray-100 rounded-xl px-2 py-1 gap-3">
                                      <button 
                                        type="button" 
                                        onClick={() => detailQty > 1 && setDetailQty(detailQty - 1)}
                                        className="w-7 h-7 rounded-lg hover:bg-white text-gray-600 flex items-center justify-center transition-all"
                                      >
                                        <Minus size={14} />
                                      </button>
                                      <span className="text-xs font-black text-gray-800 w-4 text-center">{detailQty}</span>
                                      <button 
                                        type="button" 
                                        onClick={() => setDetailQty(detailQty + 1)}
                                        className="w-7 h-7 rounded-lg hover:bg-white text-gray-600 flex items-center justify-center transition-all"
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>

                                    <button 
                                      type="button" 
                                      onClick={() => setSelectedProduct(null)}
                                      className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 uppercase tracking-wide"
                                    >
                                      Adicionar
                                      <span>•</span>
                                      <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedProduct.price * detailQty)}</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* Listagem Principal do Cardápio */
                                <>
                                  {/* Cabeçalho do Cardápio Fiel ao Layout da Loja */}
                                  <div className="bg-white px-4 pt-2 pb-4 text-center border-b border-gray-100 flex-shrink-0 flex flex-col items-center">
                                    <div className="flex items-center gap-4 justify-center mb-1 text-emerald-600">
                                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">W</div>
                                      <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-yellow-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">I</div>
                                    </div>
                                    <h3 className="text-base font-black text-gray-900 tracking-tight uppercase">
                                      {nomeIa || 'BURGUER PLUS'}
                                    </h3>
                                    <span className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5 justify-center">
                                      <MapPin size={10} />
                                      {endereco ? (endereco.split('-')[0].trim()) : 'Taboão da Serra - SP'}
                                    </span>
                                    <span className="mt-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase tracking-wider">
                                      LOJA ABERTA
                                    </span>
                                  </div>

                                  {/* Categorias (Navegação Horizontal) */}
                                  <div className="flex items-center gap-5 overflow-x-auto px-4 pb-2 pt-3 border-b border-gray-100 scrollbar-none flex-shrink-0 bg-white">
                                    {cardapioExibido.grupos.map((g: any) => {
                                      const isActive = activeGroupId === g.id;
                                      return (
                                        <button
                                          key={g.id}
                                          type="button"
                                          onClick={() => setActiveGroupId(g.id)}
                                          className={cn(
                                            "pb-1.5 text-xs font-black tracking-wider uppercase whitespace-nowrap transition-all border-b-2 relative",
                                            isActive 
                                              ? "border-red-600 text-red-600 font-extrabold"
                                              : "border-transparent text-gray-400 hover:text-gray-600"
                                          )}
                                        >
                                          {g.description}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Lista de Produtos do Grupo */}
                                  <div className="flex-1 overflow-y-auto px-4 divide-y divide-gray-100 bg-white">
                                    {(() => {
                                      const filtered = (cardapioExibido.produtos || []).filter((p: any) => p.groupId === activeGroupId);
                                      if (filtered.length === 0) {
                                        return (
                                          <div className="text-center py-12 text-xs text-gray-400">
                                            Nenhum produto cadastrado neste grupo.
                                          </div>
                                        );
                                      }
                                      return filtered.map((p: any) => {
                                        const imageUrl = p.image ? p.image.split('|')[0] : '';
                                        const hasPromo = p.name.toLowerCase().includes('costela') || p.name.toLowerCase().includes('combo');
                                        const originalPrice = p.price * 1.35;

                                        return (
                                          <div 
                                            key={p.id} 
                                            onClick={() => handleProductClick(p)}
                                            className="flex items-start justify-between gap-4 py-4 cursor-pointer hover:bg-slate-50 transition-all rounded-lg px-1"
                                          >
                                            <div className="flex-1 space-y-1 text-left">
                                              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-tight">
                                                {p.name}
                                              </h4>
                                              {p.description && (
                                                <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
                                                  {p.description}
                                                </p>
                                              )}
                                              <div className="pt-1.5 flex flex-col gap-0.5">
                                                {hasPromo ? (
                                                  <div className="text-xs text-gray-400 flex items-center gap-1">
                                                    <span>De</span>
                                                    <span className="line-through">
                                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(originalPrice)}
                                                    </span>
                                                    <span>por</span>
                                                    <span className="text-sm font-extrabold text-emerald-600">
                                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}
                                                    </span>
                                                  </div>
                                                ) : (
                                                  <span className="text-sm font-extrabold text-gray-900">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}
                                                  </span>
                                                )}
                                                {p.active === false && (
                                                  <span className="w-fit bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider mt-1">
                                                    Pausado
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            
                                            {/* Imagem */}
                                            {imageUrl ? (
                                              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 flex-shrink-0 flex items-center justify-center shadow-sm">
                                                <img 
                                                  src={imageUrl} 
                                                  alt={p.name} 
                                                  className="w-full h-full object-cover"
                                                  onError={(e) => {
                                                    (e.target as HTMLElement).style.display = 'none';
                                                  }}
                                                />
                                              </div>
                                            ) : (
                                              <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0 border border-gray-200/50">
                                                <Utensils size={18} />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>

                                  {/* Barra de Navegação Inferior Mockada */}
                                  <div className="h-14 bg-white border-t border-gray-100 flex items-center justify-around text-gray-400 px-2 flex-shrink-0">
                                    <button type="button" className="flex flex-col items-center justify-center gap-0.5 text-red-600">
                                      <Home size={18} />
                                      <span className="text-[9px] font-bold">Início</span>
                                    </button>
                                    <button type="button" className="flex flex-col items-center justify-center gap-0.5 hover:text-gray-600">
                                      <Search size={18} />
                                      <span className="text-[9px] font-bold">Buscar</span>
                                    </button>
                                    <button type="button" className="flex flex-col items-center justify-center gap-0.5 hover:text-gray-600">
                                      <ClipboardList size={18} />
                                      <span className="text-[9px] font-bold">Pedidos</span>
                                    </button>
                                    <button type="button" className="flex flex-col items-center justify-center gap-0.5 hover:text-gray-600">
                                      <User size={18} />
                                      <span className="text-[9px] font-bold">Perfil</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-xs text-amber-500 font-mono">
                              A estrutura do JSON retornado não possui "grupos" e "produtos" válidos para visualização.
                            </div>
                          )}
                          </div>
                        );
                      })()}

                      {/* Aba de JSON Bruto */}
                      {activeResultTab === 'json' && (
                        <div className="max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-xs font-mono text-gray-700 dark:text-[#d1d7db] bg-slate-100/50 dark:bg-black/30 p-4 rounded-xl border border-slate-200/50 dark:border-[#304046]/30 animate-in fade-in duration-250">
                          {JSON.stringify(
                            loadSource === 'supabase' && supabaseData ? supabaseData : testResult.data, 
                            null, 
                            2
                          )}
                        </div>
                      )}

                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Seção Consulta de CEP - Colapsável */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <button
              type="button"
              onClick={() => setIsCepExpanded(!isCepExpanded)}
              className="w-full flex items-center justify-between p-8 text-left outline-none hover:bg-gray-50/50 dark:hover:bg-black/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <MapPin size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Consulta de CEP</h2>
                  <p className="text-sm text-gray-500 dark:text-[#aebac1]">Configure a consulta de CEP e busca de endereços no Gastrofood.</p>
                </div>
              </div>
              <div className="text-gray-400 dark:text-gray-500 pr-2">
                {isCepExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>

            {isCepExpanded && (
              <div className="px-8 pb-8 pt-2 border-t border-gray-100 dark:border-[#222d34]/60 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-6 max-w-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                        Token de Autorização (Bearer)
                      </label>
                      <input 
                        type="text"
                        value={cepJsonToken}
                        onChange={(e) => setCepJsonToken(e.target.value)}
                        placeholder="Bearer eyJ0eXAi..."
                        className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                        Corpo da Requisição (JSON Payload)
                      </label>
                      <textarea 
                        value={cepJsonPayload}
                        onChange={(e) => setCepJsonPayload(e.target.value)}
                        placeholder='{"ACep": "06764365"}'
                        rows={3}
                        className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleTestGeneric(cepJsonUrl, cepJsonToken, cepJsonPayload, setCepLoading, setCepResult, setCepError)}
                      disabled={cepLoading || !cepJsonUrl}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {cepLoading ? 'Testando...' : 'Testar Requisição'}
                    </button>
                  </div>

                  {cepError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl text-sm animate-in fade-in duration-300 font-mono whitespace-pre-wrap">
                      <strong>Erro no teste:</strong> {cepError}
                    </div>
                  )}

                  {cepResult && (
                    <div className="bg-slate-50 dark:bg-[#182229] border border-slate-200 dark:border-[#222d34] p-6 rounded-2xl space-y-4 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#222d34]/60">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Resultado da Consulta:</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500">
                          Status: {cepResult.status}
                        </span>
                      </div>
                      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-xs font-mono text-gray-700 dark:text-[#d1d7db] bg-slate-100/50 dark:bg-black/30 p-4 rounded-xl border border-slate-200/50 dark:border-[#304046]/30">
                        {JSON.stringify(cepResult.data, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Seção Consulta de Cliente - Colapsável */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <button
              type="button"
              onClick={() => setIsClienteExpanded(!isClienteExpanded)}
              className="w-full flex items-center justify-between p-8 text-left outline-none hover:bg-gray-50/50 dark:hover:bg-black/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <User size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Consulta de Cliente</h2>
                  <p className="text-sm text-gray-500 dark:text-[#aebac1]">Valide se o cliente possui cadastro no Gastrofood via telefone.</p>
                </div>
              </div>
              <div className="text-gray-400 dark:text-gray-500 pr-2">
                {isClienteExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>

            {isClienteExpanded && (
              <div className="px-8 pb-8 pt-2 border-t border-gray-100 dark:border-[#222d34]/60 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-6 max-w-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                        Token de Autorização (Bearer)
                      </label>
                      <input 
                        type="text"
                        value={clienteJsonToken}
                        onChange={(e) => setClienteJsonToken(e.target.value)}
                        placeholder="Bearer eyJ0eXAi..."
                        className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                        Corpo da Requisição (JSON Payload)
                      </label>
                      <textarea 
                        value={clienteJsonPayload}
                        onChange={(e) => setClienteJsonPayload(e.target.value)}
                        placeholder='{"ATelefone": "973933247"}'
                        rows={3}
                        className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleTestGeneric(clienteJsonUrl, clienteJsonToken, clienteJsonPayload, setClienteLoading, setClienteResult, setClienteError)}
                      disabled={clienteLoading || !clienteJsonUrl}
                      className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {clienteLoading ? 'Testando...' : 'Testar Requisição'}
                    </button>
                  </div>

                  {clienteError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl text-sm animate-in fade-in duration-300 font-mono whitespace-pre-wrap">
                      <strong>Erro no teste:</strong> {clienteError}
                    </div>
                  )}

                  {clienteResult && (
                    <div className="bg-slate-50 dark:bg-[#182229] border border-slate-200 dark:border-[#222d34] p-6 rounded-2xl space-y-4 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#222d34]/60">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Resultado da Consulta:</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-500">
                          Status: {clienteResult.status}
                        </span>
                      </div>
                      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-xs font-mono text-gray-700 dark:text-[#d1d7db] bg-slate-100/50 dark:bg-black/30 p-4 rounded-xl border border-slate-200/50 dark:border-[#304046]/30">
                        {JSON.stringify(clienteResult.data, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Seção Envio de Pedido - Colapsável */}
          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-gray-100 dark:border-[#222d34] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <button
              type="button"
              onClick={() => setIsPedidoExpanded(!isPedidoExpanded)}
              className="w-full flex items-center justify-between p-8 text-left outline-none hover:bg-gray-50/50 dark:hover:bg-black/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Envio de Pedido</h2>
                  <p className="text-sm text-gray-500 dark:text-[#aebac1]">Configure a finalização e integração de pedidos diretamente no Gastrofood.</p>
                </div>
              </div>
              <div className="text-gray-400 dark:text-gray-500 pr-2">
                {isPedidoExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>

            {isPedidoExpanded && (
              <div className="px-8 pb-8 pt-2 border-t border-gray-100 dark:border-[#222d34]/60 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-6 max-w-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                        Token de Autorização (Bearer)
                      </label>
                      <input 
                        type="text"
                        value={pedidoJsonToken}
                        onChange={(e) => setPedidoJsonToken(e.target.value)}
                        placeholder="Bearer eyJ0eXAi..."
                        className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                        Corpo da Requisição (JSON Payload)
                      </label>
                      <textarea 
                        value={pedidoJsonPayload}
                        onChange={(e) => setPedidoJsonPayload(e.target.value)}
                        placeholder="Corpo da Requisição (JSON)"
                        rows={10}
                        className="w-full bg-[#f0f2f5] dark:bg-[#2a3942] border border-gray-200 dark:border-[#304046] rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-[#d1d7db] outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-gray-400 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleTestGeneric(pedidoJsonUrl, pedidoJsonToken, pedidoJsonPayload, setPedidoLoading, setPedidoResult, setPedidoError)}
                      disabled={pedidoLoading || !pedidoJsonUrl}
                      className="px-6 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg shadow-rose-500/20 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pedidoLoading ? 'Testando...' : 'Testar Requisição'}
                    </button>
                  </div>

                  {pedidoError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl text-sm animate-in fade-in duration-300 font-mono whitespace-pre-wrap">
                      <strong>Erro no teste:</strong> {pedidoError}
                    </div>
                  )}

                  {pedidoResult && (
                    <div className="bg-slate-50 dark:bg-[#182229] border border-slate-200 dark:border-[#222d34] p-6 rounded-2xl space-y-4 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#222d34]/60">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Resultado do Envio:</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500">
                          Status: {pedidoResult.status}
                        </span>
                      </div>
                      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-xs font-mono text-gray-700 dark:text-[#d1d7db] bg-slate-100/50 dark:bg-black/30 p-4 rounded-xl border border-slate-200/50 dark:border-[#304046]/30">
                        {JSON.stringify(pedidoResult.data, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
 
        </div>
      </div>
    </div>
  );
}
