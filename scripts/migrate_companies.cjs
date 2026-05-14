const { createClient } = require("@supabase/supabase-js");

const supabase = createClient("https://yzbxsxabzncdzuxvlppt.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k");

async function runMigration() {
  console.log("Iniciando migração de empresas...");
  // Busca contatos com CNPJ no documento
  const { data: contacts, error } = await supabase.from("contacts").select("*").eq("document_type", "contato").neq("document_number", "");
  if (error) {
    console.error("Erro ao buscar contatos:", error);
    return;
  }
  
  console.log(`Encontrados ${contacts.length} contatos para verificar.`);
  
  for (const contact of contacts) {
    if (!contact.document_number) continue;
    const cleanCnpj = contact.document_number.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) continue; // Nao é um CNPJ valido
    
    console.log(`Processando contato: ${contact.name} (CNPJ: ${cleanCnpj})`);
    
    // Verifica se a empresa já existe no mesmo tenant
    let { data: company } = await supabase.from("contacts").select("id").eq("tenant_id", contact.tenant_id).eq("document_type", "cnpj").eq("document_number", cleanCnpj).maybeSingle();
    
    if (!company) {
      console.log(`Empresa com CNPJ ${cleanCnpj} não encontrada. Criando...`);
      let fantasyName = "Empresa CNPJ " + cleanCnpj;
      let legalNature = "";
      let mainActivity = "";
      let openDate = "";
      
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
        const data = await response.json();
        if (data && !data.message) {
          fantasyName = data.nome_fantasia || data.razao_social || fantasyName;
          legalNature = data.natureza_juridica || "";
          if (data.cnae_fiscal_descricao) mainActivity = data.cnae_fiscal_descricao;
          openDate = data.data_inicio_atividade || "";
        }
      } catch (e) {
        console.log(`Aviso: BrasilAPI falhou para CNPJ ${cleanCnpj}`);
      }
      
      // Cria a empresa
      const { data: newCompany, error: createError } = await supabase.from("contacts").insert({
        tenant_id: contact.tenant_id,
        name: fantasyName,
        fantasy_name: fantasyName,
        phone: cleanCnpj, // PREENCHENDO O TELEFONE COM O CNPJ PARA PASSAR O NOT-NULL
        document_type: "cnpj",
        document_number: cleanCnpj,
        legal_nature: legalNature,
        main_activity: mainActivity,
        open_date: openDate
      }).select().single();
      
      if (createError) {
        console.error("Erro ao criar empresa:", createError);
        continue;
      }
      company = newCompany;
      console.log(`Empresa ${fantasyName} criada com sucesso.`);
    }
    
    // Associa a empresa ao contato se ainda nao estiver
    const currentCompanyIds = contact.company_ids || [];
    if (!currentCompanyIds.includes(company.id)) {
      currentCompanyIds.push(company.id);
      
      const { error: updateError } = await supabase.from("contacts").update({
        company_ids: currentCompanyIds,
        document_number: ""
      }).eq("id", contact.id);
      
      if (updateError) {
        console.error(`Erro ao atualizar contato ${contact.name}:`, updateError);
      } else {
        console.log(`Contato ${contact.name} associado com sucesso à empresa.`);
      }
    } else {
       console.log(`Contato ${contact.name} já associado.`);
       // limpa doc
       await supabase.from("contacts").update({ document_number: "" }).eq("id", contact.id);
    }
  }
  console.log("Migração concluída!");
}

runMigration();
