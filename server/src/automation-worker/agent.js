import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../supabase.js';
import { pipeline } from '@xenova/transformers';

// Helper if EmbeddingsPipeline is not exported easily:
class LocalEmbeddingsPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance() {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, { quantized: true });
    }
    return this.instance;
  }
}

// ==========================================
// CACHE EM MEMÓRIA & AUTO-HEALING DO CARDÁPIO
// ==========================================
const cardapioInMemoryCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

const GASTROFOOD_BASE_URL = 'https://service.xpointsolucoes.com.br:8443';
const CARDAPIO_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/server/nuvem/ProdutoPdvService/GetCardapioCompleto`;
const CEP_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/usuario_2.0/ConsultaCepService/Execute`;
const CLIENTE_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/usuario_2.0/LoginService/ValidaTelefone`;
const PEDIDO_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/server/nuvem/PedidoCardapioService/FinalizeOrder`;

const STATUS_PEDIDO_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/server/nuvem/BnPedido(50DA243C-4F4F-4293-95C8-34FFC00391D1)`;
const PAGAMENTO_PIX_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v1/pagamentos/PixCardapioService/IniciarTransacao`;
const CADASTRO_CLIENTE_DEFAULT_URL = `${GASTROFOOD_BASE_URL}/v6/usuario_2.0/UsuarioService/CreateUserWithAuthentication`;

const GASTROFOOD_DEFAULT_TOKEN = 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE1OTgyNzA4NTksImV4cCI6MTg5MzQxMzI1OX0.mhHkRKeJgvfHmKDe4cZFKLAJKUBVplIlB5GJVBMkjQw';

const DEFAULT_CARDAPIO_PAYLOAD = {};
const DEFAULT_CEP_PAYLOAD = { ACep: '06764365' };
const DEFAULT_CLIENTE_PAYLOAD = { ATelefone: '973933247' };

const DEFAULT_PAGAMENTO_PIX_PAYLOAD = {
    APaymentData: {},
    AIdPedido: "B7D7ADDD-AC17-4F63-994B-072BE6CE48D4"
};

const DEFAULT_CADASTRO_CLIENTE_PAYLOAD = {
    JSONUser: {
        name: "Valmir Teixeira",
        phone: "11973933247",
        verified: true
    }
};

function injectStoreId(payloadObj, storeId) {
    if (!storeId || !payloadObj || typeof payloadObj !== 'object') return payloadObj;
    const clone = Array.isArray(payloadObj) ? [...payloadObj] : { ...payloadObj };
    
    if (!Array.isArray(clone)) {
        // Sempre injeta ou sobrescreve o ID global
        clone.AGuidEstab = storeId;
        clone.AIdEstab = storeId;
        
        if (clone.jsOrder && typeof clone.jsOrder === 'object') {
            clone.jsOrder = { 
                ...clone.jsOrder,
                fkStore: storeId 
            };
        }
    }
    return clone;
}

function logGastrofoodCall({ direction, action, method, url, payload, status, response, error }) {
    try {
        const entry = {
            type: 'gastrofood_api',
            direction,
            action,
            method,
            url,
            payload: typeof payload === 'object' ? payload : (payload ? JSON.parse(payload) : null),
            status,
            response: typeof response === 'object' ? response : (response ? JSON.parse(response) : null),
            error: error || null
        };
        console.log(`[Gastrofood API] ${JSON.stringify(entry)}`);
    } catch (e) {
        console.log(`[Gastrofood API] ${JSON.stringify({
            type: 'gastrofood_api',
            direction,
            action,
            method,
            url,
            payload: String(payload),
            status,
            response: String(response),
            error: error || e.message
        })}`);
    }
}

async function getOrUpdateCardapioCache(tenantId, companySettings, botSettings) {
    const now = Date.now();
    const cacheKey = tenantId + '_' + (botSettings?.id || 'default');
    let cache = cardapioInMemoryCache.get(cacheKey);
    
    if (cache && (now - cache.timestamp < CACHE_TTL)) {
        console.log(`[CardapioCache] Cache HIT para a chave ${cacheKey}`);
        return cache;
    }
    
    const cardapioOrigem = (botSettings && botSettings.cardapio_origem) || 'supabase';
    const cardapioUrl = (botSettings && botSettings.cardapio_json_url) || companySettings.cardapio_json_url || CARDAPIO_DEFAULT_URL;
    const cardapioToken = (botSettings && botSettings.cardapio_json_token) || companySettings.cardapio_json_token || GASTROFOOD_DEFAULT_TOKEN;
    const cardapioPayload = (botSettings && botSettings.cardapio_json_payload) || companySettings.cardapio_json_payload || DEFAULT_CARDAPIO_PAYLOAD;

    console.log(`[CardapioCache] Cache MISS para a chave ${cacheKey}. Origem configurada: ${cardapioOrigem}`);

    let apiAttempted = false;

    // Se origem for 'supabase', tenta primeiro carregar do Supabase
    if (cardapioOrigem === 'supabase') {
        try {
            console.log(`[CardapioCache] Buscando do Supabase para o tenant ${tenantId}...`);
            const { data: dbProdutos, error: errProd } = await supabase
                .from('cardapio_produtos')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('ativo', true);
                
            if (errProd) throw errProd;
            
            if (dbProdutos && dbProdutos.length > 0) {
                const { data: dbGrupos } = await supabase
                    .from('cardapio_grupos')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .eq('ativo', true);
                    
                cache = {
                    produtos: dbProdutos,
                    grupos: dbGrupos || [],
                    adicionais: new Map(), // produtoId -> passos
                    timestamp: now,
                    origem: 'supabase'
                };
                cardapioInMemoryCache.set(cacheKey, cache);
                return cache;
            }
        } catch (dbErr) {
            console.error(`[CardapioCache] Erro ao carregar cardápio do Supabase para o tenant ${tenantId}:`, dbErr);
        }
    }

    // Se a origem for 'api' OU se a busca do Supabase retornou vazia, tenta API externa
    if (cardapioOrigem === 'api' || !cache) {
        apiAttempted = true;
        if (cardapioUrl) {
            try {
                console.log(`[CardapioCache - API] Buscando cardápio da API externa. URL: ${cardapioUrl}`);
                let bodyObj = {};
                if (cardapioPayload) {
                    try {
                        bodyObj = typeof cardapioPayload === 'string' ? JSON.parse(cardapioPayload) : cardapioPayload;
                    } catch (e) {
                        bodyObj = { AGuidEstab: cardapioPayload };
                    }
                }
                if (companySettings && companySettings.gfood_store_id) {
                    bodyObj = injectStoreId(bodyObj, companySettings.gfood_store_id);
                }
                
                const headers = { 'Content-Type': 'application/json' };
                if (cardapioToken) {
                    headers['Authorization'] = cardapioToken.startsWith('Bearer ') ? cardapioToken : `Bearer ${cardapioToken}`;
                }
                
                logGastrofoodCall({
                    direction: 'request',
                    action: 'Consultar Cardápio',
                    method: 'POST',
                    url: cardapioUrl,
                    payload: bodyObj
                });

                const res = await fetch(cardapioUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(bodyObj)
                });
                
                if (res.ok) {
                    const apiResponse = await res.json();
                    logGastrofoodCall({
                        direction: 'response',
                        action: 'Consultar Cardápio',
                        method: 'POST',
                        url: cardapioUrl,
                        status: res.status,
                        response: apiResponse
                    });

                    const apiProdutos = apiResponse.produtos || apiResponse.data?.produtos || [];
                    const apiGrupos = apiResponse.grupos || apiResponse.data?.grupos || [];
                    
                    if (apiProdutos.length > 0) {
                        const mappedProdutos = apiProdutos.map(p => ({
                            id: p.id || p.code || '',
                            tenant_id: tenantId,
                            grupo_id: p.groupId || p.grupo_id || null,
                            name: p.name,
                            description: p.description || null,
                            price: Number(p.price || p.preco || 0),
                            image: p.image || null,
                            ativo: p.active !== false && p.ativo !== false
                        }));
                        
                        const mappedGrupos = apiGrupos.map((g, idx) => ({
                            id: g.id || g.code || '',
                            tenant_id: tenantId,
                            descricao: g.description || g.descricao || '',
                            ordem: idx,
                            ativo: g.active !== false && g.ativo !== false
                        }));
                        
                        cache = {
                            produtos: mappedProdutos,
                            grupos: mappedGrupos,
                            adicionais: new Map(),
                            timestamp: now,
                            origem: cardapioOrigem === 'api' ? 'api_direta' : 'api_fallback'
                        };
                        cardapioInMemoryCache.set(cacheKey, cache);
                        
                        // Dispara Auto-Healing em background se a origem geral do tenant permitir ou for o fluxo fallback
                        if (cardapioOrigem !== 'api') {
                            autoHealAndIndexCardapio(tenantId, companySettings, {
                                grupos: mappedGrupos,
                                produtos: mappedProdutos
                            }).catch(err => {
                                console.error(`[CardapioCache - AutoHealing] Falha no background sync para o tenant ${tenantId}:`, err);
                            });
                        }
                        
                        return cache;
                    }
                } else {
                    const errText = await res.text();
                    logGastrofoodCall({
                        direction: 'error',
                        action: 'Consultar Cardápio',
                        method: 'POST',
                        url: cardapioUrl,
                        status: res.status,
                        error: errText
                    });
                }
            } catch (apiErr) {
                console.error(`[CardapioCache - API] Erro ao consultar API externa para a chave ${cacheKey}:`, apiErr);
                logGastrofoodCall({
                    direction: 'error',
                    action: 'Consultar Cardápio',
                    method: 'POST',
                    url: cardapioUrl,
                    error: apiErr.message
                });
            }
        }
    }

    // Fallback de Resiliência: se o bot estava configurado como 'api', tentou a API, mas ela falhou, tenta carregar do Supabase para não deixar o cliente sem atendimento.
    if (cardapioOrigem === 'api' && apiAttempted && !cache) {
        try {
            console.log(`[CardapioCache - Fallback Resiliência] API falhou. Tentando resgatar cardápio do Supabase local...`);
            const { data: dbProdutos } = await supabase
                .from('cardapio_produtos')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('ativo', true);
                
            if (dbProdutos && dbProdutos.length > 0) {
                const { data: dbGrupos } = await supabase
                    .from('cardapio_grupos')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .eq('ativo', true);
                    
                cache = {
                    produtos: dbProdutos,
                    grupos: dbGrupos || [],
                    adicionais: new Map(),
                    timestamp: now,
                    origem: 'supabase_fallback'
                };
                cardapioInMemoryCache.set(cacheKey, cache);
                return cache;
            }
        } catch (dbErr) {
            console.error(`[CardapioCache - Fallback Resiliência] Erro ao carregar cardápio do Supabase fallback:`, dbErr);
        }
    }
    
    // Se tudo falhar, retorna um cache vazio temporário
    return {
        produtos: [],
        grupos: [],
        adicionais: new Map(),
        timestamp: now,
        origem: 'vazio'
    };
}

