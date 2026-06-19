import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
    const { data: docs, error: docError } = await supabaseClient.from('knowledge_documents').select('*').eq('tenant_id', tenantId);
    console.log('--- DOCUMENTS FOR TENANT ' + tenantId + ' ---');
    console.log(JSON.stringify(docs, null, 2));
}
run();
