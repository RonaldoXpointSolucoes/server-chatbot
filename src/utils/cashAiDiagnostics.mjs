/**
 * Construtor de prompt compacto e parser JSON para investigação assistida por IA e evolução da Fórmula 1.
 */

function formatCentsBrl(cents) {
  return `R$ ${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')}`;
}

export function buildCashAiAnalysisPrompt({
  reconciliation,
  parseErrors = [],
  rulesConfig = {},
  userQuestion = ''
}) {
  const audit = reconciliation?.auditInsights || {};
  const completeness = reconciliation?.reportCompleteness;

  const missingList = (reconciliation?.missingInBank || []).slice(0, 40).map(item => ({
    id: item.id,
    valor: formatCentsBrl(item.amountCents),
    centavos: item.amountCents,
    hora: item.timeStr,
    categoria: item.category,
    origem: item.source,
    descricao: item.description
  }));

  const extraList = (reconciliation?.extraInBank || []).slice(0, 40).map(item => ({
    id: item.id,
    valor: formatCentsBrl(item.amountCents),
    centavos: item.amountCents,
    hora: item.timeStr,
    categoria: item.category,
    origem: item.source,
    descricao: item.description
  }));

  const pendingSuggestions = (reconciliation?.suggestions || []).slice(0, 20).map(s => ({
    id: s.id,
    tipo: s.reasonType,
    valor: formatCentsBrl(s.amountCents),
    motivo: s.reasonText
  }));

  const nonPdv = (reconciliation?.nonPdvItems || []).slice(0, 20).map(n => ({
    id: n.id,
    valor: formatCentsBrl(n.amountCents),
    descricao: n.description
  }));

  const errorsCompact = (parseErrors || []).map(f => ({
    arquivo: f.fileName,
    status: f.status,
    erro: f.errorMessage || 'Erro desconhecido'
  }));

  const activeRulesCompact = {
    amountToleranceCents: rulesConfig.amountToleranceCents,
    nonPdvOfxKeywords: rulesConfig.nonPdvOfxKeywords,
    settlementOfxKeywords: rulesConfig.settlementOfxKeywords,
    customAdminRules: rulesConfig.adminRules || []
  };

  return `Você é um Auditor Financeiro Sênior especialista em conciliação de PDV (DataDivas), extratos bancários OFX/CSV (C6 Bank, Itaú) e adquirentes (Rede, C6 Pay).

Analise EXCLUSIVAMENTE as pendências e falhas abaixo (os itens que já bateram não precisam ser reavaliados) e responda SOMENTE em JSON válido no schema exato especificado.

CONTEXTO DO FECHAMENTO:
- Data referência: ${reconciliation?.referenceDate || 'Não informada'}
- Status atual: ${reconciliation?.status || 'draft'} | Health Score: ${reconciliation?.healthScore ?? 0}%
- Total Sistema: ${formatCentsBrl(reconciliation?.systemTotalCents)} | Total Real: ${formatCentsBrl(reconciliation?.realTotalCents)} | Diferença: ${formatCentsBrl(reconciliation?.diffTotalCents)}
${userQuestion ? `- Dúvida específica do operador: ${userQuestion}` : ''}

ITENS FALTANDO NO BANCO / MAQUININHA (constam no PDV, sem par encontrado):
${JSON.stringify(missingList, null, 2)}

ITENS SOBRANDO NO BANCO / MAQUININHA (entraram, sem venda correspondente no PDV):
${JSON.stringify(extraList, null, 2)}

SUGESTÕES PENDENTES JÁ DETECTADAS PELA FÓRMULA 1:
${JSON.stringify(pendingSuggestions, null, 2)}

ENTRADAS CLASSIFICADAS COMO NÃO-PDV / LIQUIDAÇÕES:
${JSON.stringify(nonPdv, null, 2)}

ERROS OU AVISOS DE LEITURA DE ARQUIVOS:
${JSON.stringify(errorsCompact, null, 2)}

REGRAS ATUAIS DA FÓRMULA 1:
${JSON.stringify(activeRulesCompact, null, 2)}

AUDITORIA DOS 7 RELATÓRIOS DATADIVAS + 3 BANCO:
- Relatórios faltantes: ${JSON.stringify(completeness?.warnings || [])}
- Mesas reabertas / recebimentos excluídos: ${JSON.stringify((audit.reopenedTables || []).slice(0, 10))}
- Remoções de taxa de serviço (10%): ${JSON.stringify((audit.feeRemovals || []).slice(0, 15).map((r) => ({ pedido: r.orderNumber, prod: r.product, motivo: r.reason, detalhe: r.details, op: r.operator })))}
- Cancelamentos detalhados: ${JSON.stringify((audit.cancelledDetails || []).slice(0, 15).map((c) => ({ pedido: c.table, prod: c.product, valor: formatCentsBrl(c.totalCents), motivo: c.reason, detalhe: c.reasonDetails, op: c.operator })))}

RESPONDA APENAS COM UM OBJETO JSON CONTENDO:
{
  "summary": "Diagnóstico executivo claro em português explicando a causa provável das divergências restantes.",
  "hypotheses": [
    {
      "title": "Título curto da hipótese",
      "systemItemIds": ["sys_..."],
      "realItemIds": ["real_..."],
      "confidence": "alta" | "media" | "baixa",
      "explanation": "Por que esses itens podem estar relacionados (ex.: taxa descontada, soma de parcelas, troca de horário ou dia seguinte)."
    }
  ],
  "fileDiagnoses": [
    {
      "fileName": "nome_do_arquivo",
      "issue": "O que impediu ou dificultou a leitura",
      "fixGuidance": "Como resolver ou ajustar o arquivo/layout"
    }
  ],
  "formulaSuggestions": [
    {
      "ruleType": "normalize_admin" | "ignore_ofx_memo" | "engine_setting",
      "pattern": "TRECHO_OU_CONFIG",
      "targetValue": "pix|cartao|dinheiro|pendente|ifood|ticket|outros|credito_nao_pdv|liquidacao_maquininha|valor_numerico",
      "reason": "Por que adicionar esta regra melhora a Fórmula 1 automaticamente nos próximos dias"
    }
  ]
}`;
}