async function autoHealAndIndexCardapio(tenantId, companySettings, data) {
    console.log(`[AutoHealing - Background Sync] Iniciando sincronização do cardápio para o tenant ${tenantId}...`);
    
    const { grupos, produtos } = data;
    if (!produtos || produtos.length === 0) {
        console.warn(`[AutoHealing] Nenhum produto para sincronizar.`);
        return;
    }
    
    // 1. Salvar os grupos no Supabase
    if (grupos && grupos.length > 0) {
        console.log(`[AutoHealing] Salvando ${grupos.length} grupos no Supabase...`);
        const { error: errG } = await supabase
            .from('cardapio_grupos')
            .upsert(grupos, { onConflict: 'id' });
        if (errG) {
            console.error(`[AutoHealing] Erro ao salvar grupos no Supabase:`, errG);
        }
    }
    
    // 2. Salvar os produtos no Supabase
    console.log(`[AutoHealing] Salvando ${produtos.length} produtos no Supabase...`);
    const { error: errP } = await supabase
        .from('cardapio_produtos')
        .upsert(produtos, { onConflict: 'id' });
    if (errP) {
        console.error(`[AutoHealing] Erro ao salvar produtos no Supabase:`, errP);
    }
    
    // 3. Sincronizar os adicionais (passos e opções) em background de forma suave
    const cardapioUrl = companySettings.cardapio_json_url;
    const cardapioToken = companySettings.cardapio_json_token;
    
    if (cardapioUrl && cardapioToken) {
        let stepsUrl = cardapioUrl;
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
        
        console.log(`[AutoHealing] Sincronizando adicionais para os produtos...`);
        
        for (let i = 0; i < produtos.length; i++) {
            const product = produtos[i];
            
            // Pequeno delay para não sobrecarregar as conexões
            await new Promise(resolve => setTimeout(resolve, 200));
            
            try {
                logGastrofoodCall({
                    direction: 'request',
                    action: 'Consultar Adicionais',
                    method: 'POST',
                    url: stepsUrl,
                    payload: { AIdProduto: product.id }
                });

                const resSteps = await fetch(stepsUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': cardapioToken.startsWith('Bearer ') ? cardapioToken : `Bearer ${cardapioToken}`
                    },
                    body: JSON.stringify({ AIdProduto: product.id })
                });
                
                if (resSteps.ok) {
                    const stepsData = await resSteps.json();
                    logGastrofoodCall({
                        direction: 'response',
                        action: 'Consultar Adicionais',
                        method: 'POST',
                        url: stepsUrl,
                        status: resSteps.status,
                        response: stepsData
                    });

                    if (stepsData.status === 200 && stepsData.data) {
                        const passosRaw = stepsData.data.passos || stepsData.data.Passos || [];
                        const passos = Array.isArray(passosRaw) ? passosRaw : [];
                        
                        if (passos.length > 0) {
                            const passosToUpsert = passos.map((p, idx) => {
                                const idPasso = p.IdProdutoPassos || p.id || p.Id;
                                const pergunta = p.Pergunta || p.pergunta || p.SubTitulo || p.subTitulo || 'Opções';
                                const subTitulo = p.SubTitulo || p.subTitulo || null;
                                const qtdMin = p.QtdMin !== undefined ? p.QtdMin : (p.qtdMin !== undefined ? p.qtdMin : 0);
                                const qtdMax = p.QtdMax !== undefined ? p.QtdMax : (p.qtdMax !== undefined ? p.qtdMax : 1);
                                const ativo = p.Ativo !== false && p.ativo !== false;
                                return {
                                    id: idPasso,
                                    tenant_id: tenantId,
                                    produto_id: product.id,
                                    pergunta,
                                    sub_titulo: subTitulo,
                                    qtd_min: qtdMin,
                                    qtd_max: qtdMax,
                                    ordem: idx,
                                    ativo
                                };
                            });
                            
                            await supabase.from('cardapio_passos').upsert(passosToUpsert, { onConflict: 'id' });
                            
                            const opcoesToUpsert = [];
                            passos.forEach(p => {
                                const rawLista = p.ListaProdutos || p.listaProdutos || p.produtos || p.Produtos || [];
                                const idPasso = p.IdProdutoPassos || p.id || p.Id;
                                if (Array.isArray(rawLista)) {
                                    rawLista.forEach(opt => {
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
                                            tenant_id: tenantId,
                                            passo_id: idPasso,
                                            descricao,
                                            preco: precoAdicional,
                                            imagem,
                                            ativo: ativoOpcao
                                        });
                                    });
                                }
                            });
                            
                            if (opcoesToUpsert.length > 0) {
                                await supabase.from('cardapio_opcoes').upsert(opcoesToUpsert, { onConflict: 'id' });
                            }
                        }
                    }
                } else {
                    const errText = await resSteps.text();
                    logGastrofoodCall({
                        direction: 'error',
                        action: 'Consultar Adicionais',
                        method: 'POST',
                        url: stepsUrl,
                        status: resSteps.status,
                        error: errText
                    });
                }
            } catch (stepErr) {
                console.error(`[AutoHealing] Erro ao sincronizar adicionais para o produto ${product.name}:`, stepErr);
                logGastrofoodCall({
                    direction: 'error',
                    action: 'Consultar Adicionais',
                    method: 'POST',
                    url: stepsUrl,
                    error: stepErr.message
                });
            }
        }
    }
    
    // 4. Sincronizar com RAG (Vetorização)
    try {
        console.log(`[AutoHealing - RAG] Vetorizando o cardápio para RAG...`);
        const docName = 'cardapio_digital_auto_healed.txt';
        
        let cardapioText = `LINK DO CARDÁPIO DIGITAL: ${companySettings.link_cardapio || 'https://www.burguerplus.com.br'}\n\n=== MENU DE PRODUTOS COMPLETO ===\n\n`;
        
        const categoriasMap = {};
        if (grupos) {
            grupos.forEach(g => {
                categoriasMap[g.id] = g.descricao;
            });
        }
        
        const produtosAtivos = produtos.filter(p => p.ativo);
        const gruposAtivos = grupos ? grupos.filter(g => g.ativo) : [];
        
        if (gruposAtivos.length > 0) {
            for (const cat of gruposAtivos) {
                const catProducts = produtosAtivos.filter(p => p.grupo_id === cat.id);
                if (catProducts.length === 0) continue;
                
                cardapioText += `CATEGORIA: ${cat.descricao.toUpperCase()}\n`;
                cardapioText += `------------------------------------------------\n`;
                for (const p of catProducts) {
                    cardapioText += `${p.name.toUpperCase()}\n`;
                    if (p.description) {
                        cardapioText += `Descrição: ${p.description}\n`;
                    }
                    cardapioText += `Preço: R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}\n\n`;
                }
                cardapioText += `\n`;
            }
        } else {
            cardapioText += `PRODUTOS:\n`;
            for (const p of produtosAtivos) {
                cardapioText += `${p.name.toUpperCase()}\n`;
                if (p.description) {
                    cardapioText += `Descrição: ${p.description}\n`;
                }
                cardapioText += `Preço: R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}\n\n`;
            }
        }
        
        // Deleta documentos antigos
        const { data: oldDocs } = await supabase
            .from('knowledge_documents')
            .select('id')
            .eq('tenant_id', tenantId)
            .in('name', [docName, 'cardapio_burguer_plus.txt']);
            
        if (oldDocs && oldDocs.length > 0) {
            const docIds = oldDocs.map(d => d.id);
            await supabase.from('knowledge_chunks').delete().in('document_id', docIds);
            await supabase.from('knowledge_documents').delete().in('id', docIds);
        }
        
        // Insere novo documento
        const { data: docData, error: docError } = await supabase
            .from('knowledge_documents')
            .insert([{
                tenant_id: tenantId,
                name: docName,
                type: 'text/plain',
                status: 'processing',
                metadata: { size: cardapioText.length }
            }])
            .select('*')
            .single();
            
        if (docError) throw docError;
        const documentId = docData.id;
        
        const splitTextIntoChunks = (text, chunkSize = 150, overlap = 20) => {
            const words = text.split(/\s+/);
            const chunks = [];
            let i = 0;
            while (i < words.length) {
                const chunk = words.slice(i, i + chunkSize).join(' ');
                chunks.push(chunk);
                i += (chunkSize - overlap);
            }
            return chunks;
        };
        
        const chunks = splitTextIntoChunks(cardapioText, 150, 20);
        const transformer = await LocalEmbeddingsPipeline.getInstance();
        const dbChunks = [];
        
        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];
            if (chunkText.trim().length < 5) continue;
            
            const output = await transformer(chunkText, { pooling: 'mean', normalize: true });
            const embeddingVector = Array.from(output.data);
            
            dbChunks.push({
                document_id: documentId,
                tenant_id: tenantId,
                content: chunkText,
                embedding: embeddingVector,
                chunk_index: i
            });
        }
        
        if (dbChunks.length > 0) {
            await supabase.from('knowledge_chunks').insert(dbChunks);
        }
        
        await supabase
            .from('knowledge_documents')
            .update({ status: 'ready' })
            .eq('id', documentId);
            
        console.log(`[AutoHealing - RAG] Sincronização e vetorização RAG finalizadas com SUCESSO!`);
        
    } catch (ragErr) {
        console.error(`[AutoHealing - RAG] Erro ao vetorizar cardápio para RAG:`, ragErr);
    }
}

async function getCoordsFromAddress(cep, street, number, city, state) {
    let latitude = '';
    let longitude = '';
    const cleanCep = String(cep || '').replace(/\D/g, '');
    
    if (cleanCep.length === 8) {
        // 1. Tentar AwesomeAPI
        try {
            const res = await fetch(`https://cep.awesomeapi.com.br/json/${cleanCep}`);
            if (res.ok) {
                const data = await res.json();
                if (data && !data.erro) {
                    latitude = String(data.lat || '');
                    longitude = String(data.lng || '');
                    console.log(`[Coords Lookup] Coordenadas obtidas da AwesomeAPI para o CEP ${cleanCep}: ${latitude}, ${longitude}`);
                }
            }
        } catch (e) {
            console.warn('[Coords Lookup] Erro ao buscar na AwesomeAPI:', e);
        }
        
        // 2. Se AwesomeAPI falhar, tentar Nominatim pelo CEP
        if (!latitude && !longitude) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${cleanCep}&country=Brazil&format=json`, {
                    headers: { 'User-Agent': 'ChatBoot/1.0' }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        latitude = String(data[0].lat || '');
                        longitude = String(data[0].lon || '');
                        console.log(`[Coords Lookup] Coordenadas obtidas do Nominatim via CEP ${cleanCep}: ${latitude}, ${longitude}`);
                    }
                }
            } catch (e) {
                console.warn('[Coords Lookup] Erro ao buscar CEP no Nominatim:', e);
            }
        }
    }
    
    // 3. Se ainda não tiver latitude/longitude e tivermos rua e cidade, tentar busca por endereço no Nominatim
    if (!latitude && !longitude && street && city) {
        try {
            const queryStr = `${street}, ${number || ''}, ${city}, ${state || ''}, Brazil`;
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}`, {
                headers: { 'User-Agent': 'ChatBoot/1.0' }
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    latitude = String(data[0].lat || '');
                    longitude = String(data[0].lon || '');
                    console.log(`[Coords Lookup] Coordenadas obtidas do Nominatim via Endereço: ${latitude}, ${longitude}`);
                }
            }
        } catch (e) {
            console.warn('[Coords Lookup] Erro ao buscar endereço no Nominatim:', e);
        }
    }
    
    return { latitude, longitude };
}

class AutomationWorker {
    constructor() {
        // As chaves são carregadas no ambiente via dotenv
        this.genAI = null;
    }

