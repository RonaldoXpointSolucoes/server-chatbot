const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Carregar variáveis do .env manualmente se necessário
const envPath = path.resolve(__dirname, '../../../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = (match[2] || '').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function getDevQueue(action = 'list', cardIdToMove = null, targetStatus = 'testing') {
  try {
    // 1. Localizar o quadro Desenvolvimento & Roadmap
    const targetBoardId = '95be1dee-9d28-47d9-8ccf-d51a337f1572';
    let { data: board, error: boardErr } = await supabase
      .from('crm_boards')
      .select('*')
      .eq('id', targetBoardId)
      .maybeSingle();

    if (!board) {
      const { data: boardsByName } = await supabase
        .from('crm_boards')
        .select('*')
        .or('name.ilike.%Desenvolvimento%,name.ilike.%Roadmap%')
        .limit(1);
      if (boardsByName && boardsByName.length > 0) {
        board = boardsByName[0];
      }
    }

    if (!board) {
      console.error(JSON.stringify({ success: false, message: 'Quadro Desenvolvimento & Roadmap não encontrado.' }));
      return;
    }

    // 2. Se a ação for mover um card
    if (action === 'move' && cardIdToMove) {
      const { data: existingCard } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', cardIdToMove)
        .maybeSingle();

      const prevHistory = existingCard?.history || [];
      const deliveryReportParam = args[3] || null;
      let deliveryReportObj = null;

      if (deliveryReportParam) {
        try {
          deliveryReportObj = typeof deliveryReportParam === 'string' && (deliveryReportParam.startsWith('{') || deliveryReportParam.startsWith('['))
            ? JSON.parse(deliveryReportParam)
            : { summary: deliveryReportParam };
        } catch (e) {
          deliveryReportObj = { summary: deliveryReportParam };
        }
      }

      const newHistoryItem = {
        at: new Date().toISOString(),
        by: 'Antigravity AI (Fila Dev)',
        to: targetStatus,
        from: existingCard?.status || 'development',
        ...(deliveryReportObj ? { delivery_report: deliveryReportObj } : {})
      };

      const updatePayload = { 
        status: targetStatus,
        history: [...prevHistory, newHistoryItem]
      };

      // Se houver relatório de entrega, estruturar também nas notas do card se desejado
      if (deliveryReportObj && deliveryReportObj.summary) {
        const existingNotes = existingCard?.notes || '';
        const deliverySection = `\n\n---\n### 🚀 Registro de Entrega & Execução Técnica\n**Data/Hora:** ${new Date().toLocaleString('pt-BR')}\n**Executor:** Antigravity AI (Fila Dev)\n**Status:** Validado e migrado para Homologação & QA\n\n${deliveryReportObj.summary}`;
        if (!existingNotes.includes('### 🚀 Registro de Entrega & Execução Técnica')) {
          updatePayload.notes = existingNotes + deliverySection;
        }
      }

      const { data: updatedCard, error: updateErr } = await supabase
        .from('crm_leads')
        .update(updatePayload)
        .eq('id', cardIdToMove)
        .select()
        .maybeSingle();

      if (updateErr) {
        console.error(JSON.stringify({ success: false, error: updateErr.message }));
        return;
      }

      console.log(JSON.stringify({
        success: true,
        action: 'moved',
        card: updatedCard,
        newStatus: targetStatus
      }, null, 2));
      return;
    }

    // 3. Buscar todos os cards do quadro
    const { data: leads, error: leadsErr } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('board_id', board.id)
      .order('created_at', { ascending: true });

    if (leadsErr) {
      console.error(JSON.stringify({ success: false, error: leadsErr.message }));
      return;
    }

    const stages = board.config?.stages || [
      { id: 'backlog', label: 'Backlog / Ideias' },
      { id: 'analysis', label: 'Em Análise' },
      { id: 'development', label: 'Em Desenvolvimento' },
      { id: 'testing', label: 'Em Testes & QA' },
      { id: 'done', label: 'Concluído / Produção' }
    ];

    const grouped = {
      backlog: [],
      analysis: [],
      development: [],
      testing: [],
      done: [],
      others: []
    };

    (leads || []).forEach(lead => {
      const st = (lead.status || '').toLowerCase();
      if (st === 'backlog' || st.includes('backlog') || st.includes('ideia')) {
        grouped.backlog.push(lead);
      } else if (st === 'analysis' || st.includes('análise') || st.includes('analise')) {
        grouped.analysis.push(lead);
      } else if (st === 'development' || st.includes('desenvolvimento') || st.includes('progresso') || st.includes('andamento')) {
        grouped.development.push(lead);
      } else if (st === 'testing' || st.includes('teste') || st.includes('qa') || st.includes('validação')) {
        grouped.testing.push(lead);
      } else if (st === 'done' || st.includes('conclu') || st.includes('produção') || st.includes('producao')) {
        grouped.done.push(lead);
      } else {
        grouped.others.push(lead);
      }
    });

    console.log(JSON.stringify({
      success: true,
      board: {
        id: board.id,
        name: board.name,
        stages: stages
      },
      queue: {
        analysis: grouped.analysis,
        development: grouped.development,
        testing: grouped.testing,
        backlog: grouped.backlog,
        done: grouped.done
      },
      summary: {
        totalAnalysis: grouped.analysis.length,
        totalDevelopment: grouped.development.length,
        totalTesting: grouped.testing.length,
        totalBacklog: grouped.backlog.length,
        totalDone: grouped.done.length
      }
    }, null, 2));

  } catch (err) {
    console.error(JSON.stringify({ success: false, error: err.message || String(err) }));
  }
}

const args = process.argv.slice(2);
const action = args[0] || 'list';
const cardId = args[1] || null;
const targetStatus = args[2] || 'testing';

getDevQueue(action, cardId, targetStatus);
