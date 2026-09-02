const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectFullNotes() {
  const { data: cards } = await supabase
    .from('crm_leads')
    .select('id, title, notes')
    .eq('board_id', '95be1dee-9d28-47d9-8ccf-d51a337f1572')
    .eq('status', 'development')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  cards?.forEach((c, idx) => {
    console.log(`\n========================================`);
    console.log(`CARD ${idx + 1}/${cards.length} | ID: ${c.id}`);
    console.log(`Título: ${c.title}`);
    console.log(`========================================`);
    console.log(c.notes);
  });
}

inspectFullNotes();
