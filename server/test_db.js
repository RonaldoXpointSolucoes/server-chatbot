import { supabase } from './src/supabase.js'; 
supabase.from('messages').select('*').limit(1).then(res => console.log('Messages in DB:', JSON.stringify(res, null, 2))).catch(e => console.error(e));
