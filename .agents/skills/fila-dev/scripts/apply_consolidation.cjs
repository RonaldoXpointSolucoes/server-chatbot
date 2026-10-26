const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '../../../../');
const envPath = path.join(projectRoot, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
  if (m) {
    let v = (m[2] || '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
});

const { createClient } = require(path.join(projectRoot, 'node_modules/@supabase/supabase-js'));

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const specs = JSON.parse(fs.readFileSync(path.join(__dirname, 'consolidated_13_cards_spec.json'), 'utf8'));
  const allCards = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_since_sep15.json'), 'utf8'));
  const cardsMap = new Map(allCards.map(c => [c.id, c]));

  console.log(`Iniciando atualização de consolidação para ${specs.length} grupos mestres...`);

  // 1. Atualizar cada um dos 13 cards mestres para 'analysis' com a nova especificação
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const existing = cardsMap.get(spec.targetCardId);

    const prevHistory = existing?.history || [];
    const newHistory = [
      ...prevHistory,
      {
        at: new Date().toISOString(),
        by: 'Antigravity AI (Lead Architect)',
        from: existing?.status || 'unknown',
        to: 'analysis',
        action: 'consolidated_to_analysis',
        group_id: spec.groupId,
        absorbed_count: spec.absorbedCardIds.length,
        reason: 'Consolidação técnica pós 15/09 para esteira Next-Gen (Appwrite + Whatsmeow Go + Coolify Novo)'
      }
    ];

    const { error: updateErr } = await supabase
      .from('crm_leads')
      .update({
        title: spec.title,
        status: 'analysis',
        priority: spec.priority,
        tags: spec.tags,
        notes: spec.notes,
        position: i,
        history: newHistory
      })
      .eq('id', spec.targetCardId);

    if (updateErr) {
      console.error(`Erro ao atualizar card mestre ${spec.groupId} (${spec.targetCardId}):`, updateErr);
    } else {
      console.log(`[OK] Mestre #${i + 1} [${spec.groupId}] movido para 'Em Análise': ${spec.title}`);
    }

    // 2. Para cada card absorvido neste grupo
    for (const absorbedId of spec.absorbedCardIds) {
      const absorbedCard = cardsMap.get(absorbedId);
      if (!absorbedCard) continue;

      const absorbedHistory = absorbedCard.history || [];
      const updatedAbsorbedHistory = [
        ...absorbedHistory,
        {
          at: new Date().toISOString(),
          by: 'Antigravity AI (Lead Architect)',
          from: absorbedCard.status,
          to: 'production',
          action: 'absorbed_into_master_card',
          master_card_id: spec.targetCardId,
          master_title: spec.title
        }
      ];

      const consolidationNote = `\n\n---\n### 📦 Cartão Consolidado no Card Mestre
Este cartão legado de diagnóstico/demanda foi absorvido e consolidado no cartão de especificação técnica oficial:
👉 **[${spec.title}]** (ID: \`${spec.targetCardId}\`), alocado na fila **Em Análise** para desenvolvimento da IA no novo ecossistema Next-Gen (Appwrite + Whatsmeow).`;

      const existingNotes = absorbedCard.notes || '';
      const newNotes = existingNotes.includes('Cartão Consolidado no Card Mestre')
        ? existingNotes
        : existingNotes + consolidationNote;

      const existingTags = Array.isArray(absorbedCard.tags) ? absorbedCard.tags : [];
      const newTags = Array.from(new Set([...existingTags, 'CONSOLIDADO', spec.groupId]));

      const { error: absErr } = await supabase
        .from('crm_leads')
        .update({
          status: 'production', // Arquivado/Concluído como consolidado
          notes: newNotes,
          tags: newTags,
          history: updatedAbsorbedHistory
        })
        .eq('id', absorbedId);

      if (absErr) {
        console.error(`Erro ao atualizar card absorvido ${absorbedId}:`, absErr);
      }
    }
  }

  // 3. Verificar estado final das colunas do quadro
  const boardId = '95be1dee-9d28-47d9-8ccf-d51a337f1572';
  const { data: updatedLeads } = await supabase
    .from('crm_leads')
    .select('id, title, status')
    .eq('board_id', boardId);

  const finalCounts = {};
  updatedLeads.forEach(l => {
    finalCounts[l.status] = (finalCounts[l.status] || 0) + 1;
  });

  console.log('\n=========================================');
  console.log('ESTADO FINAL DO QUADRO CHATBOT CRM:');
  console.log(finalCounts);
  console.log('=========================================');
}

main().catch(console.error);
