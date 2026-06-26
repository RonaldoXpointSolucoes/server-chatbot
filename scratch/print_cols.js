import { supabase } from '../server/src/supabase.js';

async function run() {
  try {
    const { data, error } = await supabase.from('conversations').select('*').limit(1);
    if (error) {
      console.error(error);
      return;
    }
    if (data && data.length > 0) {
      console.log("Columns of conversations table:", Object.keys(data[0]));
      console.log("Full record example:", data[0]);
    } else {
      console.log("No conversations found.");
    }
  } catch (e) {
    console.error(e);
  }
}

run();
