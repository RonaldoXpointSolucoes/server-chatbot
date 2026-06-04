import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
    try {
        const { data: conv, error } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', '5512f7d9-c619-4497-8dde-6e2869a841e9')
            .single();
            
        if (error) {
            console.error(error);
        } else {
            console.log('CONVERSA DETALHADA:', JSON.stringify(conv, null, 2));
        }
    } catch(e) {
        console.error(e);
    }
})();
