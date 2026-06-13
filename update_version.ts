import { supabase } from './src/services/supabase';

async function updateVersion() {
  const { data, error } = await supabase.from('app_version').insert({
    version: '3.0.9',
    deploy_date: new Date().toISOString()
  });
  console.log('Done', error);
}

updateVersion();
