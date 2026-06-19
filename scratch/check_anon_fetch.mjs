import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjA3MDMsImV4cCI6MjA5MDc5NjcwM30.NmeEhsEqvg9Wp5fchUd5JyFt3K3e9Y-MHZ69wnNseec';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
    const { data: docs, error: docError } = await supabaseClient
        .from('knowledge_documents')
        .select('*')
        .eq('tenant_id', tenantId);
        
    console.log('--- FETCH WITH ANON KEY ---');
    console.log({ docError, docs });
}
run();
