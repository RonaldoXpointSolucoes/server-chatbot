import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Carrega .env antes de qualquer importação de código do projeto
const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

// Delay helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  try {
    console.log("=== INICIANDO SINCRONIZAÇÃO COMPLETA DO CARDÁPIO BURGUER PLUS ===");
    
    // 1. Busca configurações da empresa no Supabase
    const { data: companyData, error: errComp } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', tenantId)
      .single();

    if (errComp || !companyData) {
      console.error("Erro ao buscar configurações da empresa:", errComp);
      return;
    }

    const settings = companyData.settings || {};
    const cardapioUrl = settings.cardapio_json_url;
    const cardapioToken = settings.cardapio_json_token;
    const cardapioPayload = settings.cardapio_json_payload;

    if (!cardapioUrl) {
      console.error("URL de cardápio não configurada!");
      return;
    }

    console.log("URL do Cardápio:", cardapioUrl);

    // 2. Faz fetch do cardápio completo da API externa
    let bodyObj = {};
    if (cardapioPayload) {
      try {
        bodyObj = typeof cardapioPayload === 'string' ? JSON.parse(cardapioPayload) : cardapioPayload;
      } catch (e) {
        bodyObj = { AGuidEstab: cardapioPayload };
      }
    }

    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': cardapioToken.startsWith('Bearer ') ? cardapioToken : `Bearer ${cardapioToken}`
    };

    const res = await fetch(cardapioUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj)
    });

    if (!res.ok) {
      console.error("Erro ao fazer fetch do cardápio completo. HTTP:", res.status);
      return;
    }

    const data = await res.json();
    const rawGrupos = data.grupos || [];
    const rawProdutos = data.produtos || [];

    console.log(`Carregados da API externa: ${rawGrupos.length} grupos e ${rawProdutos.length} produtos.`);

    // 3. Upsert grupos (categorias)
    const gruposToUpsert = rawGrupos.map((g, idx) => ({
      id: g.id || g.code || '',
      tenant_id: tenantId,
      descricao: g.name || g.description || '',
      ordem: idx,
      ativo: g.active !== false
    }));

    console.log("Upserting grupos no Supabase...");
    const { error: errGrupos } = await supabase
      .from('cardapio_grupos')
      .upsert(gruposToUpsert, { onConflict: 'id' });

    if (errGrupos) {
      console.error("Erro ao salvar grupos:", errGrupos);
      return;
    }
    console.log("Grupos salvos com sucesso.");

    // 4. Upsert produtos
    const produtosToUpsert = rawProdutos.map(p => ({
      id: p.id || p.code || '',
      tenant_id: tenantId,
      grupo_id: p.groupId || null,
      name: p.name || '',
      description: p.description || '',
      price: Number(p.price || 0),
      image: p.image || '',
      ativo: p.active !== false
    }));

    console.log("Upserting produtos no Supabase...");
    const { error: errProdutos } = await supabase
      .from('cardapio_produtos')
      .upsert(produtosToUpsert, { onConflict: 'id' });

    if (errProdutos) {
      console.error("Erro ao salvar produtos:", errProdutos);
      return;
    }
    console.log("Produtos salvos com sucesso.");

    // 5. Para cada produto ativo, vamos consultar os passos e opcionais
    const activeProducts = rawProdutos.filter(p => p.active !== false);
    console.log(`Iniciando sincronização de adicionais para ${activeProducts.length} produtos ativos...`);

    const passosUrl = "https://service.xpointsolucoes.com.br:8443/v6/server/nuvem/ProdutoCardapioService/ProdutoComPassos";

    let count = 0;
    for (const prod of activeProducts) {
      count++;
      const prodId = prod.id || prod.code;
      console.log(`[${count}/${activeProducts.length}] Processando adicionais para: ${prod.name}`);

      try {
        const resSteps = await fetch(passosUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ AIdProduto: prodId })
        });

        if (!resSteps.ok) {
          console.error(`Falha ao buscar passos para o produto ${prod.name}. HTTP: ${resSteps.status}`);
          continue;
        }

        const stepsData = await resSteps.json();
        const passos = stepsData.passos || [];

        if (passos.length > 0) {
          // Grava passos
          const passosToUpsert = passos.map((p, idx) => ({
            id: p.IdProdutoPassos,
            tenant_id: tenantId,
            produto_id: prodId,
            pergunta: p.Pergunta || p.SubTitulo || 'Escolha uma opção',
            sub_titulo: p.SubTitulo || null,
            qtd_min: Number(p.QtdMin || 0),
            qtd_max: Number(p.QtdMax || 1),
            ordem: idx,
            ativo: p.Ativo !== false
          }));

          const { error: errP } = await supabase
            .from('cardapio_passos')
            .upsert(passosToUpsert, { onConflict: 'id' });

          if (errP) {
            console.error(`Erro ao salvar passos do produto ${prod.name}:`, errP);
            continue;
          }

          // Grava opções
          const opcoesToUpsert = [];
          passos.forEach(p => {
            const listProds = p.ListaProdutos || p.listaProdutos || [];
            if (Array.isArray(listProds)) {
              listProds.forEach(opt => {
                const listPrices = opt.ListaPreco || opt.listaPreco || [];
                const precoAdicional = Number(listPrices[0]?.Preco || listPrices[0]?.preco || opt.price || 0);
                opcoesToUpsert.push({
                  id: opt.IdProduto || opt.id || opt.code || '',
                  tenant_id: tenantId,
                  passo_id: p.IdProdutoPassos,
                  descricao: opt.Descricao || opt.name || '',
                  preco: precoAdicional,
                  imagem: opt.Imagem || opt.image || null,
                  ativo: opt.Ativo !== false
                });
              });
            }
          });

          if (opcoesToUpsert.length > 0) {
            const { error: errO } = await supabase
              .from('cardapio_opcoes')
              .upsert(opcoesToUpsert, { onConflict: 'id' });

            if (errO) {
              console.error(`Erro ao salvar opções do produto ${prod.name}:`, errO);
            }
          }
        }
      } catch (errP) {
        console.error(`Erro ao processar adicionais do produto ${prod.name}:`, errP);
      }

      // Pequeno delay para evitar sobrecarregar a API do cliente
      await sleep(150);
    }

    console.log("=== SINCRONIZAÇÃO DO CARDÁPIO CONCLUÍDA COM SUCESSO NO SUPABASE ===");

  } catch (err) {
    console.error("Erro crítico na sincronização:", err);
  }
}

run();