export function parseCashAiAnalysisResponse(rawText) {
  const fallback = {
    summary: 'Não foi possível estruturar a resposta automática da IA. Revise manualmente os itens pendentes.',
    hypotheses: [],
    fileDiagnoses: [],
    formulaSuggestions: []
  };

  if (!rawText || typeof rawText !== 'string') return fallback;
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonSlice = firstBrace !== -1 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;

  try {
    const parsed = JSON.parse(jsonSlice);
    return {
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary,
      hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses.map(h => ({
        title: String(h?.title || 'Hipótese de conciliação'),
        systemItemIds: Array.isArray(h?.systemItemIds) ? h.systemItemIds.map(String) : [],
        realItemIds: Array.isArray(h?.realItemIds) ? h.realItemIds.map(String) : [],
        confidence: ['alta', 'media', 'baixa'].includes(String(h?.confidence).toLowerCase()) ? String(h.confidence).toLowerCase() : 'media',
        explanation: String(h?.explanation || '')
      })) : [],
      fileDiagnoses: Array.isArray(parsed.fileDiagnoses) ? parsed.fileDiagnoses.map(d => ({
        fileName: String(d?.fileName || 'Arquivo'),
        issue: String(d?.issue || ''),
        fixGuidance: String(d?.fixGuidance || '')
      })) : [],
      formulaSuggestions: Array.isArray(parsed.formulaSuggestions) ? parsed.formulaSuggestions
        .filter(s => s && s.pattern && s.targetValue)
        .map(s => ({
          ruleType: ['normalize_admin', 'ignore_ofx_memo', 'engine_setting'].includes(s.ruleType) ? s.ruleType : 'normalize_admin',
          pattern: String(s.pattern).trim(),
          targetValue: String(s.targetValue).trim(),
          reason: String(s.reason || 'Melhoria sugerida pelo Auditor IA')
        })) : []
    };
  } catch {
    return fallback;
  }
}

export function toCompanyRulePayload(suggestion, tenantId) {
  return {
    tenant_id: tenantId,
    rule_type: suggestion.ruleType,
    pattern: String(suggestion.pattern || '').trim(),
    target_value: String(suggestion.targetValue || '').trim(),
    source_origin: 'ai_suggested',
    is_active: true,
    notes: suggestion.reason || ''
  };
}
