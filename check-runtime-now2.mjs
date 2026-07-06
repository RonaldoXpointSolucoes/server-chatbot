import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const instId = 'f695a096-cb11-48aa-b603-27f0d41ae97d';
    const { data: inst } = await supabaseClient.from('whatsapp_instances').select('*').eq('id', instId).single();
    console.log('status:', inst.status);
    console.log('phone:', inst.phone_number);
    console.log('last_error:', inst.last_error);
    
    const { data: runtime } = await supabaseClient.from('whatsapp_instance_runtime').select('*').eq('instance_id', instId).maybeSingle();
    console.log('runtime:', runtime);
    
    const { data: creds } = await supabaseClient.from('wa_auth_credentials').select('*').eq('instance_id', instId);
    console.log('creds count:', creds?.length);
    if (creds && creds.length > 0) {
        console.log('creds user:', creds[0].creds_data?.me);
    }
}
run();
