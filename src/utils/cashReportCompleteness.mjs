/**
 * Catálogo oficial e validador adaptativo de completude dos relatórios recomendados
 * para conciliação completa: 7 relatórios do sistema DataDivas + Banco(s)/Maquininhas.
 */

import {
  extractBankMetaFromParsedFile,
  normalizeRoutineProfile
} from './cashCompanyRoutineHelper.mjs';

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

function buildBankItemFromRoutine(bankEntry, present) {
  const bankLabel = bankEntry.bankLabel || bankEntry.bankKey;
  return {
    fileType: 'extrato_ofx',
    acceptedTypes: ['extrato_ofx', 'extrato_generico'],
    bankKey: bankEntry.bankKey,
    bankCode: bankEntry.bankCode || '',
    bankLabel,
    acctLast4: bankEntry.acctLast4 || '',
    label: `Extrato ${bankLabel} (OFX)`,
    shortLabel: `${bankLabel} (OFX)`,
    priority: 'essential',
    hint: bankEntry.acctLast4
      ? `Extrato bancário conta ••••${bankEntry.acctLast4} — Pix recebidos em conta corrente`
      : 'Extrato bancário (OFX / planilha) — Pix recebidos em conta corrente',
    present: Boolean(present),
    isLearnedBank: true,
    isHabitual: bankEntry.enabled !== false,
    seenCount: Number(bankEntry.seenCount || 0),
    lastSeenDate: bankEntry.lastSeenDate || '',
    enabled: bankEntry.enabled !== false
  };
}

/**
 * Avalia quais relatórios do DataDivas e Banco(s)/Maquininhas foram importados com sucesso
 * e gera alertas claros para os faltantes, respeitando a rotina aprendida da empresa quando informada.
 */
