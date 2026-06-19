import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    await client.connect();
    console.log("Conectado ao PostgreSQL.");

    // Busca um tenant_id real no banco de dados
    const companyRes = await client.query("SELECT id FROM companies LIMIT 1");
    if (companyRes.rows.length === 0) {
      console.log("TESTE FALHA: Nenhuma empresa cadastrada no banco de dados para rodar o teste.");
      return;
    }
    const tenantId = companyRes.rows[0].id;
    console.log(`Usando tenant_id: ${tenantId}`);

    // 1. Limpar eventuais dados antigos
    await client.query("DELETE FROM ai_reasoning_adjustments WHERE user_query = $1", ["teste de pergunta de acai"]);

    // 2. Criar mock de embedding (vetor de 384 dimensões preenchido com valores)
    const mockVector = Array(384).fill(0).map((_, i) => i === 0 ? 1 : 0);
    const vectorStr = `[${mockVector.join(',')}]`;

    // 3. Inserir correção de teste
    console.log("Inserindo correção de teste...");
    const insertRes = await client.query(
      `INSERT INTO ai_reasoning_adjustments (tenant_id, user_query, original_response, corrected_response, embedding)
       VALUES ($1, $2, $3, $4, $5::vector) RETURNING id`,
      [tenantId, "teste de pergunta de acai", "Resposta incorreta original", "Resposta correta e perfeita de acai", vectorStr]
    );
    console.log("Inserido com ID:", insertRes.rows[0].id);

    // 4. Executar busca por RPC
    console.log("Executando RPC match_ai_reasoning_adjustments...");
    const rpcRes = await client.query(
      `SELECT * FROM match_ai_reasoning_adjustments($1::vector, 0.5, 3, $2::uuid)`,
      [vectorStr, tenantId]
    );

    console.log("Resultados encontrados:");
    console.log(rpcRes.rows);

    if (rpcRes.rows.length > 0 && rpcRes.rows[0].corrected_response === "Resposta correta e perfeita de acai") {
      console.log("TESTE SUCESSO: Inserção e busca semântica via RPC funcionando perfeitamente!");
    } else {
      console.log("TESTE FALHA: Nenhuma correspondência correta retornada.");
    }

    // Limpar o registro de teste
    await client.query("DELETE FROM ai_reasoning_adjustments WHERE id = $1", [insertRes.rows[0].id]);
    console.log("Registro de teste limpo.");

  } catch (error) {
    console.error("Erro no teste:", error);
  } finally {
    await client.end();
  }
}

main();
