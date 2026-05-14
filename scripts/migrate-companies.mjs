import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchCompanyDataFromBrasilApi(cnpj) {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    return null;
  }
}

async function migrate() {
  console.log('Starting migration for legacy company links...');
  
  // 1. Encontrar todos os contatos com document_number que parece ser CNPJ mas document_type = 'contato' ou 'cpf'
  // (Pessoas que preencheram CNPJ da empresa no próprio cadastro)
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, document_number, tenant_id')
    .in('document_type', ['contato', 'cpf']);
    
  if (error) {
    console.error('Error fetching contacts:', error);
    process.exit(1);
  }

  const contactsToMigrate = contacts.filter(c => {
    if (!c.document_number) return false;
    const cleanNum = c.document_number.replace(/\D/g, '');
    return cleanNum.length === 14;
  });

  console.log(`Found ${contactsToMigrate.length} contacts with possible CNPJ in document_number.`);

  for (const contact of contactsToMigrate) {
    const cleanCnpj = contact.document_number.replace(/\D/g, '');
    console.log(`Processing contact: ${contact.name} (${contact.id}) with CNPJ ${cleanCnpj}`);

    // Verificar se a empresa já existe no mesmo tenant
    let { data: company, error: companyErr } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', contact.tenant_id)
      .eq('document_type', 'cnpj')
      .like('document_number', `%${cleanCnpj}%`)
      .maybeSingle();

    if (companyErr) {
      console.error('Error checking company:', companyErr);
      continue;
    }

    let companyId;

    if (company) {
      console.log(`Company already exists with ID: ${company.id}. Associating...`);
      companyId = company.id;
    } else {
      console.log(`Company not found. Fetching data from BrasilAPI...`);
      const apiData = await fetchCompanyDataFromBrasilApi(cleanCnpj);
      
      let companyDataToInsert = {
        tenant_id: contact.tenant_id,
        document_type: 'cnpj',
        document_number: cleanCnpj,
        bot_status: 'active',
        phone: 'COMPANY_' + cleanCnpj
      };

      if (apiData) {
        companyDataToInsert = {
          ...companyDataToInsert,
          name: apiData.razao_social || apiData.nome_fantasia || `Empresa ${cleanCnpj}`,
          custom_name: apiData.razao_social || apiData.nome_fantasia || `Empresa ${cleanCnpj}`,
          fantasy_name: apiData.nome_fantasia || '',
          cep: apiData.cep ? apiData.cep.replace(/\D/g, '') : '',
          address_street: apiData.logradouro || '',
          address_neighborhood: apiData.bairro || '',
          address_city: apiData.municipio || '',
          address_state: apiData.uf || '',
          open_date: apiData.data_inicio_atividade || '',
          main_activity: apiData.cnae_fiscal_descricao || '',
        };
      } else {
        companyDataToInsert.name = `Empresa ${cleanCnpj}`;
        companyDataToInsert.custom_name = `Empresa ${cleanCnpj}`;
      }

      console.log(`Creating new company: ${companyDataToInsert.name}`);
      const { data: newCompany, error: insertErr } = await supabase
        .from('contacts')
        .insert([companyDataToInsert])
        .select('id')
        .single();

      if (insertErr || !newCompany) {
        console.error('Error inserting company:', insertErr);
        continue;
      }
      companyId = newCompany.id;
    }

    // Atualizar o array company_ids do contato original e limpar o document_number
    console.log(`Updating contact ${contact.name} to associate with company ${companyId}`);
    
    // Obter o company_ids atual
    const { data: currentContact } = await supabase.from('contacts').select('company_ids').eq('id', contact.id).single();
    let currentIds = currentContact?.company_ids || [];
    if (!currentIds.includes(companyId)) {
      currentIds.push(companyId);
    }

    const { error: updateErr } = await supabase
      .from('contacts')
      .update({ 
        company_ids: currentIds,
        document_number: '' // Limpar o CNPJ do cadastro pessoa física
      })
      .eq('id', contact.id);

    if (updateErr) {
      console.error('Error updating contact:', updateErr);
    } else {
      console.log(`Successfully migrated contact ${contact.name}.`);
    }
  }

  console.log('Migration completed.');
}

migrate();
