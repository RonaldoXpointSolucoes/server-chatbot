import { createClient } from '@supabase/supabase-js'; 
import dotenv from 'dotenv'; 
dotenv.config({path: './.env.local'}); 
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY); 
supabase.from('messages').select('id').limit(1).then(res => console.log('Messages ANON:', JSON.stringify(res, null, 2))).catch(e => console.error(e));