export function assessCashReportCompleteness(parsedFiles = [], companyProfile = null) {
  const presentTypes = new Set();
  const presentBankFilesByKey = new Map();
  let hasUnidentifiedBankUpload = false;

  for (const item of parsedFiles || []) {
    const parsed = item?.parsed || item;
    if (!parsed || parsed.status !== 'ok' || !parsed.fileType) continue;
    presentTypes.add(parsed.fileType);

    if (parsed.fileType === 'extrato_ofx' || parsed.fileType === 'extrato_generico') {
      const bankMeta = extractBankMetaFromParsedFile(item);
      if (bankMeta?.bankKey) {
        if (!presentBankFilesByKey.has(bankMeta.bankKey)) {
          presentBankFilesByKey.set(bankMeta.bankKey, bankMeta);
        }
      } else {
        hasUnidentifiedBankUpload = true;
      }
    }
  }

  const profile = companyProfile && typeof companyProfile === 'object'
    ? normalizeRoutineProfile(companyProfile)
    : null;
  const learnedBankEntries = profile ? Object.values(profile.banks || {}) : [];
  const hasLearnedBanksRecord = learnedBankEntries.length > 0;
  const hasLearnedReportsRecord = Boolean(profile && Object.keys(profile.reports || {}).length > 0);
  const hasLearnedRoutine = hasLearnedBanksRecord || hasLearnedReportsRecord;

  const mapCatalogSpec = (spec, isBankSlot = false) => {
    const types = spec.acceptedTypes || [spec.fileType];
    const present = types.some((t) => presentTypes.has(t));
    const reportEntry = profile?.reports?.[spec.fileType];
    const enabled = reportEntry ? reportEntry.enabled !== false : true;
    return {
      ...spec,
      present,
      isLearnedBank: false,
      isHabitual: Boolean(reportEntry && enabled),
      seenCount: reportEntry ? Number(reportEntry.seenCount || 0) : 0,
      lastSeenDate: reportEntry?.lastSeenDate || '',
      enabled,
      _excludeWhenDismissed: !isBankSlot && reportEntry && !enabled && !present
    };
  };

  // 1. Bloco DataDivas (7 relatórios, omitindo apenas os explicitamente dispensados quando ausentes)
  const systemItems = DATADIVAS_REPORT_SPECS
    .map((spec) => mapCatalogSpec(spec, false))
    .filter((item) => !item._excludeWhenDismissed)
    .map(({ _excludeWhenDismissed, ...rest }) => rest);

  // 2. Bloco Banco & Maquininhas
  const bankItems = [];
  if (!hasLearnedBanksRecord) {
    const defaultOfxSpec = BANK_REPORT_SPECS[0];
    const ofxPresent = (defaultOfxSpec.acceptedTypes || [defaultOfxSpec.fileType]).some((t) =>
      presentTypes.has(t)
    );
    bankItems.push({
      ...defaultOfxSpec,
      present: ofxPresent,
      isLearnedBank: false,
      isHabitual: false,
      seenCount: 0,
      lastSeenDate: '',
      enabled: true
    });
  } else {
    const enabledBanks = learnedBankEntries
      .filter((b) => b && b.enabled !== false)
      .sort((a, b) => String(a.bankLabel || a.bankKey).localeCompare(String(b.bankLabel || b.bankKey), 'pt-BR'));

    const includedBankKeys = new Set();
    for (const bankEntry of enabledBanks) {
      includedBankKeys.add(bankEntry.bankKey);
      bankItems.push(buildBankItemFromRoutine(bankEntry, presentBankFilesByKey.has(bankEntry.bankKey)));
    }

    // Exibe também novos bancos enviados no upload ativo antes de consolidar no perfil (ou bancos reenviados)
    for (const [uploadedKey, meta] of presentBankFilesByKey.entries()) {
      if (includedBankKeys.has(uploadedKey)) continue;
      const existingInProfile = profile?.banks?.[uploadedKey];
      bankItems.push({
        fileType: 'extrato_ofx',
        acceptedTypes: ['extrato_ofx', 'extrato_generico'],
        bankKey: meta.bankKey,
        bankCode: meta.bankCode || '',
        bankLabel: meta.bankLabel || meta.bankKey,
        acctLast4: meta.acctLast4 || '',
        label: `Extrato ${meta.bankLabel || meta.bankKey} (OFX)`,
        shortLabel: `${meta.bankLabel || meta.bankKey} (OFX)`,
        priority: 'essential',
        hint: meta.acctLast4
          ? `Extrato bancário conta ••••${meta.acctLast4} — importado nesta conferência`
          : 'Extrato bancário importado nesta conferência',
        present: true,
        isLearnedBank: Boolean(existingInProfile),
        isHabitual: Boolean(existingInProfile && existingInProfile.enabled !== false),
        seenCount: existingInProfile ? Number(existingInProfile.seenCount || 0) : 0,
        lastSeenDate: existingInProfile?.lastSeenDate || '',
        enabled: existingInProfile ? existingInProfile.enabled !== false : true
      });
    }

    if (hasUnidentifiedBankUpload && bankItems.length === 0) {
      bankItems.push({
        ...BANK_REPORT_SPECS[0],
        present: true,
        isLearnedBank: false,
        isHabitual: false,
        seenCount: 0,
        lastSeenDate: '',
        enabled: true
      });
    }
  }

  for (const acquirerSpec of BANK_REPORT_SPECS.slice(1)) {
    const mapped = mapCatalogSpec(acquirerSpec, false);
    if (mapped._excludeWhenDismissed) continue;
    const { _excludeWhenDismissed, ...rest } = mapped;
    bankItems.push(rest);
  }

  const summarizeBlock = (items) => {
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

  const system = summarizeBlock(systemItems);
  const bank = summarizeBlock(bankItems);

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
    const missingLearnedBanks = bank.missing.filter((m) => m.isLearnedBank);
    const missingOtherBanks = bank.missing.filter((m) => !m.isLearnedBank);

    for (const lb of missingLearnedBanks) {
      warnings.push(
        `Falta o extrato do ${lb.bankLabel || lb.shortLabel} (OFX) — banco aprendido na rotina diária desta empresa.`
      );
    }
    if (missingOtherBanks.length > 0) {
      warnings.push(
        `Faltam ${missingOtherBanks.length} de ${bank.totalExpected} relatório(s) de Banco/Maquininha: ${missingOtherBanks.map((m) => m.shortLabel).join(', ')}.`
      );
    }
  }

  const allItems = [...system.items, ...bank.items];
  const habitualItems = allItems.filter((i) => i.isHabitual);
  const habitualPresent = habitualItems.filter((i) => i.present);
  const habitualMissing = habitualItems.filter((i) => !i.present);

  return {
    totalExpected,
    totalPresent,
    percent,
    isComplete: system.missing.length === 0 && bank.missing.length === 0,
    hasLearnedRoutine,
    habitualExpectedCount: habitualItems.length,
    habitualPresentCount: habitualPresent.length,
    habitualMissingCount: habitualMissing.length,
    learnedBanks: learnedBankEntries,
    system,
    bank,
    warnings
  };
}
