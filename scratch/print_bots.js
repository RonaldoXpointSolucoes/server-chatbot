import { supabase } from '../server/src/supabase.js';

async function run() {
  try {
    const { data: bots, error } = await supabase.from('bots').select('*').eq('tenant_id', '9057ca36-0b29-4fe5-89fb-be5e13387030');
    if (error) {
      console.error("Error fetching bots:", error);
      return;
    }
    console.log(`Found ${bots.length} bots for tenant 9057ca36-0b29-4fe5-89fb-be5e13387030:`);
    for (const bot of bots) {
      console.log(`- Bot: ${bot.name} (ID: ${bot.id})`);
      console.log(`  Status: ${bot.status}, AutoReply: ${bot.autoReply}`);
      console.log(`  Channels: ${JSON.stringify(bot.channels)}`);
      console.log(`  Model: ${bot.model}, Temp: ${bot.temperature}`);
      console.log(`  SystemPrompt: "${bot.systemPrompt ? bot.systemPrompt.substring(0, 100) + '...' : 'null'}"`);
    }
  } catch (e) {
    console.error(e);
  }
}

run();
