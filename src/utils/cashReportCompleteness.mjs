/**
 * Catálogo oficial e validador de completude dos 10 relatórios recomendados
 * para conciliação completa: 7 relatórios do sistema DataDivas + 3 de Banco/Maquininhas.
 */

export const DATADIVAS_REPORT_SPECS = Object.freeze([
  {
    fileType: 'pdv_vendas',
    label: 'PlanilhaRecebimento (Pagamentos PDV)',
    shortLabel: 'Recebimentos',
    priority: 'essential',
    hint: 'Pagamentos recebidos por pedido, forma de pagamento, operador e turno'
  },
  {
    fileType: 'pdv_itens_vendidos',
    label: 'Itens Vendidos (Consumo Detalhado)',
    shortLabel: 'Itens Vendidos',
    priority: 'detail',
    hint: 'Produtos por comanda/mesa, garçom, taxa 10% e remoções de taxa'
  },
  {
    fileType: 'pdv_cancelamentos',
    label: 'Cancelamentos Detalhados',
    shortLabel: 'Cancelamentos',
    priority: 'audit',
    hint: 'Produtos cancelados com mesa, operador, motivo e justificativa'
  },
  {
    fileType: 'pdv_descontos',
    label: 'Descontos & Motivos Detalhados',
    shortLabel: 'Descontos',
    priority: 'audit',
    hint: 'Descontos aplicados, funcionário autorizador e origem'
  },
  {
    fileType: 'rel_conferencia',
    label: 'RelConferencia (Espelho de Caixa)',
    shortLabel: 'RelConferencia',
    priority: 'essential',
    hint: 'Quadro consolidado Sistema x Real e bloco de entradas/saídas em dinheiro'
  },
  {
    fileType: 'fechamento_txt',
    label: 'Fita Movimento de Caixa (.txt)',
    shortLabel: 'Mov.Caixa (.txt)',
    priority: 'essential',
    hint: 'Suprimento/fundo de caixa, sangrias, saídas e notas pendentes nominais'
  },
  {
    fileType: 'fechamento_resumo_txt',
    label: 'Fita Fechamento & Controle (.txt)',
    shortLabel: 'Fechamento (.txt)',
    priority: 'audit',
    hint: 'Faturamento líquido, descontos por pedido, CMV consumo interno e mesas reabertas'
  }
]);

export const BANK_REPORT_SPECS = Object.freeze([
  {
    fileType: 'extrato_ofx',
    acceptedTypes: ['extrato_ofx', 'extrato_generico'],
    label: 'Extrato Bancário (OFX / Planilha)',
    shortLabel: 'Extrato Banco (OFX)',
    priority: 'essential',
    hint: 'Pix recebidos em conta corrente (C6 Bank / Itaú)'
  },
  {
    fileType: 'adquirente_rede',
    acceptedTypes: ['adquirente_rede'],
    label: 'Maquininha Rede',
    shortLabel: 'Rede',
    priority: 'essential',
    hint: 'Vendas crédito, débito, voucher e Pix na adquirente Rede'
  },
  {
    fileType: 'adquirente_c6pay',
    acceptedTypes: ['adquirente_c6pay'],
    label: 'Maquininha C6 Pay',
    shortLabel: 'C6 Pay',
    priority: 'essential',
    hint: 'Relatorio-Vendas-C6Pay_Detalhado com taxas MDR e pós-corte'
  }
]);

/**
 * Avalia quais dos 7 relatórios do DataDivas e 3 relatórios bancários/maquininhas
 * foram importados com sucesso e gera alertas claros para os faltantes.
 */
export function assessCashReportCompleteness(parsedFiles = []) {
  const presentTypes = new Set();
  for (const item of parsedFiles || []) {
    const parsed = item?.parsed || item;
    if (!parsed || parsed.status !== 'ok' || !parsed.fileType) continue;
    presentTypes.add(parsed.fileType);
  }

  const mapStatus = (specs) => {
    const items = specs.map((spec) => {
      const types = spec.acceptedTypes || [spec.fileType];
      const present = types.some((t) => presentTypes.has(t));
      return { ...spec, present };
    });
    const present = items.filter((i) => i.present);
    const missing = items.filter((i) => !i.present);
    return {
      totalExpected: items.length,
      presentCount: present.length,
      items,
      present,
      missing
    };
  };

  const system = mapStatus(DATADIVAS_REPORT_SPECS);
  const bank = mapStatus(BANK_REPORT_SPECS);

  const totalExpected = system.totalExpected + bank.totalExpected;
  const totalPresent = system.presentCount + bank.presentCount;
  const percent = totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 0;

  const warnings = [];
  if (system.missing.length > 0) {
    warnings.push(
      `Faltam ${system.missing.length} de ${system.totalExpected} relatório(s) do sistema DataDivas: ${system.missing.map((m) => m.shortLabel).join(', ')}.`
    );
  }
  if (bank.missing.length > 0) {
    warnings.push(
      `Faltam ${bank.missing.length} de ${bank.totalExpected} relatório(s) de Banco/Maquininha: ${bank.missing.map((m) => m.shortLabel).join(', ')}.`
    );
  }

  return {
    totalExpected,
    totalPresent,
    percent,
    isComplete: system.missing.length === 0 && bank.missing.length === 0,
    system,
    bank,
    warnings
  };
}
