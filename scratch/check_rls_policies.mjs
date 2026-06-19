import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: policies, error } = await supabaseClient.rpc('get_policies');
    // If rpc doesn't exist, query pg_policies
    const { data: pgPolicies, error: pgError } = await supabaseClient.from('pg_policies').select('*').maybeSingle();
    
    // Let's run a query to select from pg_policies via pg client or raw sql
    // We can also query using simple select if pg_policies is exposed, but usually it's not.
    // Let's run a query to see the RLS policies
    console.log({ policies, pgPolicies, pgError });
}
run();
