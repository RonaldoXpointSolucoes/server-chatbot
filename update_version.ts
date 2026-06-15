import { supabase } from './src/services/supabase';

async function updateVersion() {
  const { data, error } = await supabase.from('app_version').insert({
    version: '3.1.5',
    deploy_date: new Date().toISOString()
  });
  console.log('Done', error);
}

updateVersion();
