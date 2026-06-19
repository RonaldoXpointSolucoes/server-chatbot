import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const currentTenantId = 'ee7dd113-a50c-4922-8e87-772d68e9691e';
  const product = { id: 'BD37751F-AE4E-4D7A-B764-DCDD98B941DF', name: 'Costela Burguer' };

  try {
    const resSteps = await fetch("https://service.xpointsolucoes.com.br:8443/v6/server/nuvem/ProdutoCardapioService/ProdutoComPassos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE1OTgyNzA4NTksImV4cCI6MTg5MzQxMzI1OX0.mhHkRKeJgvfHmKDe4cZFKLAJKUBVplIlB5GJVBMkjQw"
      },
      body: JSON.stringify({
        AIdProduto: product.id
      })
    });

    if (resSteps.ok) {
      const stepsData = await resSteps.json();
      const passos = stepsData.passos;
      console.log(`Encontrados ${passos?.length} passos de adicionais.`);

      if (passos && passos.length > 0) {
        const passosToUpsert = passos.map((p, idx) => ({
          id: p.IdProdutoPassos,
          tenant_id: currentTenantId,
          produto_id: product.id,
          pergunta: p.Pergunta,
          sub_titulo: p.SubTitulo || null,
          qtd_min: p.QtdMin || 0,
          qtd_max: p.QtdMax || 1,
          ordem: idx,
          ativo: p.Ativo !== false
        }));

        console.log("Upserting passos...", passosToUpsert);
        const { data: dPassos, error: errPassos } = await supabase
          .from('cardapio_passos')
          .upsert(passosToUpsert, { onConflict: 'id' })
          .select();

        if (errPassos) {
          console.error("Erro no upsert de passos:", errPassos);
          return;
        }
        console.log("Passos upserted successfully.");

        const opcoesToUpsert = [];
        passos.forEach((p) => {
          if (Array.isArray(p.ListaProdutos)) {
            p.ListaProdutos.forEach((opt) => {
              const precoAdicional = opt.ListaPreco?.[0]?.Preco || 0;
              opcoesToUpsert.push({
                id: opt.IdProduto,
                tenant_id: currentTenantId,
                passo_id: p.IdProdutoPassos,
                descricao: opt.Descricao,
                preco: precoAdicional,
                imagem: opt.Imagem || null,
                ativo: opt.Ativo !== false
              });
            });
          }
        });

        console.log(`Montadas ${opcoesToUpsert.length} opções para salvar.`);
        if (opcoesToUpsert.length > 0) {
          console.log("Exemplo de opção a salvar:", opcoesToUpsert[0]);
          const { data: dOpcoes, error: errOpcoes } = await supabase
            .from('cardapio_opcoes')
            .upsert(opcoesToUpsert, { onConflict: 'id' })
            .select();

          if (errOpcoes) {
            console.error("Erro no upsert de opções:", errOpcoes);
          } else {
            console.log(`Sucesso! Salvas ${opcoesToUpsert.length} opções no banco.`);
          }
        }
      }
    }
  } catch (e) {
    console.error("Erro geral:", e);
  }
}

run();
