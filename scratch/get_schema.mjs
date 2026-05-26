import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("Buscando registros da tabela push_subscriptions...");
    const { data, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .limit(1);
        
    if (error) {
        console.error("Erro ao ler tabela push_subscriptions:", error);
    } else {
        console.log("Estrutura do registro retornado:", data);
    }
}

run();