    init() {
        const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (apiKey && !this.genAI) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }
    }

    clearCardapioCache(tenantId) {
        if (tenantId) {
            cardapioInMemoryCache.delete(tenantId);
            console.log(`[AutomationWorker - Cache] Cache do cardápio limpo para o tenant ${tenantId}`);
        } else {
            cardapioInMemoryCache.clear();
            console.log(`[AutomationWorker - Cache] Todos os caches de cardápio foram limpos`);
        }
    }

    async routeMessageToBot(eligibleBots, textMessage) {
        if (!eligibleBots || eligibleBots.length === 0) return null;
        if (eligibleBots.length === 1) return eligibleBots[0];

        try {
            this.init();
            if (!this.genAI) {
                console.warn('[AutomationWorker] Gemini não inicializado no roteamento de bots. Usando fallback do primeiro bot.');
                return eligibleBots[0];
            }

            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const prompt = `Você é um orquestrador de atendimento inteligente. Analise a mensagem do cliente e decida qual dos seguintes agentes (bots) é o mais adequado para responder ao cliente com base em seus nomes e descrições.

Agentes disponíveis:
${eligibleBots.map(b => `- ID: "${b.id}" | Nome: "${b.name}" | Descrição: "${b.description || 'Sem descrição.'}"`).join('\n')}

Mensagem do cliente:
"${textMessage}"

Responda APENAS com o ID do agente escolhido, exatamente como está listado, sem formatações adicionais, sem markdown, sem aspas. Exemplo de resposta: "53a2db6c-d9c2-4760-8cbd-454ceccd280c".`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();
            
            const chosenBot = eligibleBots.find(b => responseText.includes(b.id) || b.id === responseText);
            if (chosenBot) {
                console.log(`[BotRouter] Roteamento inteligente escolheu o bot: "${chosenBot.name}" (ID: ${chosenBot.id}) para a mensagem: "${textMessage}"`);
                return chosenBot;
            } else {
                console.warn(`[BotRouter] Escolha da IA (${responseText}) não bate com os bots disponíveis. Usando fallback do primeiro bot.`);
                return eligibleBots[0];
            }
        } catch (err) {
            console.error('[BotRouter] Erro ao rotear mensagem inteligente:', err);
            return eligibleBots[0];
        }
    }

    async getConversationHistory(tenantId, conversationId, limit = 10) {
        if (!conversationId) return [];
        const { data } = await supabase.from('messages')
            .select('text_content, sender_type')
            .eq('tenant_id', tenantId)
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(limit);
        
        if (!data) return [];
        
        // Return chronologically
        const rawHistory = data.reverse().map(m => ({
            role: m.sender_type === 'bot' || m.sender_type === 'agent' ? 'model' : 'user',
            parts: [{ text: m.text_content || '' }]
        }));

        // Sanitize history for Gemini (Must start with 'user', roles must alternate)
        const sanitizedHistory = [];
        for (const msg of rawHistory) {
            if (sanitizedHistory.length === 0 && msg.role !== 'user') continue;
            if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === msg.role) {
                sanitizedHistory[sanitizedHistory.length - 1].parts[0].text += '\n' + msg.parts[0].text;
            } else {
                sanitizedHistory.push({ role: msg.role, parts: [{ text: msg.parts[0].text }] });
            }
        }
        return sanitizedHistory;
    }

    async processMessage(params) {
        const { tenantId, instanceId, conversationId, contactId, jid, textMessage, botId, botSettings, sock, botDelay, botInstructions } = params;
        const key = conversationId || jid;

        if (!this.pendingJobs) {
            this.pendingJobs = new Map();
        }

        let job = this.pendingJobs.get(key);
        if (job) {
            // Cancela os cronômetros pendentes (tanto geração quanto envio)
            if (job.generationTimeout) clearTimeout(job.generationTimeout);
            if (job.sendTimeout) clearTimeout(job.sendTimeout);

            job.textMessages.push(textMessage);
            job.params = params; // Atualiza parâmetros para usar os mais recentes

            if (job.generating) {
                // Se a IA está gerando agora, marca como obsoleta para regerar ao finalizar
                job.obsolete = true;
                console.log(`[AutomationWorker] Novas mensagens recebidas durante a geração para ${key}. Resposta atual marcada como obsoleta.`);
            } else {
                // Re-agenda a geração após 1.5s de silêncio (debounce de entrada)
                job.generationTimeout = setTimeout(() => this.triggerGeneration(key), 1500);
                console.log(`[AutomationWorker] Nova mensagem adicionada ao job ativo para ${key}. Reiniciando debounce de entrada de 1.5s.`);
            }
        } else {
            job = {
                textMessages: [textMessage],
                params: params,
                generationTimeout: null,
                sendTimeout: null,
                generating: false,
                obsolete: false,
                responseText: null
            };
            this.pendingJobs.set(key, job);
            job.generationTimeout = setTimeout(() => this.triggerGeneration(key), 1500);
            console.log(`[AutomationWorker] Iniciada nova fila de processamento pós-debounce para ${key}. Resposta será gerada após 1.5s.`);
        }
    }

    cancelPendingMessage(conversationIdOrJid) {
        if (!conversationIdOrJid) return;
        const key = conversationIdOrJid;
        if (this.pendingJobs && this.pendingJobs.has(key)) {
            const job = this.pendingJobs.get(key);
            console.log(`[AutomationWorker] Cancelando resposta automática pendente para ${key} devido a ação/mensagem do atendente humano.`);
            if (job.generationTimeout) clearTimeout(job.generationTimeout);
            if (job.sendTimeout) clearTimeout(job.sendTimeout);
            this.pendingJobs.delete(key);
        }
    }

    async triggerGeneration(key) {
        const job = this.pendingJobs?.get(key);
        if (!job) return;

        job.generating = true;
        job.obsolete = false;
        job.generationTimeout = null;

        const combinedText = job.textMessages.join('\n');
        console.log(`[AutomationWorker] Iniciando geração da IA para ${key} com mensagens:\n"${combinedText}"`);

        try {
            const responseText = await this.generateResponse({
                ...job.params,
                textMessage: combinedText
            });

            if (!responseText) {
                console.warn(`[AutomationWorker] Resposta da IA vazia ou nula para a conversa ${key}. Silenciando bot.`);
                job.generating = false;
                this.pendingJobs.delete(key);
                return;
            }

            // Se novas mensagens chegaram durante a geração, descarta e regera
            if (job.obsolete) {
                console.log(`[AutomationWorker] Geração finalizada para ${key}, mas nova mensagem chegou durante a chamada de API. Descartando resposta obsoleta.`);
                job.generating = false;
                job.generationTimeout = setTimeout(() => this.triggerGeneration(key), 1500);
                return;
            }

            job.generating = false;
            job.responseText = responseText;

            console.log(`[AutomationWorker] Resposta gerada para ${key}. Aguardando 15s de silêncio para enviar.`);

            if (job.sendTimeout) clearTimeout(job.sendTimeout);

            job.sendTimeout = setTimeout(async () => {
                try {
                    console.log(`[AutomationWorker] Fim do cronômetro de 15s para ${key}. Enviando resposta final.`);
                    const activeJob = this.pendingJobs?.get(key);
                    if (activeJob && activeJob.responseText === responseText) {
                        this.pendingJobs.delete(key);
                        await this.sendFinalResponse(activeJob.params, responseText);
                    }
                } catch (sendErr) {
                    console.error('[AutomationWorker] Erro ao enviar resposta após 15s:', sendErr);
                }
            }, 15000);

        } catch (genErr) {
            console.error('[AutomationWorker] Falha ao processar AI no triggerGeneration:', genErr);
            job.generating = false;
            this.pendingJobs.delete(key);
        }
    }

    async generateResponse({ tenantId, instanceId, conversationId, contactId, jid, textMessage, botId, botSettings, sock, botDelay, botInstructions, history: passedHistory }) {
        try {
            this.init();
             if (!this.genAI) {
                 console.error("[AutomationWorker] GEMINI_API_KEY não configurada ou vazia. Não é possível gerar resposta da IA.");
                 return null;
             }

            console.log(`[AutomationWorker] Gerando resposta para o bot: ${botSettings.name} | Tenant: ${tenantId}`);

            // Carrega as variáveis globais da empresa
            let companyName = '';
            let companySettings = {};
            try {
                const { data: companyData } = await supabase
                    .from('companies')
                    .select('name, settings')
                    .eq('id', tenantId)
                    .single();

                if (companyData) {
                    companyName = companyData.name || '';
                    companySettings = companyData.settings || {};
                }
            } catch (err) {
                console.error(`[AutomationWorker] Erro ao carregar variáveis globais do tenant ${tenantId}:`, err);
            }

            // Carrega os dados do contato se houver
            let contactInfo = null;
            if (contactId) {
                try {
                    const { data: contactData } = await supabase
                        .from('contacts')
                        .select('*')
                        .eq('id', contactId)
                        .single();
                    if (contactData) {
                        contactInfo = contactData;
                    }
                } catch (errContact) {
                    console.error(`[AutomationWorker] Erro ao carregar dados do contato ${contactId}:`, errContact);
                }
            } else if (jid) {
                try {
                    const cleanPhone = String(jid).replace(/\D/g, '');
                    if (cleanPhone) {
                        const { data: contactData } = await supabase
                            .from('contacts')
                            .select('*')
                            .eq('tenant_id', tenantId)
                            .eq('phone', cleanPhone)
                            .limit(1)
                            .maybeSingle();
                        if (contactData) {
                            contactInfo = contactData;
                        }
                    }
                } catch (errContact) {
                    console.error(`[AutomationWorker] Erro ao carregar dados do contato por jid ${jid}:`, errContact);
                }
            }

            const vars = {
                nomeIa: companySettings.nome_ia || companyName || 'Luna',
                endereco: companySettings.endereco || '',
                horarioFuncionamento: companySettings.horario_funcionamento || '',
                linkCardapio: (companySettings.link_cardapio || '').replace(/\/+$/, ''),
                instagram: companySettings.instagram || '',
                googleMaps: companySettings.google_maps || '',
                youtube: companySettings.youtube || '',
                tiktok: companySettings.tiktok || ''
            };

            // Determinar se a empresa está fechada no momento
            let isClosed = false;
            let nomeDiaAtual = 'Segunda-feira';
            let currentTimeStr = '00:00';
            
            try {
                const nowBr = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                const diaDaSemana = nowBr.getDay(); // 0 = Domingo, 1 = Segunda, etc.
                const diasNomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
                nomeDiaAtual = diasNomes[diaDaSemana];
                
                const currentHour = nowBr.getHours();
                const currentMinute = nowBr.getMinutes();
                currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
                
                const horariosEstrutura = companySettings.horarios_estrutura;
                if (horariosEstrutura && Array.isArray(horariosEstrutura)) {
                    const configDia = horariosEstrutura.find(d => d.dia === nomeDiaAtual);
                    if (!configDia || !configDia.aberto) {
                        isClosed = true;
                    } else if (configDia.periodos && configDia.periodos.length > 0) {
                        let isWithinAnyPeriod = false;
                        for (const periodo of configDia.periodos) {
                            if (periodo.inicio && periodo.fim) {
                                const [startH, startM] = periodo.inicio.split(':').map(Number);
                                const [endH, endM] = periodo.fim.split(':').map(Number);
                                
                                const startVal = startH * 60 + startM;
                                const endVal = endH * 60 + endM;
                                const currentVal = currentHour * 60 + currentMinute;
                                
                                if (endVal < startVal) {
                                    // Turno passa da meia-noite (ex: 18:00 às 02:00)
                                    if (currentVal >= startVal || currentVal <= endVal) {
                                        isWithinAnyPeriod = true;
                                        break;
                                    }
                                } else {
                                    if (currentVal >= startVal && currentVal <= endVal) {
                                        isWithinAnyPeriod = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!isWithinAnyPeriod) {
                            isClosed = true;
                        }
                    }
                }
            } catch (errHorario) {
                console.error('[AutomationWorker] Erro ao calcular horário de funcionamento:', errHorario);
            }

            const replaceTokens = (text) => {
                if (!text || typeof text !== 'string') return text;
                return text
                    .replace(/\[NOME_DA_EMPRESA\]/g, vars.nomeIa)
                    .replace(/\[ENDERECO_DA_EMPRESA\]/g, vars.endereco)
                    .replace(/\[HORARIO_FUNCIONAMENTO\]/g, vars.horarioFuncionamento)
                    .replace(/\[LINK_CARDAPIO\]/g, vars.linkCardapio)
                    .replace(/\[LINK_INSTAGRAM\]/g, vars.instagram)
                    .replace(/\[LINK_GOOGLE_MAPS\]/g, vars.googleMaps)
                    .replace(/\[LINK_YOUTUBE\]/g, vars.youtube)
                    .replace(/\[LINK_TIKTOK\]/g, vars.tiktok);
            };

            // Query Expansion para buscas RAG
            let expandedQueryText = textMessage;
            if (textMessage.trim().length < 15) {
                try {
                    const { data: lastBotMsg } = await supabase
                        .from('messages')
                        .select('text_content')
                        .eq('tenant_id', tenantId)
                        .eq('conversation_id', conversationId)
                        .eq('direction', 'outbound')
                        .order('timestamp', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (lastBotMsg && lastBotMsg.text_content) {
                        expandedQueryText = `IA perguntou: ${lastBotMsg.text_content} -> Cliente respondeu: ${textMessage}`;
                        console.log(`[AutomationWorker] Query Expansion ativada para busca semântica: "${expandedQueryText}"`);
                    }
                } catch (errExp) {
                    console.error('[AutomationWorker] Erro ao buscar última mensagem da IA para query expansion:', errExp);
                }
            }

            // 1. Busca contexto no RAG
            const transformer = await LocalEmbeddingsPipeline.getInstance();
            const output = await transformer(expandedQueryText, { pooling: 'mean', normalize: true });
            const queryEmbedding = Array.from(output.data);

            const { data: semanticMatches } = await supabase.rpc('match_knowledge_chunks', {
                 query_embedding: queryEmbedding,
                 match_threshold: 0.45,
                 match_count: 3,
                 p_tenant_id: tenantId
            });

            let contextText = '';
            if (semanticMatches && semanticMatches.length > 0) {
                contextText = "\n\n### CONTEXTO DA BASE DE CONHECIMENTO ###\nVocê pode usar as informações a seguir para basear sua resposta caso seja útil:\n" +
                              semanticMatches.map(m => m.content).join("\n---\n");
            }

            // 1b. Busca correções de raciocínio / comportamento da IA
            let correctionsText = '';
            try {
                const { data: reasoningAdjustments } = await supabase.rpc('match_ai_reasoning_adjustments', {
                     query_embedding: queryEmbedding,
                     match_threshold: 0.55, // Similaridade para correções
                     match_count: 3,
                     p_tenant_id: tenantId
                });

                if (reasoningAdjustments && reasoningAdjustments.length > 0) {
                    correctionsText = "\n\n### EXEMPLOS DE CORREÇÕES DE COMPORTAMENTO ANTERIORES (OBRIGATÓRIO SEGUIR) ###\n" +
                                      "O atendente corrigiu anteriormente respostas para perguntas similares de clientes. " +
                                      "Você deve seguir estritamente as diretrizes de tom, comportamento e resposta esperada abaixo:\n" +
                                      reasoningAdjustments.map((r, idx) => {
                                        let text = `Correção ${idx + 1}:\n`;
                                        if (r.context_summary) {
                                            text += `- Contexto/Memória da Conversa: "${r.context_summary}"\n`;
                                        }
                                        text += `- Pergunta Similar do Cliente: "${r.user_query}"\n` +
                                                `- Resposta Esperada Corrigida: "${r.corrected_response}"`;
                                        return text;
                                      }).join("\n---\n");
                }
            } catch (errCorr) {
                console.error('[AutomationWorker] Erro ao buscar correções de IA:', errCorr);
            }

            // Determina se é a primeira mensagem do bot nesta conversa
            let isFirstMessage = false;
            if (conversationId) {
                try {
                    const { count } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', tenantId)
                        .eq('conversation_id', conversationId)
                        .eq('direction', 'outbound');
                    isFirstMessage = (count === 0);
                } catch (errFirstMsg) {
                    console.error('[AutomationWorker] Erro ao verificar primeira mensagem:', errFirstMsg);
                }
            } else {
                isFirstMessage = true; // Se não houver conversa ativa ainda no BD, considera como a primeira
            }

            // 2. Prepara o System Prompt
            let basePrompt = botSettings.systemPrompt || botSettings.system_prompt || "Você é um assistente prestativo.";
            
            // Regra Global Estrita: Ocultar arquitetura interna de sub-robôs e unificar a persona como "Luna"
            basePrompt += `\n\n### DIRETRIZES DE IDENTIDADE E CONFIDENCIALIDADE (ESTRITAS) ###\n` +
                          `1. Sua identidade pública para o cliente é unicamente "Luna". Você deve se apresentar e se comportar apenas como Luna.\n` +
                          `2. NUNCA mencione termos de arquitetura interna de robôs ou outros nomes de robôs (como "Luna Menu", "Luna Pedido", "Luna SAC", "Luna Agendador", etc.) na conversa com o cliente.\n` +
                          `3. Jamais diga coisas como "posso chamar a Luna Pedido" ou "a Luna Menu vai te ajudar". Em vez disso, assuma toda a responsabilidade pela interação ou diga que você mesma (Luna) ajudará o cliente com o que for necessário (pedido, cardápio, agendamento, etc.).\n` +
                          `4. Para o cliente, você é única e seu nome é apenas Luna.\n`;

            // Regra Global de Humanização do Atendimento (WhatsApp Brasil)
            basePrompt += `\n\n### DIRETRIZES DE HUMANIZAÇÃO E TOM DE VOZ (ESTRITAS) ###\n` +
                          `1. Você deve soar como um ser humano extremamente caloroso, empático, educado e prestativo no WhatsApp, não como um assistente corporativo frio ou robótico.\n` +
                          `2. EVITE terminologias robóticas, jargões formais ou expressões engessadas (ex: "prezado", "prezada", "procedimento", "conforme solicitado", "estarei verificando", "atendimento transferido", "aguarde um instante/momento").\n` +
                          `3. Use escuta ativa: valide as emoções do cliente. Se ele relatar um problema ou demonstrar urgência/ansiedade, responda com empatia profunda (ex: "Entendo perfeitamente", "Sinto muito por isso, deixa comigo que vou resolver", "Vou te ajudar agora mesmo").\n` +
                          `4. Escreva com naturalidade: use parágrafos curtos, linguagem coloquial profissional fluida do Brasil e adicione de 1 a 3 emojis calorosos para humanizar a conversa, sem exagerar.\n` +
                          `5. PRIORIZE E SIGA ESTRITAMENTE as instruções e exemplos de respostas corrigidas que constam no Manual de Raciocínio e Ajustes da I.A ou nas correções anteriores. Se houver uma correção registrada para uma pergunta similar do cliente, você deve replicar o estilo, o tom e a solução adotada pelo atendente humano.\n`;

            // Regra Global de Uso do Nome do Cliente (ESTRITA)
            basePrompt += `\n\n### DIRETRIZES DE USO DO NOME DO CLIENTE (ESTRITAS) ###\n` +
                          `1. Se o nome do cliente estiver disponível nos dados do cliente atual e NÃO for um nome genérico (como "Cliente", "Cliente Simulador" ou vazio), você DEVE OBRIGATORIAMENTE chamar o cliente pelo nome nas suas respostas e saudações.\n` +
                          `2. Por exemplo, em saudações diga: Olá, tudo bem Vanessa? Seja bem-vinda!, ou Como posso te ajudar hoje, Vanessa?, ou Que bom falar com você, Vanessa!\n` +
                          `3. Mantenha essa personalização afetuosa, chamando-o pelo nome no decorrer da conversa de maneira natural.\n`;

            // Regra Global de Entendimento de Saladas (ESTRITA)
            basePrompt += `\n\n### DIRETRIZES DE ENTENDIMENTO DE SALADAS (ESTRITAS) ###\n` +
                          `1. Se o cliente solicitar uma "salada", diferencie claramente entre "salada de verdade" (como a SALADA CAESAR ou Salada de Frutas) e "lanches/combos com salada" (como Lanche Plus Salada ou Combo Plus Salada, que são hambúrgueres).\n` +
                          `2. Se o cliente disser que quer comer uma salada (prato leve), apresente a SALADA CAESAR como o item principal e ideal de salada do cardápio, antes de citar lanches que apenas contêm salada em sua composição.\n`;

            // Regra de Prioridade do Cardápio Digital e Envio na Primeira Mensagem
            basePrompt += `\n\n### DIRETRIZES DO CARDÁPIO DIGITAL (ESTRITAS E OBRIGATÓRIAS) ###\n` +
                          `1. O link oficial do cardápio digital da empresa é: [LINK_CARDAPIO]. Você DEVE usar e enviar exatamente este link: [LINK_CARDAPIO] sempre que se referir ao cardápio digital, site, menu ou onde fazer pedidos.\n` +
                          `2. PRIORIDADE ABSOLUTA: NUNCA sob nenhuma circunstância use ou informe qualquer outro link ou URL de cardápio/site que você encontrar na Base de Conhecimento (RAG) ou no contexto dos arquivos. O link [LINK_CARDAPIO] é soberano e anula qualquer outro link divergente encontrado nos documentos.\n` +
                          `3. Quando o cliente pedir o link do cardápio, envie apenas e exatamente o link [LINK_CARDAPIO].\n` +
                          `4. REGRAS PARA INCLUIR LINKS DE PRODUTOS E CARDÁPIO (CRÍTICAS):\n` +
                          `   - Se você estiver listando ou recomendando até 3 produtos (no máximo 3), você DEVE incluir o link individual de cada produto logo abaixo dele, usando o 'link_produto' retornado pela ferramenta 'Consultar_produtos_cardapio'.\n` +
                          `     * Formato do link do produto: se construir o link manualmente, ele deve seguir a estrutura exata: [LINK_CARDAPIO]/loja/burguerplus/produto/CODIGO_DO_PRODUTO (por exemplo: https://www.burguerplus.com.br/loja/burguerplus/produto/CODIGO_DO_PRODUTO).\n` +
                          `   - Se a lista de produtos for grande (mais de 3 produtos), você NÃO DEVE incluir os links individuais de cada produto para não poluir a mensagem. Em vez disso, apresente os produtos de forma limpa e, ao final da lista, envie apenas o link geral do cardápio digital (ex: '[LINK_CARDAPIO]').\n` +
                          `5. DIRETRIZ DE FORMATAÇÃO E ESPAÇAMENTO DE MENSAGENS (ESTRITA):\n` +
                          `   - Quando listar produtos ou enviar respostas para o cliente, NUNCA agrupe tudo em um único bloco de texto ou parágrafo longo. Isso torna a leitura cansativa e confusa no WhatsApp.\n` +
                          `   - Você DEVE obrigatoriamente pular UMA ou DUAS linhas (usando quebras de linha duplas \\n\\n) entre cada produto apresentado ou seções da mensagem.\n` +
                          `   - Para cada produto listado, use o seguinte padrão de formatação limpo e espaçado (incluindo o link apenas se a lista tiver no máximo 3 produtos):\n` +
                          `     *Nome do Produto*\n` +
                          `     Descrição: [Descrição do produto]\n` +
                          `     Preço: R$ [Preço]\n` +
                          `     👉 Acesse e peça aqui: [link_produto] (INCLUIR ESTE LINK APENAS SE A LISTA DE PRODUTOS TIVER NO MÁXIMO 3 PRODUTOS)\n\n` +
                          `   - Mantenha sempre um tom amigável e uma formatação arejada com bastante espaçamento visual (com duas quebras de linha) entre os itens apresentados.\n`;

            // Diretrizes de Vendas e Montagem de Pedido
            basePrompt += `\n\n### DIRETRIZES DE VENDAS, CARDÁPIO E MONTAGEM DE PEDIDO (ESTRITAS) ###\n` +
                          `1. REGRA DE OURO DO CARDÁPIO (CRÍTICA E ABSOLUTA):\n` +
                          `   - Você SÓ PODE sugerir, citar, recomendar ou adicionar ao pedido produtos que estejam retornados EXPLICITAMENTE pelas ferramentas "Consultar_produtos_cardapio" ou "Consultar_adicionais_produto" nesta conversa.\n` +
                          `   - NUNCA, sob nenhuma circunstância, alucine, invente ou sugira pratos, saladas, wraps, bebidas, sobremesas ou adicionais (ex: Salada Caesar, Wrap de Frango, Sanduíche de Peito de Peru, Strogonoff) de sua própria imaginação ou baseados em conversas/conhecimentos de RAG antigos que não constem no retorno direto das ferramentas do cardápio.\n` +
                          `   - OBRIGATORIEDADE DE CONSULTA: Você DEVE chamar a ferramenta "Consultar_produtos_cardapio" sempre que o cliente perguntar sobre opções de comida, bebidas, sugestões de pratos, alternativas mais leves/pesadas, ou se ele citar qualquer item de alimentação. Nunca responda a perguntas sobre comida ou cardápio sem antes ter a resposta da ferramenta nesta mesma iteração de conversa.\n` +
                          `   - ESTRATÉGIA DE BUSCA E TRUNCAMENTO: A ferramenta "Consultar_produtos_cardapio" retorna no máximo os primeiros 30 produtos por padrão se chamada sem argumentos. Se o cliente solicitar um item específico ou um tipo de item (ex: saladas, sucos, milk-shakes, doces, acompanhamentos) e este não aparecer nos primeiros 30 itens, você DEVE OBRIGATORIAMENTE realizar uma nova consulta na ferramenta passando um "termo_busca" correspondente (ex: termo_busca: "salada", termo_busca: "suco") para filtrar e validar a existência do produto antes de afirmar que o produto não existe.\n` +
                          `   - Se o cliente solicitar pratos "leves", "saudáveis", "veganos", "doces", etc., e a busca no cardápio retornar vazia ou não tiver esses itens, informe de forma extremamente educada e simpática que a Burguer Plus é uma hamburgueria artesanal e que no momento não dispõe dessas opções específicas (ex: saladas/wraps), oferecendo e citando apenas os produtos reais que constam na resposta da ferramenta (como os hambúrgueres, batatas fritas e bebidas reais da casa) e convidando-o com carinho a escolher entre eles.\n` +
                          `2. FLUXO DE MONTAGEM DO PEDIDO (ESTRITO):\n` +
                          `   - Quando o cliente demonstrar interesse em um produto, você deve consultar os opcionais/adicionais desse produto usando a ferramenta "Consultar_adicionais_produto".\n` +
                          `   - Identifique quais passos de adicionais são OBRIGATÓRIOS (onde qtd_minima > 0). Você DEVE perguntar ao cliente a preferência dele para cada passo obrigatório antes de prosseguir (ex: ponto da carne, tamanho, etc.).\n` +
                          `   - Apresente também as opções extras/adicionais opcionais (ex: bacon, queijo extra, ovo, etc.) e pergunte de forma simpática se ele deseja adicionar alguma dessas opções no item.\n` +
                          `   - Quando o cliente fechar o que deseja, faça um resumo claro de todos os itens e seus respectivos adicionais selecionados, mostrando o preço de cada um e o total acumulado do pedido.\n` +
                          `   - Coleta de Dados do Cliente: Para concluir a montagem do pedido, você DEVE verificar se o cliente possui cadastro completo:
                                  1. Se o cliente possui cadastro com nome e endereço (CEP, rua, número) válidos, CONFIRME os dados de endereço e utilize-o diretamente!
                                  2. Se o cliente tem cadastro sem endereço ou não tem cadastro, solicite apenas o CEP e o número da residência. NUNCA peça dados desnecessários como rua, bairro e cidade se o cliente puder fornecer o CEP, pois com o CEP (chame a ferramenta "Consultar_cep") e o número da residência você consegue buscar/preencher todo o restante automaticamente.
                                  3. IMPORTANTE: Após preencher ou confirmar o CEP e número, pergunte obrigatoriamente se é condomínio (se sim, solicite o número do apartamento e bloco/torre) e pergunte também se há um ponto de referência para a entrega.
                                  4. Atualize o cadastro do contato utilizando a ferramenta "Atualizar_endereco_contato" assim que obtiver as informações novas/atualizadas de CEP, rua, número, bairro, cidade, estado, apartamento (ap), bloco (bloco), ponto de referência (referencia) e coordenadas, para garantir que a ficha de cadastro do contato esteja sempre em sincronia. E use estes dados atualizados para emitir o pedido na API do GastroFood ("Enviar_pedido_gastrofood").\n` +
                          `   - Ao final, após confirmar os detalhes do endereço e o resumo do pedido com os adicionais, informe o total e pergunte a forma de pagamento (Dinheiro, Cartão, Pix).\n` +
                          `   - Nunca invente preços ou opções. Sempre baseie-se estritamente no retorno das ferramentas "Consultar_produtos_cardapio" e "Consultar_adicionais_produto".\n` +
                          `3. Quando o cliente pedir o link do cardápio, envie apenas e exatamente o link [LINK_CARDAPIO].\n`;

            if (isFirstMessage) {
                basePrompt += `\n⚠️ AVISO DE PRIMEIRA MENSAGEM (URGENTE/OBRIGATÓRIO): Esta é a PRIMEIRA mensagem desta conversa. Você DEVE saudar o cliente com carinho e OBRIGATORIAMENTE incluir o link do cardápio digital [LINK_CARDAPIO] nesta resposta inicial.` +
                              ` Além disso, se houver um bloco de texto sob a tag '[PRIMEIRA MENSSAGEM A SER ENVIADA]' ou '[PRIMEIRA MENSAGEM A SER ENVIADA]' no seu prompt de sistema, você DEVE retornar EXATAMENTE o texto daquele bloco (substituindo apenas as variáveis/links como [LINK_CARDAPIO] se aplicável), sem adicionar comentários, explicações extras ou outros emojis além do que está contido no bloco. Se o bloco estiver presente, use-o de forma literal como sua resposta inicial.\n`;
            }

            if (botInstructions && botInstructions.trim().length > 0) {
                basePrompt += `\n\n### INSTRUÇÕES DE COMPORTAMENTO PERSONALIZADAS ###\nImportante: Siga estritamente as diretrizes e regras de personalidade a seguir em todas as interações:\n${botInstructions}\n`;
            }

            // Diretrizes de Horário de Funcionamento
            let storeStatusText = `\n\n### STATUS E HORÁRIO DE ATENDIMENTO ###\n` +
                                  `- Status Atual da Loja: ${isClosed ? 'FECHADA' : 'ABERTA'}\n` +
                                  `- Horário de Brasília Atual: ${currentTimeStr} (${nomeDiaAtual})\n` +
                                  `- Horário Geral da Empresa: ${vars.horarioFuncionamento || 'Não cadastrado'}\n`;
            
            if (isClosed) {
                storeStatusText += `\n⚠️ DIRETRIZ CRÍTICA (ESTRITA): A empresa está FECHADA neste momento. Você deve responder ao cliente de forma extremamente calorosa, empática e amigável informando que estamos fora do horário de atendimento. Indique os horários de funcionamento normais (acima) e convide-o com carinho a entrar em contato novamente quando reabrirmos. NUNCA faça anotações de pedidos, agendamento de turnos ou promessas de atendimento imediato se a casa estiver fechada.\n`;
            }
            
            basePrompt += storeStatusText;

            // Memória Operacional da Empresa (vindas de /settings/account)
            const companyMemoryText = `\n\n### MEMÓRIA OPERACIONAL DA EMPRESA (DADOS DE CONFIGURAÇÃO DO SISTEMA) ###\n` +
                                       `- Razão Social: ${companySettings.corporateName || 'Não cadastrado'}\n` +
                                       `- CNPJ: ${companySettings.cnpj || 'Não cadastrado'}\n` +
                                       `- Nome Fantasia da I.A: ${vars.nomeIa}\n` +
                                       `- Endereço Comercial Completo: ${vars.endereco || 'Não cadastrado'}\n` +
                                       `- CEP Comercial: ${companySettings.zipCode || 'Não cadastrado'}\n` +
                                       `- Wi-Fi da Loja (Senha): ${companySettings.wifiPassword || 'Não cadastrado'}\n` +
                                       `- Formas de Pagamento Aceitas: ${companySettings.paymentMethods || 'Não cadastrado'}\n` +
                                       `- Pix Ativo: ${companySettings.acceptsPix ? 'Sim' : 'Não'}\n` +
                                       `- Possui Taxa de Entrega: ${companySettings.hasDeliveryFee ? 'Sim' : 'Não'}\n` +
                                       `- Regras de Taxa de Entrega: ${companySettings.deliveryFeeRules || 'Não cadastrado'}\n` +
                                       `- Tempo Médio de Preparo dos Pedidos: ${companySettings.averagePrepTime || 'Não cadastrado'}\n` +
                                       `- Link Oficial do Cardápio Digital: ${vars.linkCardapio || 'Não cadastrado'}\n` +
                                       `- Redes Sociais da Empresa:\n` +
                                       `  * Instagram: ${vars.instagram || 'Não cadastrado'}\n` +
                                       `  * Google Maps: ${vars.googleMaps || 'Não cadastrado'}\n` +
                                       `  * YouTube: ${vars.youtube || 'Não cadastrado'}\n` +
                                       `  * TikTok: ${vars.tiktok || 'Não cadastrado'}\n`;

            basePrompt += companyMemoryText;

            if (contactInfo) {
                basePrompt += `\n\n### DADOS DO CLIENTE ATUAL (CONVERSANDO NO CHAT) ###\n` +
                              `- Nome: ${contactInfo.name || 'Cliente'}\n` +
                              `- Telefone: ${contactInfo.phone || ''}\n` +
                              `- CEP do Cliente: ${contactInfo.cep || 'Não informado'}\n` +
                              `- Rua / Logradouro: ${contactInfo.address_street || 'Não informado'}\n` +
                              `- Número da Residência: ${contactInfo.address_number || 'Não informado'}\n` +
                              `- Bairro: ${contactInfo.address_neighborhood || 'Não informado'}\n` +
                              `- Cidade: ${contactInfo.address_city || 'Não informado'}\n` +
                              `- Estado (UF): ${contactInfo.address_state || 'Não informado'}\n` +
                              `- Apartamento: ${contactInfo.ap || 'Não informado'}\n` +
                              `- Bloco/Torre: ${contactInfo.block || 'Não informado'}\n` +
                              `- Ponto de Referência: ${contactInfo.reference || 'Não informado'}\n` +
                              `- Latitude: ${contactInfo.latitude || 'Não informado'}\n` +
                              `- Longitude: ${contactInfo.longitude || 'Não informado'}\n` +
                              `- Anotações Internas sobre o Cliente: ${contactInfo.notes || 'Nenhuma anotação'}\n`;

                if (Array.isArray(contactInfo.addresses) && contactInfo.addresses.length > 0) {
                    basePrompt += `- Múltiplos Endereços Cadastrados:\n`;
                    contactInfo.addresses.forEach((addr, idx) => {
                        const streetName = addr.street || addr.address_street || 'Não informado';
                        const num = addr.number || addr.address_number || 'S/N';
                        const neighborhood = addr.neighborhood || addr.address_neighborhood || 'Não informado';
                        const city = addr.city || addr.address_city || 'Não informado';
                        const state = addr.state || addr.address_state || 'Não informado';
                        const apt = addr.apartment || addr.ap || 'Não informado';
                        const block = addr.block || 'Não informado';
                        const ref = addr.reference || 'Não informado';
                        
                        basePrompt += `  * Endereço ${idx + 1}:${idx === 0 ? ' (Principal)' : ''}\n` +
                                      `    - CEP: ${addr.cep || 'Não informado'}\n` +
                                      `    - Rua: ${streetName}, Nº: ${num}\n` +
                                      `    - Bairro: ${neighborhood}\n` +
                                      `    - Cidade/UF: ${city}/${state}\n` +
                                      `    - Apto: ${apt} | Bloco: ${block}\n` +
                                      `    - Referência: ${ref}\n` +
                                      `    - Lat/Lng: ${addr.latitude || 'Não informado'}/${addr.longitude || 'Não informado'}\n`;
                    });
                }
            }

            const systemPrompt = replaceTokens(basePrompt + contextText + correctionsText);
            
            // 3. Obtem histórico da conversa
            let history = passedHistory ? [...passedHistory] : await this.getConversationHistory(tenantId, conversationId, 12);
            // remove last message as it will be sent as new prompt
            if (history.length > 0 && history[history.length - 1].role === 'user') {
                history.pop();
            }

            // Garantia de Integridade Estrita para Gemini API
            if (history.length > 0 && history[0].role !== 'user') {
                history.shift(); // Histórico DEVE iniciar com 'user'
            }
            // Filtra partes com texto vazio (Gemini crasha)
            history = history.filter(h => h.parts && h.parts[0] && h.parts[0].text && typeof h.parts[0].text === 'string' && h.parts[0].text.trim() !== '');

            // Reagrupa caso haja roles subsequentes iguais (Gemini exige alternância estrita)
            const finalHistory = [];
            for (const h of history) {
                if (finalHistory.length === 0) {
                    if (h.role === 'user') finalHistory.push(h);
                } else {
                    if (finalHistory[finalHistory.length - 1].role !== h.role) {
                        finalHistory.push(h);
                    } else {
                        finalHistory[finalHistory.length - 1].parts[0].text += '\n' + h.parts[0].text;
                    }
                }
            }
            history = finalHistory;

            // Garantia extra: O histórico enviado para o .startChat() não pode terminar com 'user'
            // pois o sendMessage logo em seguida fará um push de um novo 'user', quebrando a regra de alternância
            if (history.length > 0 && history[history.length - 1].role === 'user') {
                history.pop();
            }

            let modelName = botSettings.model || 'gemini-2.5-flash';
            if (modelName === 'gemini-1.5-pro' || modelName === 'gemini-1.5-flash') {
                modelName = 'gemini-2.5-flash';
            }
            const model = this.genAI.getGenerativeModel({ 
                model: modelName,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [{
                    functionDeclarations: [
                        {
                            name: "Buscar_janelas_disponiveis",
                            description: "Busca os horários de agendamento disponíveis para um determinado dia.",
                            parameters: { type: "OBJECT", properties: { data_referencia: { type: "STRING", description: "Data YYYY-MM-DD" } }, required: ["data_referencia"] }
                        },
                        {
                            name: "Criar_agendamento",
                            description: "Cria um novo agendamento no sistema para o cliente.",
                            parameters: { type: "OBJECT", properties: { data_hora: { type: "STRING", description: "Data/hora ISO 8601" }, nome_cliente: { type: "STRING" }, assunto: { type: "STRING" } }, required: ["data_hora", "nome_cliente"] }
                        },
                        {
                            name: "Buscar_agendamentos_do_contato",
                            description: "Busca se este cliente já possui algum agendamento ativo.",
                            parameters: { type: "OBJECT", properties: {} }
                        },
                        {
                            name: "Escalar_humano",
                            description: "Transfere o atendimento para um atendente humano.",
                            parameters: { type: "OBJECT", properties: { motivo: { type: "STRING" } }, required: ["motivo"] }
                        },
                        {
                            name: "Enviar_texto_separado",
                            description: "Envia uma mensagem parcial antes da resposta final.",
                            parameters: { type: "OBJECT", properties: { texto: { type: "STRING" } }, required: ["texto"] }
                        },
                        {
                            name: "Atualizar_nome_contato",
                            description: "Atualiza o nome do contato no sistema quando o cliente informar seu nome na conversa ou no resumo de pedidos.",
                            parameters: { type: "OBJECT", properties: { nome_cliente: { type: "STRING" } }, required: ["nome_cliente"] }
                        },
                        {
                            name: "Atualizar_endereco_contato",
                            description: "Salva ou atualiza os dados de endereço do cliente (CEP, rua, número, bairro, cidade, estado, apartamento, bloco, ponto de referência e coordenadas) na ficha de contatos do sistema.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    cep: { type: "STRING", description: "O CEP do cliente (opcional)." },
                                    rua: { type: "STRING", description: "O nome da rua/logradouro (opcional)." },
                                    numero: { type: "STRING", description: "O número da residência (opcional)." },
                                    bairro: { type: "STRING", description: "O bairro (opcional)." },
                                    cidade: { type: "STRING", description: "A cidade (opcional)." },
                                    estado: { type: "STRING", description: "A sigla do estado/UF, ex: SP, RJ (opcional)." },
                                    ap: { type: "STRING", description: "O número do apartamento se residir em condomínio (opcional)." },
                                    bloco: { type: "STRING", description: "O bloco ou torre do apartamento se residir em condomínio (opcional)." },
                                    referencia: { type: "STRING", description: "Ponto de referência para a entrega (opcional)." },
                                    latitude: { type: "STRING", description: "A latitude do endereço (opcional)." },
                                    longitude: { type: "STRING", description: "A longitude do endereço (opcional)." },
                                    notes: { type: "STRING", description: "Anotações adicionais/observações internas sobre o cliente (opcional)." }
                                }
                            }
                        },
                        {
                            name: "Consultar_cep",
                            description: "Consulta informações de endereço completo (rua, bairro, cidade e estado) a partir de um número de CEP fornecido pelo cliente.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    cep: {
                                        type: "STRING",
                                        description: "O número de CEP fornecido pelo cliente (ex: 01001-000 ou 01001000)."
                                    }
                                },
                                required: ["cep"]
                            }
                        },
                        {
                            name: "Consultar_produtos_cardapio",
                            description: "Consulta a lista de produtos, preços, descrições e detalhes do cardápio digital completo da empresa.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    termo_busca: {
                                        type: "STRING",
                                        description: "Termo, palavra-chave ou nome do produto para pesquisar e filtrar na lista (opcional)."
                                    }
                                }
                            }
                        },
                        {
                            name: "Consultar_adicionais_produto",
                            description: "Consulta as opções de adicionais, opcionais, preferências, passos obrigatórios ou grátis de um determinado produto do cardápio.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    nome_produto: {
                                        type: "STRING",
                                        description: "O nome completo ou termo de busca do produto (ex: Costela Burguer)."
                                    }
                                },
                                required: ["nome_produto"]
                            }
                        },
                        {
                            name: "Validar_cliente_cadastrado",
                            description: "Verifica se o cliente já possui cadastro prévio no sistema Gastrofood utilizando o número do seu telefone celular.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    telefone: {
                                        type: "STRING",
                                        description: "Número do telefone celular do cliente com DDD (ex: 11973933247 ou 973933247)."
                                    }
                                },
                                required: ["telefone"]
                            }
                        },
                        {
                            name: "Enviar_pedido_gastrofood",
                            description: "Envia o pedido finalizado e confirmado do cliente para integração no sistema Gastrofood. Retorna o status da criação do pedido.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    payload_pedido: {
                                        type: "OBJECT",
                                        description: "O payload JSON completo do pedido contendo a estrutura jsOrder esperada pela API Gastrofood."
                                    }
                                },
                                required: ["payload_pedido"]
                            }
                        },
                        {
                            name: "Buscar_status_pedido",
                            description: "Busca o status atual de um pedido no Gastrofood utilizando o ID do pedido.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    id_pedido: {
                                        type: "STRING",
                                        description: "O ID do pedido no formato UUID (ex: 50DA243C-4F4F-4293-95C8-34FFC00391D1)."
                                    }
                                },
                                required: ["id_pedido"]
                            }
                        },
                        {
                            name: "Iniciar_transacao_pix",
                            description: "Gera e busca o QR Code e o copia e cola do PIX para o pagamento de um pedido no Gastrofood.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    id_pedido: {
                                        type: "STRING",
                                        description: "O ID do pedido no formato UUID (ex: B7D7ADDD-AC17-4F63-994B-072BE6CE48D4)."
                                    },
                                    id_estab: {
                                        type: "STRING",
                                        description: "O ID do estabelecimento/loja no formato UUID (opcional, usa o padrão se omitido)."
                                    }
                                },
                                required: ["id_pedido"]
                            }
                        },
                        {
                            name: "Cadastrar_cliente_gastrofood",
                            description: "Cadastra um novo cliente no sistema Gastrofood com nome e telefone celular para viabilizar pedidos futuros.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    nome: {
                                        type: "STRING",
                                        description: "Nome completo do cliente a ser cadastrado."
                                    },
                                    telefone: {
                                        type: "STRING",
                                        description: "Número do telefone celular do cliente com DDD (apenas dígitos, ex: 11973933247)."
                                    }
                                },
                                required: ["nome", "telefone"]
                            }
                        }
                    ]
                }]
            });

            const chat = model.startChat({
                history: history,
                generationConfig: {
                    temperature: Number(botSettings.temperature) || 0.7,
                }
            });

            let finalResponseText = '';
            let keepLooping = true;
            let currentMessageText = textMessage;
            let loopCount = 0;
            const MAX_LOOPS = 5;

            const toolExecutionHistory = [];

            // Executa com Function Calling Loop
            while (keepLooping && loopCount < MAX_LOOPS) {
                loopCount++;
                try {
                    const result = await chat.sendMessage(currentMessageText);
                    const response = result.response;
                    const calls = response.functionCalls();

                    if (calls && calls.length > 0) {
                        const call = calls[0];
                        console.log(`[AutomationWorker] AI quer chamar a tool: ${call.name}`);
                        toolExecutionHistory.push({
                            step: loopCount,
                            toolName: call.name,
                            args: call.args
                        });
                        
                        let functionResult = {};

                        if (call.name === "Buscar_janelas_disponiveis") {
                            // Simulação de janelas (Mock para o exemplo, poderia consultar o BD)
                            functionResult = { disponiveis: ["09:00", "10:30", "14:00", "16:00"] };
                        } 
                        else if (call.name === "Criar_agendamento") {
                            const { data, error } = await supabase.from('appointments').insert({
                                tenant_id: tenantId,
                                contact_id: contactId,
                                start_time: call.args.data_hora,
                                end_time: new Date(new Date(call.args.data_hora).getTime() + 60*60*1000).toISOString(),
                                notes: call.args.assunto
                            }).select('id');
                            functionResult = error ? { erro: error.message } : { sucesso: true, id: data[0].id };
                        }
                        else if (call.name === "Buscar_agendamentos_do_contato") {
                            const { data } = await supabase.from('appointments')
                                .select('*')
                                .eq('contact_id', contactId)
                                .in('status', ['scheduled']);
                            functionResult = data && data.length > 0 ? { agendamentos: data } : { agendamentos: [] };
                        }
                        else if (call.name === "Enviar_texto_separado") {
                            if (sock) {
                                await sock.sendMessage(jid, { text: call.args.texto });
                            }
                            functionResult = { status: "Mensagem enviada com sucesso" };
                        }
                        else if (call.name === "Escalar_humano") {
                            if (conversationId) {
                                await supabase.from('conversations').update({ status: 'open', ai_paused: true }).eq('id', conversationId);
                            }
                            functionResult = { status: "Atendimento transferido. Encerre sua participação." };
                        }
                        else if (call.name === "Atualizar_nome_contato") {
                            if (contactId) {
                                await supabase.from('contacts').update({ name: call.args.nome_cliente }).eq('id', contactId);
                            }
                            functionResult = { status: "Nome do contato atualizado com sucesso no sistema para " + call.args.nome_cliente };
                        }
                        else if (call.name === "Atualizar_endereco_contato") {
                            if (contactId) {
                                try {
                                    // 1. Busca os dados atuais do contato
                                    const { data: contact } = await supabase
                                        .from('contacts')
                                        .select('*')
                                        .eq('id', contactId)
                                        .single();
                                    
                                    if (contact) {
                                        let currentAddresses = Array.isArray(contact.addresses) ? [...contact.addresses] : [];
                                        let mainAddr = currentAddresses[0] || {};
                                        
                                        // 2. Extrai e mescla os dados fornecidos com os existentes
                                        const finalCep = call.args.cep !== undefined ? String(call.args.cep).replace(/\D/g, '') : (mainAddr.cep || contact.cep || '');
                                        const finalStreet = call.args.rua !== undefined ? call.args.rua : (mainAddr.street || mainAddr.address_street || contact.address_street || '');
                                        const finalNumber = call.args.numero !== undefined ? call.args.numero : (mainAddr.number || mainAddr.address_number || contact.address_number || '');
                                        const finalNeighborhood = call.args.bairro !== undefined ? call.args.bairro : (mainAddr.neighborhood || mainAddr.address_neighborhood || contact.address_neighborhood || '');
                                        const finalCity = call.args.cidade !== undefined ? call.args.cidade : (mainAddr.city || mainAddr.address_city || contact.address_city || '');
                                        const finalState = call.args.estado !== undefined ? call.args.estado : (mainAddr.state || mainAddr.address_state || contact.address_state || '');
                                        const finalApartment = call.args.ap !== undefined ? call.args.ap : (mainAddr.apartment || mainAddr.ap || contact.ap || '');
                                        const finalBlock = call.args.bloco !== undefined ? call.args.bloco : (mainAddr.block || contact.block || '');
                                        const finalReference = call.args.referencia !== undefined ? call.args.referencia : (mainAddr.reference || contact.reference || '');
                                        
                                        // 3. Determina as coordenadas
                                        let finalLatitude = mainAddr.latitude || contact.latitude || '';
                                        let finalLongitude = mainAddr.longitude || contact.longitude || '';
                                        
                                        if (call.args.latitude !== undefined && call.args.longitude !== undefined) {
                                            finalLatitude = call.args.latitude;
                                            finalLongitude = call.args.longitude;
                                        } else {
                                            // Se o CEP ou a rua mudaram, recalcula a geolocalização
                                            const cepChanged = call.args.cep !== undefined && String(call.args.cep).replace(/\D/g, '') !== String(contact.cep || '').replace(/\D/g, '');
                                            const streetChanged = call.args.rua !== undefined && call.args.rua !== contact.address_street;
                                            const numChanged = call.args.numero !== undefined && call.args.numero !== contact.address_number;
                                            
                                            if (cepChanged || streetChanged || numChanged || !finalLatitude || !finalLongitude) {
                                                const coords = await getCoordsFromAddress(finalCep, finalStreet, finalNumber, finalCity, finalState);
                                                if (coords.latitude && coords.longitude) {
                                                    finalLatitude = coords.latitude;
                                                    finalLongitude = coords.longitude;
                                                }
                                            }
                                        }
                                        
                                        // 4. Monta o novo endereço principal
                                        const updatedMainAddr = {
                                            cep: finalCep,
                                            street: finalStreet,
                                            number: finalNumber,
                                            neighborhood: finalNeighborhood,
                                            city: finalCity,
                                            state: finalState,
                                            apartment: finalApartment,
                                            block: finalBlock,
                                            reference: finalReference,
                                            latitude: finalLatitude,
                                            longitude: finalLongitude
                                        };
                                        
                                        if (currentAddresses.length === 0) {
                                            currentAddresses.push(updatedMainAddr);
                                        } else {
                                            currentAddresses[0] = {
                                                ...currentAddresses[0],
                                                ...updatedMainAddr
                                            };
                                        }
                                        
                                        // 5. Monta payload de atualização para o Supabase
                                        const updatePayload = {
                                            cep: finalCep,
                                            address_street: finalStreet,
                                            address_number: finalNumber,
                                            address_neighborhood: finalNeighborhood,
                                            address_city: finalCity,
                                            address_state: finalState,
                                            ap: finalApartment,
                                            block: finalBlock,
                                            reference: finalReference,
                                            latitude: finalLatitude,
                                            longitude: finalLongitude,
                                            addresses: currentAddresses
                                        };
                                        
                                        if (call.args.notes !== undefined) {
                                            updatePayload.notes = call.args.notes;
                                        }
                                        
                                        await supabase.from('contacts').update(updatePayload).eq('id', contactId);
                                        console.log(`[AutomationWorker - Endereço] Contato ${contactId} atualizado com sucesso. Payload:`, updatePayload);
                                        functionResult = { status: "Dados de endereço do contato atualizados com sucesso no sistema (colunas raiz e múltiplos endereços sincronizados)." };
                                    } else {
                                        functionResult = { erro: "Contato não localizado na base de dados." };
                                    }
                                } catch (errUpdate) {
                                    console.error("[AutomationWorker - Endereço] Erro ao atualizar endereço do contato:", errUpdate);
                                    functionResult = { erro: "Erro ao processar a atualização do endereço no banco de dados." };
                                }
                            } else {
                                functionResult = { erro: "Identificação do contato não fornecida no contexto." };
                            }
                        }
                        else if (call.name === "Consultar_cep") {
                            const rawCep = String(call.args.cep || '').replace(/\D/g, '');
                            if (rawCep.length !== 8) {
                                functionResult = { erro: "O CEP fornecido é inválido. Deve conter exatamente 8 algarismos." };
                            } else {
                                let cepSuccess = false;
                                try {
                                    const cepUrl = companySettings.cep_json_url || CEP_DEFAULT_URL;
                                    const cepToken = companySettings.cep_json_token || GASTROFOOD_DEFAULT_TOKEN;
                                    const cepPayloadTemplate = companySettings.cep_json_payload || DEFAULT_CEP_PAYLOAD;

                                    let bodyObj = { ACep: rawCep };
                                    if (cepPayloadTemplate) {
                                        try {
                                            const parsed = typeof cepPayloadTemplate === 'string' ? JSON.parse(cepPayloadTemplate) : cepPayloadTemplate;
                                            bodyObj = { ...parsed };
                                            const cepKey = Object.keys(bodyObj).find(k => k.toLowerCase().includes('cep')) || 'ACep';
                                            bodyObj[cepKey] = rawCep;
                                        } catch (e) {}
                                    }
                                    if (companySettings && companySettings.gfood_store_id) {
                                        bodyObj = injectStoreId(bodyObj, companySettings.gfood_store_id);
                                    }

                                    const headers = { 'Content-Type': 'application/json' };
                                    if (cepToken) {
                                        headers['Authorization'] = cepToken.startsWith('Bearer ') ? cepToken : `Bearer ${cepToken}`;
                                    }

                                    console.log(`[AutomationWorker - CEP] Consultando CEP ${rawCep} via Gastrofood API...`);
                                    logGastrofoodCall({
                                        direction: 'request',
                                        action: 'Validar CEP',
                                        method: 'POST',
                                        url: cepUrl,
                                        payload: bodyObj
                                    });

                                    const response = await fetch(cepUrl, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify(bodyObj)
                                    });

                                    if (response.ok) {
                                        const resData = await response.json();
                                        logGastrofoodCall({
                                            direction: 'response',
                                            action: 'Validar CEP',
                                            method: 'POST',
                                            url: cepUrl,
                                            status: response.status,
                                            response: resData
                                        });

                                        const data = resData.data || resData;
                                        if (data && !data.erro && !data.error && (data.logradouro || data.Logradouro || data.rua || data.Rua)) {
                                            functionResult = {
                                                logradouro: data.logradouro || data.Logradouro || data.rua || data.Rua || '',
                                                bairro: data.bairro || data.Bairro || '',
                                                cidade: data.cidade || data.Cidade || data.localidade || data.Localidade || '',
                                                estado: data.estado || data.Estado || data.uf || data.Uf || '',
                                                cep: data.cep || data.Cep || rawCep
                                            };
                                            const coords = await getCoordsFromAddress(rawCep, functionResult.logradouro, '', functionResult.cidade, functionResult.estado);
                                            functionResult.latitude = coords.latitude;
                                            functionResult.longitude = coords.longitude;
                                            cepSuccess = true;
                                        } else {
                                            console.warn(`[AutomationWorker - CEP] Gastrofood retornou resposta vazia ou erro para CEP ${rawCep}:`, data);
                                        }
                                    } else {
                                        const errText = await response.text();
                                        console.warn(`[AutomationWorker - CEP] Falha HTTP na consulta de CEP ${rawCep} via Gastrofood (Status: ${response.status}). Detalhes: ${errText}`);
                                        logGastrofoodCall({
                                            direction: 'error',
                                            action: 'Validar CEP',
                                            method: 'POST',
                                            url: cepUrl,
                                            status: response.status,
                                            error: errText
                                        });
                                    }
                                } catch (errGastroCep) {
                                    console.error("[AutomationWorker - CEP] Erro na consulta do CEP via Gastrofood API:", errGastroCep);
                                    logGastrofoodCall({
                                        direction: 'error',
                                        action: 'Validar CEP',
                                        method: 'POST',
                                        url: cepUrl,
                                        error: errGastroCep.message
                                    });
                                }

                                // Fallback para ViaCEP se falhar ou não retornar dados válidos
                                if (!cepSuccess) {
                                    try {
                                        console.log(`[AutomationWorker - CEP] Consultando CEP ${rawCep} na ViaCEP (Fallback)...`);
                                        const response = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
                                        if (response.ok) {
                                            const data = await response.json();
                                            if (data.erro) {
                                                functionResult = { erro: "O CEP pesquisado não foi localizado na base dos Correios." };
                                            } else {
                                                functionResult = {
                                                    logradouro: data.logradouro || '',
                                                    bairro: data.bairro || '',
                                                    cidade: data.localidade || '',
                                                    estado: data.uf || '',
                                                    cep: data.cep || ''
                                                };
                                                const coords = await getCoordsFromAddress(rawCep, functionResult.logradouro, '', functionResult.cidade, functionResult.estado);
                                                functionResult.latitude = coords.latitude;
                                                functionResult.longitude = coords.longitude;
                                                cepSuccess = true;
                                            }
                                        } else {
                                            functionResult = { erro: "Serviço de busca de CEP temporariamente indisponível." };
                                        }
                                    } catch (cepErr) {
                                        console.error("[AutomationWorker - CEP] Erro na requisição ViaCEP:", cepErr);
                                        functionResult = { erro: "Erro ao conectar-se ao servidor de CEP." };
                                    }
                                }

                                // Auto-save address if contact does not have one
                                if (contactId && cepSuccess && functionResult && !functionResult.erro) {
                                    try {
                                        const { data: contact } = await supabase.from('contacts').select('*').eq('id', contactId).single();
                                        if (contact && (!contact.address_street || !contact.cep)) {
                                            let currentAddresses = Array.isArray(contact.addresses) ? [...contact.addresses] : [];
                                            const updatedMainAddr = {
                                                cep: rawCep,
                                                street: functionResult.logradouro || '',
                                                number: '',
                                                neighborhood: functionResult.bairro || '',
                                                city: functionResult.cidade || '',
                                                state: functionResult.estado || '',
                                                apartment: '',
                                                block: '',
                                                reference: '',
                                                latitude: functionResult.latitude || '',
                                                longitude: functionResult.longitude || ''
                                            };
                                            
                                            if (currentAddresses.length === 0) {
                                                currentAddresses.push(updatedMainAddr);
                                            } else {
                                                currentAddresses[0] = {
                                                    ...currentAddresses[0],
                                                    ...updatedMainAddr
                                                };
                                            }
                                            
                                            const updatePayload = {
                                                cep: rawCep,
                                                address_street: functionResult.logradouro || '',
                                                address_neighborhood: functionResult.bairro || '',
                                                address_city: functionResult.cidade || '',
                                                address_state: functionResult.estado || '',
                                                latitude: functionResult.latitude || '',
                                                longitude: functionResult.longitude || '',
                                                addresses: currentAddresses
                                            };
                                            await supabase.from('contacts').update(updatePayload).eq('id', contactId);
                                            console.log(`[AutomationWorker - CEP] Endereço do contato ${contactId} atualizado automaticamente via CEP (colunas e addresses JSONB):`, updatePayload);
                                        }
                                    } catch (dbErr) {
                                        console.error('[AutomationWorker - CEP] Erro ao atualizar endereço do contato:', dbErr);
                                    }
                                }
                            }
                        }
                        else if (call.name === "Validar_cliente_cadastrado") {
                            const rawPhone = String(call.args.telefone || '').replace(/\D/g, '');
                            if (!rawPhone) {
                                functionResult = { erro: "O número de telefone é obrigatório para verificar o cadastro." };
                            } else {
                                try {
                                    const clienteUrl = companySettings.cliente_json_url || CLIENTE_DEFAULT_URL;
                                    const clienteToken = companySettings.cliente_json_token || GASTROFOOD_DEFAULT_TOKEN;
                                    const clientePayloadTemplate = companySettings.cliente_json_payload || DEFAULT_CLIENTE_PAYLOAD;

                                    let bodyObj = { ATelefone: rawPhone };
                                    if (clientePayloadTemplate) {
                                        try {
                                            const parsed = typeof clientePayloadTemplate === 'string' ? JSON.parse(clientePayloadTemplate) : clientePayloadTemplate;
                                            bodyObj = { ...parsed };
                                            const phoneKey = Object.keys(bodyObj).find(k => k.toLowerCase().includes('tel') || k.toLowerCase().includes('fone')) || 'ATelefone';
                                            bodyObj[phoneKey] = rawPhone;
                                        } catch (e) {}
                                    }
                                    if (companySettings && companySettings.gfood_store_id) {
                                        bodyObj = injectStoreId(bodyObj, companySettings.gfood_store_id);
                                    }

                                    const headers = { 'Content-Type': 'application/json' };
                                    if (clienteToken) {
                                        headers['Authorization'] = clienteToken.startsWith('Bearer ') ? clienteToken : `Bearer ${clienteToken}`;
                                    }

                                    console.log(`[AutomationWorker - Cliente] Validando telefone ${rawPhone} via Gastrofood API...`);
                                    logGastrofoodCall({
                                        direction: 'request',
                                        action: 'Validar Cliente',
                                        method: 'POST',
                                        url: clienteUrl,
                                        payload: bodyObj
                                    });

                                    const response = await fetch(clienteUrl, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify(bodyObj)
                                    });

                                    if (response.ok) {
                                        const resData = await response.json();
                                        logGastrofoodCall({
                                            direction: 'response',
                                            action: 'Validar Cliente',
                                            method: 'POST',
                                            url: clienteUrl,
                                            status: response.status,
                                            response: resData
                                        });

                                        const data = resData.data || resData;
                                        functionResult = {
                                            cadastrado: data.cadastrado !== false && !data.erro && (!!data.id || !!data.IdUsuario || !!data.NomeRazao || !!data.nome || !!data.customer || data.status === 200),
                                            dados_cadastro: data
                                        };
                                    } else {
                                        const errText = await response.text();
                                        console.error(`[AutomationWorker - Cliente] Falha HTTP ao validar cliente ${rawPhone} (Status: ${response.status}). Detalhes: ${errText}`);
                                        logGastrofoodCall({
                                            direction: 'error',
                                            action: 'Validar Cliente',
                                            method: 'POST',
                                            url: clienteUrl,
                                            status: response.status,
                                            error: errText
                                        });
                                        functionResult = { erro: `Serviço de validação de cliente indisponível (Status: ${response.status})` };
                                    }
                                } catch (errCli) {
                                    console.error("[AutomationWorker - Cliente] Erro ao validar telefone:", errCli);
                                    logGastrofoodCall({
                                        direction: 'error',
                                        action: 'Validar Cliente',
                                        method: 'POST',
                                        url: clienteUrl,
                                        error: errCli.message
                                    });
                                    functionResult = { erro: `Erro ao conectar-se ao serviço de validação: ${errCli.message}` };
                                }
                            }
                        }
                        else if (call.name === "Enviar_pedido_gastrofood") {
                            const payloadPedido = call.args.payload_pedido;
                            if (!payloadPedido) {
                                functionResult = { erro: "O payload do pedido é obrigatório." };
                            } else {
                                try {
                                    const pedidoOrigem = botSettings?.pedido_origem || 'company';
                                    const pedidoUrl = (pedidoOrigem === 'api' && botSettings?.pedido_json_url)
                                        ? botSettings.pedido_json_url
                                        : (companySettings.pedido_json_url || PEDIDO_DEFAULT_URL);
                                    const pedidoToken = (pedidoOrigem === 'api' && botSettings?.pedido_json_token)
                                        ? botSettings.pedido_json_token
                                        : (companySettings.pedido_json_token || GASTROFOOD_DEFAULT_TOKEN);

                                    const headers = { 'Content-Type': 'application/json' };
                                    if (pedidoToken) {
                                        headers['Authorization'] = pedidoToken.startsWith('Bearer ') ? pedidoToken : `Bearer ${pedidoToken}`;
                                    }

                                    let finalPayload = payloadPedido;
                                    if (typeof finalPayload === 'string') {
                                        try {
                                            finalPayload = JSON.parse(finalPayload);
                                        } catch (e) {}
                                    }
                                    if (companySettings && companySettings.gfood_store_id) {
                                        finalPayload = injectStoreId(finalPayload, companySettings.gfood_store_id);
                                    }


                                    console.log(`[AutomationWorker - Pedido] Enviando pedido para Gastrofood...`);
                                    logGastrofoodCall({
                                        direction: 'request',
                                        action: 'Enviar Pedido',
                                        method: 'POST',
                                        url: pedidoUrl,
                                        payload: finalPayload
                                    });

                                    const response = await fetch(pedidoUrl, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify(finalPayload)
                                    });

                                    if (response.ok) {
                                        const resData = await response.json();
                                        logGastrofoodCall({
                                            direction: 'response',
                                            action: 'Enviar Pedido',
                                            method: 'POST',
                                            url: pedidoUrl,
                                            status: response.status,
                                            response: resData
                                        });

                                        functionResult = {
                                            sucesso: response.status === 200 || response.status === 201,
                                            status: response.status,
                                            dados_resposta: resData
                                        };
                                        if (!functionResult.sucesso) {
                                            console.error(`[AutomationWorker - Pedido] Gastrofood recusou o pedido (Status: ${response.status}). Resposta:`, resData);
                                        }
                                    } else {
                                        const errText = await response.text();
                                        console.error(`[AutomationWorker - Pedido] Falha HTTP ao enviar pedido (Status: ${response.status}). Detalhes: ${errText}`);
                                        logGastrofoodCall({
                                            direction: 'error',
                                            action: 'Enviar Pedido',
                                            method: 'POST',
                                            url: pedidoUrl,
                                            status: response.status,
                                            error: errText
                                        });
                                        functionResult = { erro: `Erro ao enviar pedido para o Gastrofood (Status: ${response.status}). Detalhes: ${errText}` };
                                    }
                                } catch (errPed) {
                                    console.error("[AutomationWorker - Pedido] Erro ao enviar pedido:", errPed);
                                    logGastrofoodCall({
                                        direction: 'error',
                                        action: 'Enviar Pedido',
                                        method: 'POST',
                                        url: pedidoUrl,
                                        error: errPed.message
                                    });
                                    functionResult = { erro: `Erro ao conectar-se ao serviço de pedidos: ${errPed.message}` };
                                }
                            }
                        }
                        else if (call.name === "Buscar_status_pedido") {
                            const idPedido = call.args.id_pedido;
                            if (!idPedido) {
                                functionResult = { erro: "O ID do pedido é obrigatório para consultar o status." };
                            } else {
                                try {
                                    const statusUrl = companySettings.status_pedido_json_url || STATUS_PEDIDO_DEFAULT_URL;
                                    const statusToken = companySettings.status_pedido_json_token || GASTROFOOD_DEFAULT_TOKEN;

                                    let requestUrl = statusUrl;
                                    if (requestUrl.includes('BnPedido(')) {
                                        requestUrl = requestUrl.replace(/BnPedido\([^)]+\)/, `BnPedido(${idPedido})`);
                                    } else {
                                        const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
                                        if (uuidRegex.test(requestUrl)) {
                                            requestUrl = requestUrl.replace(uuidRegex, idPedido);
                                        } else {
                                            requestUrl = requestUrl.endsWith('/') ? `${requestUrl}${idPedido}` : `${requestUrl}/${idPedido}`;
                                        }
                                    }

                                    const headers = {};
                                    if (statusToken) {
                                        headers['Authorization'] = statusToken.startsWith('Bearer ') ? statusToken : `Bearer ${statusToken}`;
                                    }

                                    console.log(`[AutomationWorker - Status Pedido] Buscando status do pedido ${idPedido} via Gastrofood API...`);
                                    logGastrofoodCall({
                                        direction: 'request',
                                        action: 'Consultar Status',
                                        method: 'GET',
                                        url: requestUrl,
                                        payload: null
                                    });

                                    const response = await fetch(requestUrl, {
                                        method: 'GET',
                                        headers
                                    });

                                    if (response.ok) {
                                        const resData = await response.json();
                                        logGastrofoodCall({
                                            direction: 'response',
                                            action: 'Consultar Status',
                                            method: 'GET',
                                            url: requestUrl,
                                            status: response.status,
                                            response: resData
                                        });

                                        functionResult = {
                                            sucesso: true,
                                            status_http: response.status,
                                            dados: resData.data || resData
                                        };
                                    } else {
                                        const errText = await response.text();
                                        console.error(`[AutomationWorker - Status Pedido] Falha HTTP ao buscar status (Status: ${response.status}). Detalhes: ${errText}`);
                                        logGastrofoodCall({
                                            direction: 'error',
                                            action: 'Consultar Status',
                                            method: 'GET',
                                            url: requestUrl,
                                            status: response.status,
                                            error: errText
                                        });
                                        functionResult = { erro: `Erro ao buscar status do pedido (Status: ${response.status})` };
                                    }
                                } catch (errStat) {
                                    console.error("[AutomationWorker - Status Pedido] Erro ao buscar status:", errStat);
                                    logGastrofoodCall({
                                        direction: 'error',
                                        action: 'Consultar Status',
                                        method: 'GET',
                                        url: requestUrl,
                                        error: errStat.message
                                    });
                                    functionResult = { erro: `Erro ao conectar-se ao serviço de status de pedido: ${errStat.message}` };
                                }
                            }
                        }
                        else if (call.name === "Iniciar_transacao_pix") {
                            const idPedido = call.args.id_pedido;
                            const idEstab = call.args.id_estab;
                            if (!idPedido) {
                                functionResult = { erro: "O ID do pedido é obrigatório para iniciar a transação PIX." };
                            } else {
                                try {
                                    const pixUrl = companySettings.pagamento_pix_json_url || PAGAMENTO_PIX_DEFAULT_URL;
                                    const pixToken = companySettings.pagamento_pix_json_token || GASTROFOOD_DEFAULT_TOKEN;
                                    const pixPayloadTemplate = companySettings.pagamento_pix_json_payload || DEFAULT_PAGAMENTO_PIX_PAYLOAD;

                                    let bodyObj = {
                                        APaymentData: {},
                                        AIdEstab: companySettings.gfood_store_id || idEstab || "6D0187D9-E905-4479-AB15-B908F0222607",
                                        AIdPedido: idPedido
                                    };

                                    if (pixPayloadTemplate) {
                                        try {
                                            const parsed = typeof pixPayloadTemplate === 'string' ? JSON.parse(pixPayloadTemplate) : pixPayloadTemplate;
                                            bodyObj = { ...parsed };
                                            bodyObj.AIdPedido = idPedido;
                                        } catch (e) {}
                                    }
                                    if (companySettings && companySettings.gfood_store_id) {
                                        bodyObj = injectStoreId(bodyObj, companySettings.gfood_store_id);
                                    } else if (idEstab) {
                                        bodyObj = injectStoreId(bodyObj, idEstab);
                                    }

                                    const headers = { 'Content-Type': 'application/json' };
                                    if (pixToken) {
                                        headers['Authorization'] = pixToken.startsWith('Bearer ') ? pixToken : `Bearer ${pixToken}`;
                                    }

                                    console.log(`[AutomationWorker - Pagamento PIX] Iniciando transação PIX para pedido ${idPedido}...`);
                                    logGastrofoodCall({
                                        direction: 'request',
                                        action: 'Iniciar Pix',
                                        method: 'POST',
                                        url: pixUrl,
                                        payload: bodyObj
                                    });

                                    const response = await fetch(pixUrl, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify(bodyObj)
                                    });

                                    if (response.ok) {
                                        const resData = await response.json();
                                        logGastrofoodCall({
                                            direction: 'response',
                                            action: 'Iniciar Pix',
                                            method: 'POST',
                                            url: pixUrl,
                                            status: response.status,
                                            response: resData
                                        });

                                        functionResult = {
                                            sucesso: true,
                                            status_http: response.status,
                                            dados: resData.data || resData
                                        };
                                    } else {
                                        const errText = await response.text();
                                        console.error(`[AutomationWorker - Pagamento PIX] Falha HTTP ao iniciar PIX (Status: ${response.status}). Detalhes: ${errText}`);
                                        logGastrofoodCall({
                                            direction: 'error',
                                            action: 'Iniciar Pix',
                                            method: 'POST',
                                            url: pixUrl,
                                            status: response.status,
                                            error: errText
                                        });
                                        functionResult = { erro: `Erro ao iniciar transação PIX (Status: ${response.status})` };
                                    }
                                } catch (errPix) {
                                    console.error("[AutomationWorker - Pagamento PIX] Erro ao iniciar PIX:", errPix);
                                    logGastrofoodCall({
                                        direction: 'error',
                                        action: 'Iniciar Pix',
                                        method: 'POST',
                                        url: pixUrl,
                                        error: errPix.message
                                    });
                                    functionResult = { erro: `Erro ao conectar-se ao serviço de pagamento PIX: ${errPix.message}` };
                                }
                            }
                        }
                        else if (call.name === "Cadastrar_cliente_gastrofood") {
                            const nome = call.args.nome;
                            const telefone = String(call.args.telefone || '').replace(/\D/g, '');
                            if (!nome || !telefone) {
                                functionResult = { erro: "Nome e telefone celular são obrigatórios para cadastrar o cliente." };
                            } else {
                                try {
                                    const cadastrarUrl = companySettings.cadastro_cliente_json_url || CADASTRO_CLIENTE_DEFAULT_URL;
                                    const cadastrarToken = companySettings.cadastro_cliente_json_token || GASTROFOOD_DEFAULT_TOKEN;
                                    const cadastrarPayloadTemplate = companySettings.cadastro_cliente_json_payload || DEFAULT_CADASTRO_CLIENTE_PAYLOAD;

                                    let bodyObj = {
                                        JSONUser: {
                                            name: nome,
                                            phone: telefone,
                                            verified: true
                                        }
                                    };

                                    if (cadastrarPayloadTemplate) {
                                        try {
                                            const parsed = typeof cadastrarPayloadTemplate === 'string' ? JSON.parse(cadastrarPayloadTemplate) : cadastrarPayloadTemplate;
                                            bodyObj = { ...parsed };
                                            if (!bodyObj.JSONUser) bodyObj.JSONUser = {};
                                            bodyObj.JSONUser.name = nome;
                                            bodyObj.JSONUser.phone = telefone;
                                            bodyObj.JSONUser.verified = true;
                                        } catch (e) {}
                                    }
                                    if (companySettings && companySettings.gfood_store_id) {
                                        bodyObj = injectStoreId(bodyObj, companySettings.gfood_store_id);
                                    }

                                    const headers = { 'Content-Type': 'application/json' };
                                    if (cadastrarToken) {
                                        headers['Authorization'] = cadastrarToken.startsWith('Bearer ') ? cadastrarToken : `Bearer ${cadastrarToken}`;
                                    }

                                    console.log(`[AutomationWorker - Cadastro Cliente] Cadastrando cliente ${nome} (${telefone}) via Gastrofood API...`);
                                    logGastrofoodCall({
                                        direction: 'request',
                                        action: 'Cadastrar Cliente',
                                        method: 'POST',
                                        url: cadastrarUrl,
                                        payload: bodyObj
                                    });

                                    const response = await fetch(cadastrarUrl, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify(bodyObj)
                                    });

                                    if (response.ok) {
                                        const resData = await response.json();
                                        logGastrofoodCall({
                                            direction: 'response',
                                            action: 'Cadastrar Cliente',
                                            method: 'POST',
                                            url: cadastrarUrl,
                                            status: response.status,
                                            response: resData
                                        });

                                        functionResult = {
                                            sucesso: response.status === 200 || response.status === 201,
                                            status_http: response.status,
                                            dados: resData.data || resData
                                        };
                                    } else {
                                        const errText = await response.text();
                                        console.error(`[AutomationWorker - Cadastro Cliente] Falha HTTP ao cadastrar cliente (Status: ${response.status}). Detalhes: ${errText}`);
                                        logGastrofoodCall({
                                            direction: 'error',
                                            action: 'Cadastrar Cliente',
                                            method: 'POST',
                                            url: cadastrarUrl,
                                            status: response.status,
                                            error: errText
                                        });
                                        functionResult = { erro: `Erro ao cadastrar cliente no sistema (Status: ${response.status})` };
                                    }
                                } catch (errCad) {
                                    console.error("[AutomationWorker - Cadastro Cliente] Erro ao cadastrar cliente:", errCad);
                                    logGastrofoodCall({
                                        direction: 'error',
                                        action: 'Cadastrar Cliente',
                                        method: 'POST',
                                        url: cadastrarUrl,
                                        error: errCad.message
                                    });
                                    functionResult = { erro: `Erro ao conectar-se ao serviço de cadastro de cliente: ${errCad.message}` };
                                }
                            }
                        }
                        else if (call.name === "Consultar_produtos_cardapio") {
                            try {
                                console.log(`[AutomationWorker - Cardápio] Consultando produtos do tenant ${tenantId}...`);
                                
                                const cache = await getOrUpdateCardapioCache(tenantId, companySettings, botSettings);
                                const productsList = cache.produtos || [];
                                const groupsList = cache.grupos || [];
                                
                                const gruposMap = {};
                                groupsList.forEach(g => {
                                    gruposMap[g.id] = g.descricao;
                                });

                                let filteredProducts = productsList;
                                const termo = call.args.termo_busca;
                                if (termo && termo.trim() !== '') {
                                    const searchLower = termo.toLowerCase();
                                    filteredProducts = filteredProducts.filter(p => 
                                        (p.name && p.name.toLowerCase().includes(searchLower)) ||
                                        (p.description && p.description.toLowerCase().includes(searchLower))
                                    );
                                }

                                let baseCardapioUrl = companySettings.link_cardapio || '';
                                if (baseCardapioUrl) {
                                    baseCardapioUrl = baseCardapioUrl.replace(/\/+$/, '');
                                } else {
                                    baseCardapioUrl = 'https://www.burguerplus.com.br/loja/burguerplus';
                                }

                                // Se a URL não contiver /loja/, adiciona o slug de forma inteligente
                                if (baseCardapioUrl && !baseCardapioUrl.includes('/loja/')) {
                                    if (baseCardapioUrl.includes('burguerplus') || baseCardapioUrl.includes('burgerplus')) {
                                        baseCardapioUrl = `${baseCardapioUrl}/loja/burguerplus`;
                                    } else {
                                        const companySlug = (companySettings.slug || companyName || 'loja').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
                                        baseCardapioUrl = `${baseCardapioUrl}/loja/${companySlug}`;
                                    }
                                }

                                const formattedProducts = filteredProducts.slice(0, 30).map(p => ({
                                    produto_id: p.id,
                                    categoria: gruposMap[p.grupo_id] || 'Outros',
                                    nome: p.name,
                                    descricao: p.description || 'Sem descrição',
                                    preco: Number(p.price || 0),
                                    link_imagem: p.image || '',
                                    link_produto: `${baseCardapioUrl}/produto/${p.id}`
                                }));

                                functionResult = { 
                                    origem: cache.origem,
                                    total_encontrados: filteredProducts.length,
                                    produtos: formattedProducts 
                                };
                            } catch (errCard) {
                                console.error('[AutomationWorker - Cardápio] Erro na busca de produtos:', errCard);
                                functionResult = { erro: `Erro ao processar cardápio: ${errCard.message}` };
                            }
                        }
                        else if (call.name === "Consultar_adicionais_produto") {
                            const nomeProduto = call.args.nome_produto;
                            if (!nomeProduto || nomeProduto.trim() === '') {
                                functionResult = { erro: "O nome do produto é obrigatório para consultar os adicionais." };
                            } else {
                                try {
                                    console.log(`[AutomationWorker - Adicionais] Buscando adicionais de "${nomeProduto}"...`);
                                    
                                    const cache = await getOrUpdateCardapioCache(tenantId, companySettings, botSettings);
                                    const productsList = cache.produtos || [];
                                    
                                    const searchLower = nomeProduto.toLowerCase();
                                    const matchingProducts = productsList.filter(p => 
                                        p.name && p.name.toLowerCase().includes(searchLower)
                                    );

                                    if (matchingProducts.length === 0) {
                                        functionResult = { erro: `Produto "${nomeProduto}" não localizado no cardápio.` };
                                    } else {
                                        const produto = matchingProducts[0];
                                        
                                        let passosMapeados = cache.adicionais.get(produto.id);
                                        
                                        if (!passosMapeados) {
                                            console.log(`[AutomationWorker - Adicionais] Cache MISS para adicionais do produto ${produto.name} (${produto.id}). Buscando do BD...`);
                                            const { data: dbPassos, error: errPassos } = await supabase
                                                .from('cardapio_passos')
                                                .select('*')
                                                .eq('produto_id', produto.id)
                                                .eq('tenant_id', tenantId)
                                                .order('ordem', { ascending: true });

                                            if (errPassos) throw errPassos;

                                            if (dbPassos && dbPassos.length > 0) {
                                                passosMapeados = [];
                                                for (const passo of dbPassos) {
                                                    const { data: dbOpcoes, error: errOpcoes } = await supabase
                                                        .from('cardapio_opcoes')
                                                        .select('*')
                                                        .eq('passo_id', passo.id)
                                                        .eq('tenant_id', tenantId)
                                                        .order('descricao', { ascending: true });

                                                    if (errOpcoes) throw errOpcoes;

                                                    passosMapeados.push({
                                                        passo_id: passo.id,
                                                        pergunta_titulo: passo.pergunta || passo.sub_titulo || 'Opções',
                                                        sub_titulo: passo.sub_titulo || '',
                                                        qtd_minima: passo.qtd_min || 0,
                                                        qtd_maxima: passo.qtd_max || 1,
                                                        obrigatorio: (passo.qtd_min || 0) > 0,
                                                        opcoes: (dbOpcoes || []).map(opt => ({
                                                            opcao_id: opt.id,
                                                            descricao: opt.descricao,
                                                            preco: Number(opt.preco || 0),
                                                            ativo: opt.ativo
                                                        }))
                                                    });
                                                }
                                                cache.adicionais.set(produto.id, passosMapeados);
                                            } else {
                                                passosMapeados = [];
                                            }
                                        } else {
                                            console.log(`[AutomationWorker - Adicionais] Cache HIT para adicionais do produto ${produto.name} (${produto.id})`);
                                        }

                                        if (passosMapeados.length === 0) {
                                            functionResult = { 
                                                produto_id: produto.id,
                                                produto_nome: produto.name,
                                                mensagem: "Este produto não possui adicionais ou opcionais cadastrados." 
                                            };
                                        } else {
                                            functionResult = {
                                                produto_id: produto.id,
                                                produto_nome: produto.name,
                                                passos_adicionais: passosMapeados
                                            };
                                        }
                                    }
                                } catch (errAdd) {
                                    console.error('[AutomationWorker - Adicionais] Erro ao buscar adicionais:', errAdd);
                                    functionResult = { erro: `Erro ao buscar opcionais: ${errAdd.message}` };
                                }
                            }
                        }
                        else {
                            functionResult = { erro: "Ferramenta desconhecida" };
                        }

                        // Registra o resultado no histórico de execução de tools
                        if (toolExecutionHistory.length > 0) {
                            toolExecutionHistory[toolExecutionHistory.length - 1].result = functionResult;
                        }

                        // Envia o resultado da função de volta para a IA continuar o raciocínio
                        currentMessageText = [{
                            functionResponse: {
                                name: call.name,
                                response: functionResult
                            }
                        }];
                    } else {
                        // Sem tools a chamar, extrai texto final
                        finalResponseText = response.text();
                        keepLooping = false;
                    }
                } catch (loopError) {
                    const errMsg = loopError?.message || String(loopError);
                    const errStatus = loopError?.status || loopError?.response?.status || 'N/A';
                    const errName = loopError?.name || loopError?.constructor?.name || 'UnknownError';
                    
                    const errorDetail = `[AutomationWorker] Erro crítico no loop de função (Iteração ${loopCount}) para conversa ${conversationId}:\n` +
                        `Mensagem de gatilho do cliente: "${textMessage}"\n` +
                        `Erro: ${errName} - ${errMsg} (Status: ${errStatus})\n` +
                        `Histórico de chamadas de tools executadas até a falha:\n` +
                        JSON.stringify(toolExecutionHistory, null, 2);

                    console.error(errorDetail);
                    
                    finalResponseText = "Desculpe, ocorreu um pequeno erro interno ao processar sua requisição. Pode tentar novamente?";
                    keepLooping = false;
                }
            }

            if (loopCount >= MAX_LOOPS) {
                const loopDetail = `[AutomationWorker] Falha de Execução: Loop infinito de I.A. (mais de 5 iterações) detectado na conversa ${conversationId}.\n` +
                    `Mensagem de gatilho do cliente: "${textMessage}"\n` +
                    `Histórico completo de chamadas e retornos de ferramentas durante o loop:\n` +
                    JSON.stringify(toolExecutionHistory, null, 2) + `\n` +
                    `Isso costuma acontecer quando o prompt do bot instrui a IA a chamar ferramentas repetidamente ou quando o retorno de uma ferramenta não satisfaz os critérios da IA. Corrija o prompt ou adicione validações nas ferramentas correspondentes.`;

                console.error(loopDetail);
                finalResponseText = finalResponseText || "Desculpe, encontrei uma dificuldade técnica. Em que posso ajudar?";
            }

            return finalResponseText;

        } catch (error) {
            console.error('[AutomationWorker] Falha ao processar AI na geração:', error);
            return null;
        }
    }

    async sendFinalResponse(params, finalResponseText) {
        const { tenantId, instanceId, conversationId, contactId, jid, botSettings, sock, botDelay } = params;
        
        try {
            if (finalResponseText && sock) {
                // Simulação de digitação (Atraso Humano) baseada no botDelay (mínimo de 5 a 10 segundos para IA)
                let delaySec = Number(botDelay) || 0;
                if (delaySec < 5) {
                    delaySec = Math.floor(Math.random() * 6) + 5; // Gera valor entre 5 e 10 segundos
                }
                
                if (delaySec > 0) {
                    try {
                        await sock.sendPresenceUpdate('composing', jid);
                    } catch (e) {
                        console.error('[AutomationWorker] Falha ao enviar presença composing:', e);
                    }
                    await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
                    try {
                        await sock.sendPresenceUpdate('paused', jid);
                    } catch (e) {}
                }

                const msgResult = await sock.sendMessage(jid, { text: finalResponseText });
                if (msgResult && msgResult.key) {
                    const { data: savedMsg } = await supabase.from('messages').insert({
                        tenant_id: tenantId,
                        instance_id: instanceId,
                        conversation_id: conversationId,
                        direction: 'outbound',
                        message_type: 'text',
                        status: 'sent',
                        text_content: finalResponseText,
                        whatsapp_message_id: msgResult.key.id,
                        sender_type: 'bot',
                        raw_payload: {
                            ...msgResult,
                            bot_name: botSettings?.name || 'IA ChatBoot'
                        }
                    }).select('*').single();

                    if (conversationId) {
                        await supabase.from('conversations').update({
                            updated_at: new Date().toISOString(),
                            last_message_at: new Date().toISOString(),
                            last_message_preview: finalResponseText.substring(0, 50)
                        }).eq('id', conversationId);
                    }

                    if (savedMsg) {
                        const { default: realtime } = await import('../realtime-publisher/index.js');
                        await realtime.publishInboxEvent(tenantId, 'message.new', {
                            message: savedMsg,
                            contact_phone: jid.split('@')[0],
                            conversation_id: conversationId
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[AutomationWorker] Falha ao registrar ou enviar resposta final no BD:', err);
        }
    }
}

export default new AutomationWorker();
