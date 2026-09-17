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

    // 2.1 Ação: Adicionar novo item/card na Fila Dev
    if (action === 'add' || action === 'adicionar') {
      const title = args[1];
      const notes = args[2] || '';
      const priority = parseInt(args[3] || '2', 10);
      const initialStatus = args[4] || 'development';
      const rawTags = args[5] || '["FILA-DEV", "TAREFA"]';
      let tags = ['FILA-DEV'];
      try {
        tags = typeof rawTags === 'string' && rawTags.startsWith('[') ? JSON.parse(rawTags) : rawTags.split(',').map(t => t.trim());
      } catch (e) {
        tags = ['FILA-DEV'];
      }

      if (!title) {
        console.error(JSON.stringify({ success: false, message: 'Título é obrigatório para adicionar item na fila.' }));
        return;
      }

      const { data: newCard, error: addErr } = await supabase
        .from('crm_leads')
        .insert({
          board_id: board.id,
          title: title,
          notes: notes,
          priority: isNaN(priority) ? 2 : priority,
          status: initialStatus,
          tags: tags,
          position: 0,
          history: [{
            at: new Date().toISOString(),
            by: 'Antigravity AI (Fila Dev)',
            to: initialStatus,
            from: null,
            action: 'created'
          }]
        })
        .select()
        .maybeSingle();

      if (addErr) {
        console.error(JSON.stringify({ success: false, error: addErr.message }));
        return;
      }

      console.log(JSON.stringify({
        success: true,
        action: 'added',
        card: newCard
      }, null, 2));
      return;
    }

    // 2.2 Ação: Comentar em um item da fila
    if ((action === 'comment' || action === 'comentar') && cardIdToMove) {
      const commentText = args[2];
      const author = args[3] || 'Antigravity AI (Fila Dev)';

      if (!commentText) {
        console.error(JSON.stringify({ success: false, message: 'Texto do comentário é obrigatório.' }));
        return;
      }

      const { data: existingCard } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', cardIdToMove)
        .maybeSingle();

      if (!existingCard) {
        console.error(JSON.stringify({ success: false, message: 'Card não encontrado.' }));
        return;
      }

      const prevHistory = existingCard.history || [];
      const newCommentEntry = {
        at: new Date().toISOString(),
        by: author,
        type: 'comment',
        comment: commentText
      };

      const existingNotes = existingCard.notes || '';
      const commentNote = `\n\n💬 **Comentário (${author} - ${new Date().toLocaleString('pt-BR')}):**\n${commentText}`;

      const { data: updatedCard, error: commErr } = await supabase
        .from('crm_leads')
        .update({
          history: [...prevHistory, newCommentEntry],
          notes: existingNotes + commentNote
        })
        .eq('id', cardIdToMove)
        .select()
        .maybeSingle();

      if (commErr) {
        console.error(JSON.stringify({ success: false, error: commErr.message }));
        return;
      }

      console.log(JSON.stringify({
        success: true,
        action: 'commented',
        card: updatedCard
      }, null, 2));
      return;
    }

    // 2.3 Ação: Atribuir responsável ao card
    if ((action === 'assign' || action === 'pegar') && cardIdToMove) {
      const assignee = args[2] || 'Antigravity AI (Fila Dev)';

      const { data: existingCard } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', cardIdToMove)
        .maybeSingle();

      if (!existingCard) {
        console.error(JSON.stringify({ success: false, message: 'Card não encontrado.' }));
        return;
      }

      const prevHistory = existingCard.history || [];
      const assignEntry = {
        at: new Date().toISOString(),
        by: 'Antigravity AI (Fila Dev)',
        action: 'assigned',
        assignee: assignee
      };

      const { data: updatedCard, error: assignErr } = await supabase
        .from('crm_leads')
        .update({
          history: [...prevHistory, assignEntry]
        })
        .eq('id', cardIdToMove)
        .select()
        .maybeSingle();

      if (assignErr) {
        console.error(JSON.stringify({ success: false, error: assignErr.message }));
        return;
      }

      console.log(JSON.stringify({
        success: true,
        action: 'assigned',
        card: updatedCard,
        assignee: assignee
      }, null, 2));
      return;
    }

    // 2.4 Ação: Fechar card com status final e resolução
    if ((action === 'close' || action === 'fechar') && cardIdToMove) {
      const finalStatus = args[2] || 'done';
      const solutionReport = args[3] || 'Demanda concluída e validada.';

      let reportObj = null;
      try {
        reportObj = typeof solutionReport === 'string' && (solutionReport.startsWith('{') || solutionReport.startsWith('['))
          ? JSON.parse(solutionReport)
          : { summary: solutionReport };
      } catch (e) {
        reportObj = { summary: solutionReport };
      }

      const { data: existingCard } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', cardIdToMove)
        .maybeSingle();

      if (!existingCard) {
        console.error(JSON.stringify({ success: false, message: 'Card não encontrado.' }));
        return;
      }

      const prevHistory = existingCard.history || [];
      const closeEntry = {
        at: new Date().toISOString(),
        by: 'Antigravity AI (Fila Dev)',
        to: finalStatus,
        from: existingCard.status || 'testing',
        resolution_report: reportObj
      };

      const existingNotes = existingCard.notes || '';
      const closeSection = `\n\n---\n### 🏁 Fechamento & Resolução de Demanda\n**Data/Hora:** ${new Date().toLocaleString('pt-BR')}\n**Status Final:** ${finalStatus}\n**Resolução:** ${reportObj.summary || solutionReport}`;

      const { data: updatedCard, error: closeErr } = await supabase
        .from('crm_leads')
        .update({
          status: finalStatus,
          history: [...prevHistory, closeEntry],
          notes: existingNotes.includes('### 🏁 Fechamento') ? existingNotes : existingNotes + closeSection
        })
        .eq('id', cardIdToMove)
        .select()
        .maybeSingle();

      if (closeErr) {
        console.error(JSON.stringify({ success: false, error: closeErr.message }));
        return;
      }

      console.log(JSON.stringify({
        success: true,
        action: 'closed',
        card: updatedCard,
        finalStatus: finalStatus
      }, null, 2));
      return;
    }

    // 3. Buscar todos os cards do quadro
    const { data: leads, error: leadsErr } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('board_id', board.id)
      .order('position', { ascending: true })
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

    // Helper para extrair mídias/imagens anexadas nas notas do card
    const extractCardMedia = (notes) => {
      if (!notes || typeof notes !== 'string') return [];
      const items = [];
      const seenUrls = new Set();

      const cleanUrl = (rawUrl) => {
        return (rawUrl || '').trim().replace(/[\)\]"'\.,;]+$/, '').trim();
      };

      const cleanName = (rawName) => {
        const trimmed = (rawName || '').trim().replace(/^📸\s*|!\[|\]$/g, '').trim();
        return trimmed || 'Evidência Anexada';
      };

      // 1. Imagens markdown: ![alt](url)
      const imgRegex = /!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
      let m;
      while ((m = imgRegex.exec(notes)) !== null) {
        const url = cleanUrl(m[2]);
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          items.push({ name: cleanName(m[1]), url, type: 'image' });
        }
      }

      // 2. URLs diretas de storage chat_media
      const storageRegex = /(https?:\/\/[^\s"'<>]+\/chat_media\/crm_cards\/[^\s"'<>]+)/gi;
      while ((m = storageRegex.exec(notes)) !== null) {
        const url = cleanUrl(m[1]);
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          const fileName = url.split('/').pop()?.split('?')[0] || 'Evidência Anexada';
          const isVideo = /\.(mp4|webm|mov)$/i.test(fileName);
          const isAudio = /\.(mp3|wav|ogg|m4a|opus)$/i.test(fileName);
          items.push({ name: fileName, url, type: isVideo ? 'video' : isAudio ? 'audio' : 'image' });
        }
      }

      return items;
    };

    const enrichLead = (lead) => {
      const media = extractCardMedia(lead.notes);
      return {
        ...lead,
        media_count: media.length,
        attached_media: media
      };
    };

    const grouped = {
      backlog: [],
      analysis: [],
      development: [],
      testing: [],
      done: [],
      others: []
    };

    (leads || []).forEach(lead => {
      const enriched = enrichLead(lead);
      const st = (lead.status || '').toLowerCase();
      if (st === 'backlog' || st.includes('backlog') || st.includes('ideia')) {
        grouped.backlog.push(enriched);
      } else if (st === 'analysis' || st.includes('análise') || st.includes('analise')) {
        grouped.analysis.push(enriched);
      } else if (st === 'development' || st.includes('desenvolvimento') || st.includes('progresso') || st.includes('andamento')) {
        grouped.development.push(enriched);
      } else if (st === 'testing' || st.includes('teste') || st.includes('qa') || st.includes('validação')) {
        grouped.testing.push(enriched);
      } else if (st === 'done' || st.includes('conclu') || st.includes('produção') || st.includes('producao')) {
        grouped.done.push(enriched);
      } else {
        grouped.others.push(enriched);
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

