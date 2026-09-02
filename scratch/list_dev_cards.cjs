const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listDevCards() {
  const { data: cards, error } = await supabase
    .from('crm_leads')
    .select('id, title, status, priority, position, tags, notes, created_at')
    .eq('board_id', '95be1dee-9d28-47d9-8ccf-d51a337f1572')
    .eq('status', 'development')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  console.log(`=== ${cards?.length} CARDS EM DESENVOLVIMENTO ===`);
  cards?.forEach((c, idx) => {
    console.log(`\n[CARD ${idx + 1}/${cards.length}] ID: ${c.id}`);
    console.log(`Título: ${c.title}`);
    console.log(`Prioridade: ${c.priority} | Tags: ${c.tags?.join(', ')}`);
    console.log(`Notas (Primeiros 300 caracteres):\n${c.notes?.slice(0, 300)}...`);
  });
}

listDevCards();
