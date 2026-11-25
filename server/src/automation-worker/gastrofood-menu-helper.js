/**
 * Pure domain helpers for GastroFood menu indexing, nested subitem search,
 * step free-quota pricing (`QtdFree`), and deterministic `FinalizeOrder` normalization.
 */

export const ZERO_VALUE_EXCEPTIONS = [
  'catchup', 'ketchup', 'guardanapo', 'molho', 'maionese',
  'mostarda', 'barbecue', 'brinde', 'cortesia', 'adicional',
  'sache', 'canudo', 'talher', 'limao', 'gelo', 'copo'
];

const SEARCH_STOPWORDS = new Set([
  'de', 'da', 'do', 'dos', 'das', 'e', 'o', 'a', 'os', 'as',
  'um', 'uma', 'com', 'para', 'no', 'na', 'nos', 'nas', 'em', 'por'
]);

const MODIFIER_TOKENS = new Set(['zero', 'light', 'diet', 'max', 'sem', 'caffeine']);

/**
 * Strips accents, normalizes beverage volume units (`600ml` -> `600 ml`),
 * replaces punctuation with spaces, and returns lowercase clean text.
 */
export function normalizeSearchText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+)\s*(ml|l|g|kg)\b/gi, '$1 $2')
    .replace(/[-_/.,:;!?()[\]{}'"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits normalized text into search tokens (drops stop-words when requested).
 */
export function tokenizeSearchTerms(value, { keepStopwords = false } = {}) {
  const norm = normalizeSearchText(value);
  if (!norm) return [];
  const raw = norm.split(' ').filter(Boolean);
  if (keepStopwords) return raw;
  const filtered = raw.filter(t => !SEARCH_STOPWORDS.has(t));
  return filtered.length > 0 ? filtered : raw;
}

/**
 * Strips trailing product/passo suffix from composite Supabase IDs (`<opt>_<step>_<prod>`).
 */
export function extractRawGastrofoodId(compositeId) {
  if (!compositeId) return '';
  const str = String(compositeId).trim();
  if (!str.includes('_')) return str;
  return str.split('_')[0];
}

/**
 * Checks whether a R$ 0,00 catalog item is a legitimate free courtesy/condiment.
 */
export function isLegitimateZeroValueItem(name, description = '') {
  const text = normalizeSearchText(`${name || ''} ${description || ''}`);
  if (!text) return false;
  return ZERO_VALUE_EXCEPTIONS.some(term => text.includes(term));
}

/**
 * Extracts price from GastroFood option payloads (`ListaPreco[0].Preco` or direct fields).
 */
export function extractOptionPrice(option) {
  if (!option || typeof option !== 'object') return 0;
  if (Array.isArray(option.ListaPreco) && option.ListaPreco.length > 0) {
    const firstPrice = Number(option.ListaPreco[0]?.Preco ?? option.ListaPreco[0]?.preco ?? 0);
    if (!Number.isNaN(firstPrice)) return firstPrice;
  }
  const candidate = option.preco ?? option.price ?? option.Preco ?? option.Price ?? option.valor ?? 0;
  const parsed = Number(candidate);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Parses live GastroFood `ProdutoComPassos` response into canonical step & option objects.
 */
export function parseGastrofoodStepsResponse(stepsData, productId) {
  const productRaw = stepsData?.product && typeof stepsData.product === 'object' ? stepsData.product : null;
  const productMeta = productRaw
    ? {
        id: String(productRaw.IdProduto || productRaw.id || productId || ''),
        codigo: String(productRaw.Codigo || productRaw.code || '').trim(),
        codigo_pdv: String(productRaw.CodigoPdv || productRaw.externalCode || '').trim(),
        name: String(productRaw.Descricao || productRaw.name || '').trim(),
        price: extractOptionPrice(productRaw)
      }
    : null;

  let passosList = [];
  if (Array.isArray(stepsData)) passosList = stepsData;
  else if (Array.isArray(stepsData?.passos)) passosList = stepsData.passos;
  else if (Array.isArray(stepsData?.ListaPassos)) passosList = stepsData.ListaPassos;
  else if (Array.isArray(stepsData?.data?.passos)) passosList = stepsData.data.passos;
  else if (Array.isArray(stepsData?.data)) passosList = stepsData.data;

  const resolvedProductId = String(productId || productMeta?.id || '');
  const passos = [];

  for (let i = 0; i < passosList.length; i++) {
    const ps = passosList[i];
    if (!ps || ps.Ativo === false || ps.Status === 0) continue;

    const rawPassoId = String(ps.IdProdutoPassos || ps.id || ps.Id || ps.PassoId || `step_${i}`);
    const compositePassoId = resolvedProductId && !rawPassoId.includes('_')
      ? `${rawPassoId}_${resolvedProductId}`
      : rawPassoId;

    const perguntaText = String(
      ps.Pergunta || ps.pergunta || ps.SubTitulo || ps.sub_titulo || ps.FkGrupo?.Descricao || ps.Nome || ps.nome || 'Opções'
    ).trim() || 'Opções';
    const subTituloText = String(ps.SubTitulo || ps.sub_titulo || '').trim();

    const qtdMin = Math.max(0, Number(ps.QtdMin ?? ps.qtd_min ?? 0) || 0);
    const rawMax = Number(ps.QtdMax ?? ps.qtd_max ?? 1);
    const qtdMax = Math.max(qtdMin, Number.isNaN(rawMax) ? 1 : rawMax);
    const qtdFree = Math.max(0, Number(ps.QtdFree ?? ps.qtd_free ?? 0) || 0);
    const numeroPasso = Number(ps.NumeroPasso ?? ps.numero_passo ?? ps.ordem ?? (i + 1));
    const tipoCalcCustom = Number(ps.TipoCalcCustom ?? ps.tipo_calc_custom ?? 0) || 0;
    const obrigatorio = Boolean(ps.Obrigatoriedade === true || ps.obrigatorio === true);
    const passoAdicionais = Boolean(ps.PassoAdicionais === true || ps.passo_adicionais === true);

    const rawOpcoes = Array.isArray(ps.ListaProdutos)
      ? ps.ListaProdutos
      : (Array.isArray(ps.opcoes) ? ps.opcoes : (Array.isArray(ps.Itens) ? ps.Itens : []));

    const opcoes = [];
    for (let j = 0; j < rawOpcoes.length; j++) {
      const opt = rawOpcoes[j];
      if (!opt) continue;
      if (opt.Ativo === false || opt.ativo === false || opt.Status === 0 || opt.Status === 2) continue;

      const descricao = String(opt.Descricao || opt.descricao || opt.Name || opt.name || '').trim();
      if (!descricao) continue; // Guards corrupt blank GastroFood rows like Código 1064

      const rawOptId = String(opt.IdProduto || opt.id || opt.Id || opt.Codigo || `opt_${j}`);
      const compositeOptId = rawOptId.includes('_')
        ? rawOptId
        : `${rawOptId}_${compositePassoId}`;

      opcoes.push({
        id: compositeOptId,
        raw_opcao_id: extractRawGastrofoodId(rawOptId),
        produto_opcao_id: opt.IdProduto ? String(opt.IdProduto) : null,
        passo_id: compositePassoId,
        codigo: String(opt.Codigo || opt.codigo || opt.code || '').trim(),
        codigo_pdv: String(opt.CodigoPdv || opt.codigo_pdv || opt.externalCode || '').trim(),
        descricao,
        preco: extractOptionPrice(opt),
        imagem: opt.Imagem || opt.imagem || null,
        ativo: true,
        ordem: Number(opt.Ordem ?? opt.ordem ?? j) || j
      });
    }

    passos.push({
      id: compositePassoId,
      raw_passo_id: extractRawGastrofoodId(rawPassoId),
      produto_id: resolvedProductId,
      pergunta: perguntaText,
      sub_titulo: subTituloText || perguntaText,
      qtd_min: qtdMin,
      qtd_max: qtdMax,
      qtd_free: qtdFree,
      numero_passo: Number.isNaN(numeroPasso) ? (i + 1) : numeroPasso,
      tipo_calc_custom: tipoCalcCustom,
      obrigatorio,
      passo_adicionais: passoAdicionais,
      ordem: Number(ps.NumeroPasso ?? ps.ordem ?? i) || i,
      ativo: true,
      opcoes
    });
  }

  passos.sort((a, b) => (a.numero_passo ?? a.ordem ?? 0) - (b.numero_passo ?? b.ordem ?? 0));
  return { productMeta, passos };
}

/**
 * Determines whether a product is valid for the live menu, keeping R$ 0,00 products
 * that derive pricing/choices from active steps (like Refrigerante 600ml, 2L, Água, Açaí).
 */
export function shouldKeepCatalogProduct(product, productSteps = []) {
  if (!product || product.ativo === false || product.active === false) return false;
  const price = Number(product.price || 0);
  if (price > 0) return true;
  if (isLegitimateZeroValueItem(product.name, product.description)) return true;
  if (Array.isArray(productSteps) && productSteps.some(st => st?.ativo !== false && Array.isArray(st.opcoes) && st.opcoes.length > 0)) {
    return true;
  }
  return false;
}

/**
 * Returns a product's effective minimum display price (computing minimum required option cost for "A partir de" zero-base items).
 */
export function computeProductMinDisplayPrice(product, productSteps = []) {
  const base = Number(product?.price || 0);
  if (base > 0) return Number(base.toFixed(2));
  if (!Array.isArray(productSteps) || productSteps.length === 0) return 0;

  let addedFromSteps = 0;
  for (const st of productSteps) {
    if (!st || st.ativo === false || !Array.isArray(st.opcoes) || st.opcoes.length === 0) continue;
    const minNeeded = Math.max(0, Number(st.qtd_min ?? 0));
    const freeQuota = Math.max(0, Number(st.qtd_free ?? 0));
    const isRequired = Boolean(st.obrigatorio || minNeeded > 0);
    if (!isRequired) continue;

    const paidSlots = Math.max(0, Math.max(1, minNeeded) - freeQuota);
    if (paidSlots === 0) continue;

    const priced = st.opcoes.map(o => Number(o.preco || 0)).filter(p => p >= 0).sort((a, b) => a - b);
    if (priced.length > 0) {
      // If all non-zero options represent item size/flavor, use minimum positive price when min=0 option doesn't exist
      const nonZero = priced.filter(p => p > 0);
      const minOpt = nonZero.length > 0 && priced[0] === 0 && minNeeded > 0 && st.opcoes.length === nonZero.length
        ? nonZero[0]
        : priced[0];
      addedFromSteps += minOpt * paidSlots;
    }
  }
  return Number((base + addedFromSteps).toFixed(2));
}

function scoreTextMatch(queryRaw, candidateRaw) {
  const qNorm = normalizeSearchText(queryRaw);
  const cNorm = normalizeSearchText(candidateRaw);
  if (!qNorm || !cNorm) return 0;
  if (qNorm === cNorm) return 1000;

  const qTokens = tokenizeSearchTerms(qNorm);
  const cTokens = tokenizeSearchTerms(cNorm);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  let score = 0;
  if (cNorm.startsWith(qNorm)) score = 700;
  else if (qNorm.startsWith(cNorm) && cNorm.length >= 3) score = 650;
  else if (cNorm.includes(qNorm)) score = 580;
  else if (qNorm.includes(cNorm) && cNorm.length >= 3) score = 540;

  const cSet = new Set(cTokens);
  const overlap = qTokens.filter(t => cSet.has(t) || cTokens.some(ct => ct.startsWith(t) || (ct.length >= 4 && t.startsWith(ct))));
  const overlapRatioQuery = overlap.length / qTokens.length;
  const overlapRatioCand = overlap.length / cTokens.length;

  if (score === 0 && overlap.length > 0) {
    score = Math.round(overlapRatioQuery * 380 + overlapRatioCand * 140);
  } else if (score > 0) {
    score += Math.round(overlapRatioCand * 80);
  }

  // Strongly prefer exact modifier presence (`zero`, `light`, `sem`, etc.) matching the query
  for (const mod of MODIFIER_TOKENS) {
    const qHas = qTokens.includes(mod);
    const cHas = cTokens.includes(mod);
    if (qHas && !cHas) score -= 220;
    else if (!qHas && cHas) score -= 90;
  }

  // Slight tie-breaker favoring tighter names over noisy long names
  score -= Math.min(40, Math.abs(cTokens.length - qTokens.length) * 8);
  return Math.max(0, score);
}

function computeNestedContainerScore(queryRaw, opt, optScore, parentProduct, activeSteps) {
  const qTokens = tokenizeSearchTerms(queryRaw);
  const optTokens = tokenizeSearchTerms(opt.descricao);
  const parentTokens = tokenizeSearchTerms(parentProduct?.name || '');
  const combinedSet = new Set([...optTokens, ...parentTokens]);

  let matchedTokens = 0;
  for (const t of qTokens) {
    if (combinedSet.has(t) || [...combinedSet].some(ct => ct.startsWith(t) || (ct.length >= 4 && t.startsWith(ct)))) {
      matchedTokens++;
    }
  }
  const tokenCoverageRatio = qTokens.length > 0 ? (matchedTokens / qTokens.length) : 0;
  const coverageAdjustment = tokenCoverageRatio === 1 ? 260 : (tokenCoverageRatio < 0.7 ? -220 : 0);

  const activeCount = (activeSteps || []).filter(s => s && s.ativo !== false).length;
  let simplicityAdjustment = 0;
  if (activeCount <= 1) simplicityAdjustment = 240;
  else if (activeCount === 2) simplicityAdjustment = 140;
  else simplicityAdjustment = -(activeCount - 2) * 140;

  const isComboParent = normalizeSearchText(parentProduct?.name || '').includes('combo');
  const queryMentionsCombo = normalizeSearchText(queryRaw).includes('combo');
  const comboPenalty = (isComboParent && !queryMentionsCombo) ? -160 : 0;

  return Math.max(0, Math.round(optScore + coverageAdjustment + simplicityAdjustment + comboPenalty));
}

/**
 * Searches parent products AND nested subitems/flavors/sides (`cardapio_opcoes`).
 * Ensures items like "Coca-Cola" inside "Refrigerante 350 ml" or "Purê" inside "OMELETE" are always found.
 */
export function searchCatalogAndSubitems({ produtos = [], grupos = [], passosByProduto = new Map(), termo = '', limit = 15 }) {
  const grupoMap = new Map();
  for (const g of grupos) {
    if (g && g.id) grupoMap.set(g.id, g.descricao || 'Geral');
  }

  const getSteps = (produtoId) => {
    if (passosByProduto instanceof Map) return passosByProduto.get(produtoId) || [];
    return passosByProduto?.[produtoId] || [];
  };

  const activeProducts = produtos.filter(p => shouldKeepCatalogProduct(p, getSteps(p.id)));
  const cleanTerm = normalizeSearchText(termo);

  const ranked = [];
  const subitemHighlights = [];

  for (const p of activeProducts) {
    const catName = grupoMap.get(p.grupo_id) || p.categoria || 'Geral';
    const steps = getSteps(p.id);
    const minDisplayPrice = computeProductMinDisplayPrice(p, steps);

    const parentScore = cleanTerm
      ? Math.max(
          scoreTextMatch(cleanTerm, p.name),
          Math.round(scoreTextMatch(cleanTerm, p.description || '') * 0.65),
          Math.round(scoreTextMatch(cleanTerm, catName) * 0.55)
        )
      : 100;

    const matchedSubitems = [];
    let bestOptionRankScore = 0;

    for (const st of steps) {
      if (!st || st.ativo === false) continue;
      for (const opt of (st.opcoes || [])) {
        if (!opt || opt.ativo === false) continue;
        const optScore = cleanTerm ? scoreTextMatch(cleanTerm, opt.descricao) : 0;
        if (optScore >= 240) {
          const nestedRankScore = computeNestedContainerScore(cleanTerm, opt, optScore, p, steps);
          if (nestedRankScore > bestOptionRankScore) bestOptionRankScore = nestedRankScore;
          const freeQuota = Number(st.qtd_free ?? 0);
          const optPrice = Number(opt.preco || 0);
          const includedInBase = freeQuota > 0 && Number(p.price || 0) > 0;
          const cotaInfo = includedInBase
            ? `Incluso na cota grátis do passo (${freeQuota} grátis; após cota +R$ ${optPrice.toFixed(2)})`
            : optPrice > 0
              ? `R$ ${optPrice.toFixed(2)}${Number(p.price || 0) === 0 ? ' (preço desta opção)' : ' (adicional)'}`
              : 'Grátis (R$ 0,00)';

          const matchEntry = {
            produto_pai_id: p.id,
            produto_pai_nome: p.name,
            produto_pai_preco: minDisplayPrice,
            passo_id: st.raw_passo_id || extractRawGastrofoodId(st.id),
            passo_nome: st.pergunta || st.sub_titulo,
            numero_passo: st.numero_passo ?? 1,
            qtd_free: freeQuota,
            opcao_id: opt.raw_opcao_id || extractRawGastrofoodId(opt.id),
            opcao_codigo: opt.codigo || '',
            opcao_codigo_pdv: opt.codigo_pdv || '',
            opcao_nome: opt.descricao,
            preco_opcao: optPrice,
            cota_gratis_info: cotaInfo,
            _score: nestedRankScore
          };
          matchedSubitems.push(matchEntry);
          subitemHighlights.push(matchEntry);
        }
      }
    }

    const combinedScore = Math.max(parentScore, bestOptionRankScore);
    if (!cleanTerm || combinedScore >= 220) {
      matchedSubitems.sort((a, b) => b._score - a._score);
      const formattedPassosResumo = steps.map(st => {
        const free = Number(st.qtd_free ?? 0);
        const obg = Boolean(st.obrigatorio || Number(st.qtd_min || 0) > 0);
        return `${st.pergunta || st.sub_titulo}${obg ? ' [OBRIGATÓRIO]' : ''}${free > 0 ? ` [${free} grátis]` : ''}`;
      });

      ranked.push({
        id: p.id,
        codigo: p.codigo || '',
        codigo_pdv: p.codigo_pdv || '',
        nome: p.name,
        categoria: catName,
        preco: Number(p.price || 0),
        preco_exibicao: minDisplayPrice,
        preco_texto: Number(p.price || 0) === 0 && minDisplayPrice > 0
          ? `A partir de R$ ${minDisplayPrice.toFixed(2).replace('.', ',')}`
          : `R$ ${Number(p.price || 0).toFixed(2).replace('.', ',')}`,
        descricao: p.description ? String(p.description).slice(0, 180) : '',
        possui_passos: steps.length > 0,
        passos_resumo: formattedPassosResumo,
        subitens_correspondentes: matchedSubitems.slice(0, 8).map(({ _score, ...rest }) => rest),
        _score: combinedScore
      });
    }
  }

  ranked.sort((a, b) => b._score - a._score || a.preco_exibicao - b.preco_exibicao);
  subitemHighlights.sort((a, b) => b._score - a._score || a.produto_pai_preco - b.produto_pai_preco);

  return {
    total_disponivel: activeProducts.length,
    resultados: ranked.slice(0, limit).map(({ _score, ...rest }) => rest),
    encontrados_como_sabores_ou_adicionais: subitemHighlights.slice(0, 12).map(({ _score, ...rest }) => rest)
  };
}

/**
 * Formats steps cleanly for Gemini tool responses so the model understands mandatory flags,
 * `qtd_gratis`, `tipo_calc_custom`, and exact option codes/prices.
 */
export function formatStepsForAITool(product, steps = []) {
  const basePrice = Number(product?.price || 0);
  const formattedPassos = (steps || [])
    .filter(st => st && st.ativo !== false)
    .sort((a, b) => (a.numero_passo ?? a.ordem ?? 0) - (b.numero_passo ?? b.ordem ?? 0))
    .map(st => {
      const qtdMin = Number(st.qtd_min ?? 0);
      const qtdMax = Number(st.qtd_max ?? 1);
      const qtdFree = Number(st.qtd_free ?? 0);
      const obrigatorio = Boolean(st.obrigatorio || qtdMin > 0);
      const rawPassoId = st.raw_passo_id || extractRawGastrofoodId(st.id);

      let regraCobranca = '';
      if (qtdFree > 0) {
        regraCobranca = `${qtdFree} unidade(s)/item(ns) GRÁTIS já inclusos na cota deste passo (valor R$ 0,00). Itens extras além dos ${qtdFree} grátis serão cobrados pelo valor unitário de cada opção.`;
      } else if (basePrice === 0) {
        regraCobranca = `Produto com preço definido pela escolha deste passo (some o preço da opção escolhida).`;
      } else {
        regraCobranca = `Cada item selecionado soma seu respectivo preço adicional ao valor base do produto.`;
      }

      return {
        passo_id: rawPassoId,
        numero_passo: Number(st.numero_passo ?? 1),
        tipo_calc_custom: Number(st.tipo_calc_custom ?? 0),
        pergunta: st.pergunta || st.sub_titulo || 'Opções',
        obrigatorio,
        qtd_minima: qtdMin,
        qtd_maxima: qtdMax,
        qtd_gratis: qtdFree,
        regra_cobranca: regraCobranca,
        opcoes: (st.opcoes || [])
          .filter(o => o && o.ativo !== false && String(o.descricao || '').trim().length > 0)
          .map(o => {
            const p = Number(o.preco || 0);
            return {
              id: o.raw_opcao_id || extractRawGastrofoodId(o.id),
              codigo: o.codigo || '',
              codigo_pdv: o.codigo_pdv || '',
              descricao: o.descricao,
              preco: p,
              texto_preco: qtdFree > 0
                ? `R$ 0,00 dentro dos ${qtdFree} grátis (após cota: +R$ ${p.toFixed(2).replace('.', ',')})`
                : (p > 0 ? `+R$ ${p.toFixed(2).replace('.', ',')}` : 'Grátis')
            };
          })
      };
    });

  return {
    produto_id: product?.id || '',
    codigo: product?.codigo || '',
    codigo_pdv: product?.codigo_pdv || '',
    produto: product?.name || '',
    preco_base: basePrice,
    possui_passos: formattedPassos.length > 0,
    passos: formattedPassos
  };
}

function isBooleanNegativeInput(value) {
  const norm = normalizeSearchText(value);
  return norm === 'nao' || norm.startsWith('nao ') || norm.startsWith('sem ') || norm === 'nenhum' || norm === 'nenhuma';
}

/**
 * Matches a single requested custom option against the steps of a product.
 * Supports IDs, GastroFood numeric `Codigo`, `CodigoPdv`, exact text, or fuzzy synonym match.
 */
export function matchOptionAcrossSteps(steps = [], requestedOpt = {}) {
  const reqId = extractRawGastrofoodId(requestedOpt.id || '');
  const reqCode = String(requestedOpt.code || requestedOpt.codigo || '').trim();
  const reqCodePdv = String(requestedOpt.codePdv || requestedOpt.codigo_pdv || '').trim();
  const reqFkPasso = extractRawGastrofoodId(requestedOpt.fkPasso || requestedOpt.stepId || '');
  const reqName = String(requestedOpt.name || requestedOpt.descricao || requestedOpt.opcao || '').trim();

  const candidateSteps = reqFkPasso
    ? steps.filter(st => extractRawGastrofoodId(st.id) === reqFkPasso || st.raw_passo_id === reqFkPasso)
    : steps;
  const searchSteps = candidateSteps.length > 0 ? candidateSteps : steps;

  let bestMatch = null;
  let bestScore = -1;

  for (const st of searchSteps) {
    if (!st || st.ativo === false) continue;
    for (const opt of (st.opcoes || [])) {
      if (!opt || opt.ativo === false) continue;
      const optRawId = opt.raw_opcao_id || extractRawGastrofoodId(opt.id);

      // Exact code or ID match wins immediately
      if ((reqCode && opt.codigo && reqCode === opt.codigo) || (reqId && (optRawId === reqId || opt.id === reqId))) {
        return { step: st, option: opt, score: 2000 };
      }
      if (reqCodePdv && reqCodePdv !== 'C' && opt.codigo_pdv && reqCodePdv === opt.codigo_pdv) {
        return { step: st, option: opt, score: 1900 };
      }

      if (reqName) {
        let s = scoreTextMatch(reqName, opt.descricao);
        // Handle "Não" / "Sem descartáveis" on boolean steps ("Sim." / "Não.")
        const optNorm = normalizeSearchText(opt.descricao);
        if (optNorm === 'nao' && isBooleanNegativeInput(reqName)) {
          s = Math.max(s, 850);
        }
        if (s > bestScore) {
          bestScore = s;
          bestMatch = { step: st, option: opt, score: s };
        }
      }
    }
  }

  return bestMatch && bestScore >= 240 ? bestMatch : null;
}

/**
 * Applies `QtdFree`, validates mandatory/max bounds, and returns exact GastroFood `itemsCuston`
 * entries along with extra cost and missing mandatory steps.
 */
export function computeStepOptionsPricingAndBuildCustomItems({ product, steps = [], requestedOptions = [] }) {
  const basePrice = Number(product?.price || 0);
  const selectionsByStep = new Map();
  const unmatchedOptions = [];

  for (const req of (requestedOptions || [])) {
    if (!req) continue;
    const reqObj = typeof req === 'string' ? { name: req, amount: 1 } : req;
    const amount = Math.max(1, Number(reqObj.amount ?? reqObj.quantity ?? reqObj.qtd ?? 1) || 1);
    const match = matchOptionAcrossSteps(steps, reqObj);

    if (!match) {
      unmatchedOptions.push(reqObj);
      continue;
    }

    const stepKey = match.step.id;
    if (!selectionsByStep.has(stepKey)) selectionsByStep.set(stepKey, []);
    selectionsByStep.get(stepKey).push({ option: match.option, amount, step: match.step });
  }

  const itemsCuston = [];
  const missingMandatorySteps = [];
  const exceededMaxSteps = [];
  let extrasTotal = 0;

  for (const st of (steps || [])) {
    if (!st || st.ativo === false) continue;
    const rawPassoId = st.raw_passo_id || extractRawGastrofoodId(st.id);
    const numberPasso = Number(st.numero_passo ?? 1);
    const typeCalc = Number(st.tipo_calc_custom ?? 0) || 0;
    const qtdMin = Math.max(0, Number(st.qtd_min ?? 0));
    const qtdMax = Number(st.qtd_max ?? 0);
    const isMandatory = Boolean(st.obrigatorio || qtdMin > 0);

    const stepSelections = selectionsByStep.get(st.id) || [];
    let selectedTotal = 0;
    let freeRemaining = Math.max(0, Number(st.qtd_free ?? 0));

    for (const sel of stepSelections) {
      const { option, amount } = sel;
      selectedTotal += amount;
      const optPrice = Number(option.preco || 0);
      const optCode = option.codigo || option.raw_opcao_id || extractRawGastrofoodId(option.id);
      const optCodePdv = option.codigo_pdv || optCode || 'C';
      const optName = String(option.descricao || '').slice(0, 60);

      if (freeRemaining >= amount) {
        itemsCuston.push({
          code: String(optCode),
          codePdv: String(optCodePdv),
          name: optName,
          amount,
          price: 0,
          typeCalc,
          fkPasso: String(rawPassoId),
          numberPasso
        });
        freeRemaining -= amount;
      } else if (freeRemaining > 0) {
        const freeQty = freeRemaining;
        const paidQty = amount - freeRemaining;
        freeRemaining = 0;
        itemsCuston.push({
          code: String(optCode),
          codePdv: String(optCodePdv),
          name: optName,
          amount: freeQty,
          price: 0,
          typeCalc,
          fkPasso: String(rawPassoId),
          numberPasso
        });
        itemsCuston.push({
          code: String(optCode),
          codePdv: String(optCodePdv),
          name: optName,
          amount: paidQty,
          price: optPrice,
          typeCalc,
          fkPasso: String(rawPassoId),
          numberPasso
        });
        extrasTotal += optPrice * paidQty;
      } else {
        itemsCuston.push({
          code: String(optCode),
          codePdv: String(optCodePdv),
          name: optName,
          amount,
          price: optPrice,
          typeCalc,
          fkPasso: String(rawPassoId),
          numberPasso
        });
        extrasTotal += optPrice * amount;
      }
    }

    const requiredCount = Math.max(qtdMin, st.obrigatorio ? 1 : 0);
    const activeOptionsCount = (st.opcoes || []).filter(o => o && o.ativo !== false).length;
    if (isMandatory && activeOptionsCount > 0 && selectedTotal < requiredCount) {
      missingMandatorySteps.push({
        passo_id: rawPassoId,
        pergunta: st.pergunta || st.sub_titulo,
        qtd_minima: requiredCount,
        selecionado: selectedTotal,
        opcoes_disponiveis: (st.opcoes || []).slice(0, 15).map(o => ({
          codigo: o.codigo,
          descricao: o.descricao,
          preco: Number(o.preco || 0)
        }))
      });
    }
    if (qtdMax > 0 && selectedTotal > qtdMax) {
      exceededMaxSteps.push({
        passo_id: rawPassoId,
        pergunta: st.pergunta || st.sub_titulo,
        qtd_maxima: qtdMax,
        selecionado: selectedTotal
      });
    }
  }

  return {
    base_price: Number(basePrice.toFixed(2)),
    extras_total: Number(extrasTotal.toFixed(2)),
    unit_total: Number((basePrice + extrasTotal).toFixed(2)),
    itemsCuston,
    unmatched_options: unmatchedOptions,
    missing_mandatory_steps: missingMandatorySteps,
    exceeded_max_steps: exceededMaxSteps
  };
}

function findProductForOrderItem(rawItem, produtos = [], passosByProduto = new Map()) {
  const rawCode = extractRawGastrofoodId(rawItem.id || rawItem.code || rawItem.codigo || '');
  const rawCodePdv = String(rawItem.codePdv || rawItem.codigo_pdv || '').trim();
  const rawName = String(rawItem.name || '').trim();

  // 1. Direct UUID or numeric Codigo match
  if (rawCode) {
    const byId = produtos.find(p => p.id === rawCode || (p.codigo && p.codigo === rawCode));
    if (byId) return { product: byId, promotedOption: null };
  }
  if (rawCodePdv) {
    const byPdv = produtos.find(p => p.codigo_pdv && p.codigo_pdv === rawCodePdv);
    if (byPdv) return { product: byPdv, promotedOption: null };
  }

  // 2. Fuzzy parent product match (filtering out zero-price dummies without steps)
  const validProducts = produtos.filter(p => {
    const st = passosByProduto instanceof Map ? (passosByProduto.get(p.id) || []) : (passosByProduto?.[p.id] || []);
    return shouldKeepCatalogProduct(p, st);
  });

  if (rawName) {
    let bestParent = null;
    let bestParentScore = 0;
    for (const p of validProducts) {
      const s = scoreTextMatch(rawName, p.name);
      if (s > bestParentScore) {
        bestParentScore = s;
        bestParent = p;
      }
    }
    if (bestParent && bestParentScore >= 450) {
      return { product: bestParent, promotedOption: null };
    }

    // 3. Fallback: LLM might have ordered a nested child option (e.g. "Coca Cola 600ml") as a top-level item!
    const desiredPrice = Number(rawItem.price || 0);
    let bestNested = null;
    let bestNestedScore = 0;

    for (const p of validProducts) {
      const steps = passosByProduto instanceof Map ? (passosByProduto.get(p.id) || []) : (passosByProduto?.[p.id] || []);
      for (const st of steps) {
        if (!st || st.ativo === false) continue;
        for (const opt of (st.opcoes || [])) {
          if (!opt || opt.ativo === false) continue;
          const optScore = Math.max(
            scoreTextMatch(rawName, opt.descricao),
            scoreTextMatch(rawName, `${opt.descricao} ${p.name}`)
          );
          if (optScore < 240) continue;
          let s = computeNestedContainerScore(rawName, opt, optScore, p, steps);
          if (desiredPrice > 0) {
            const effPrice = Number(p.price || 0) > 0 && Number(st.qtd_free || 0) > 0
              ? Number(p.price || 0)
              : Number(p.price || 0) + Number(opt.preco || 0);
            if (Math.abs(effPrice - desiredPrice) < 0.05) s += 180;
          }
          if (s > bestNestedScore) {
            bestNestedScore = s;
            bestNested = { product: p, promotedOption: { name: opt.descricao, code: opt.codigo, fkPasso: st.raw_passo_id || extractRawGastrofoodId(st.id), amount: 1 } };
          }
        }
      }
    }
    if (bestNested && bestNestedScore >= 320) {
      return bestNested;
    }
    if (bestParent && bestParentScore >= 240) {
      return { product: bestParent, promotedOption: null };
    }
  }

  return { product: null, promotedOption: null };
}

/**
 * Resolves items against catalog + steps, preserves real GastroFood codes without UUID truncation,
 * recomputes accurate free-quota pricing, prevents double-counting zero-base items, and injects `storeId`.
 */
export function resolveAndNormalizeGastrofoodOrder(payload, catalog = { produtos: [], passosByProduto: new Map() }, defaultStoreId = null) {
  if (!payload || typeof payload !== 'object') return { payload, missingMandatoryWarnings: [] };

  const cloned = JSON.parse(JSON.stringify(payload));
  const jsOrder = cloned.jsOrder && typeof cloned.jsOrder === 'object' ? cloned.jsOrder : cloned;
  if (!jsOrder.storeId && defaultStoreId) jsOrder.storeId = defaultStoreId;
  if (cloned.jsOrder && !cloned.storeId && defaultStoreId) cloned.storeId = defaultStoreId;

  const produtos = catalog?.produtos || [];
  const passosByProduto = catalog?.passosByProduto || new Map();

  let calculatedSubTotal = 0;
  const missingMandatoryWarnings = [];
  const rawItems = Array.isArray(jsOrder.items) ? jsOrder.items : [];

  jsOrder.items = rawItems.map(item => {
    const amount = Math.max(1, Number(item.amount || item.quantity || item.qtd || 1) || 1);
    const { product, promotedOption } = findProductForOrderItem(item, produtos, passosByProduto);
    const rawCustom = Array.isArray(item.itemsCuston)
      ? [...item.itemsCuston]
      : (Array.isArray(item.customItems) ? [...item.customItems] : (Array.isArray(item.adicionais) ? [...item.adicionais] : []));

    if (promotedOption && rawCustom.length === 0) {
      rawCustom.push(promotedOption);
    }

    if (product) {
      const steps = passosByProduto instanceof Map
        ? (passosByProduto.get(product.id) || [])
        : (passosByProduto?.[product.id] || []);

      if (steps.length > 0) {
        const computed = computeStepOptionsPricingAndBuildCustomItems({
          product,
          steps,
          requestedOptions: rawCustom
        });

        for (const miss of computed.missing_mandatory_steps) {
          missingMandatoryWarnings.push({ produto: product.name, ...miss });
        }

        // Preserve any unmatched custom options cleanly without corrupting codes
        const fallbackCustom = computed.unmatched_options.map(u => {
          const cleanCode = extractRawGastrofoodId(u.code || u.id || '');
          const cleanPasso = extractRawGastrofoodId(u.fkPasso || u.stepId || '');
          return {
            code: String(cleanCode).slice(0, 40),
            codePdv: String(u.codePdv || cleanCode || 'C').slice(0, 40),
            name: String(u.name || '').slice(0, 60),
            amount: Number(u.amount || u.quantity || 1),
            price: Number(u.price || 0),
            typeCalc: u.typeCalc !== undefined ? Number(u.typeCalc) : 0,
            fkPasso: String(cleanPasso).slice(0, 40),
            numberPasso: u.numberPasso !== undefined ? Number(u.numberPasso) : 1
          };
        });

        const allCustom = [...computed.itemsCuston, ...fallbackCustom];
        const fallbackExtra = fallbackCustom.reduce((sum, c) => sum + (c.price * c.amount), 0);
        const unitTotal = computed.unit_total + fallbackExtra;
        calculatedSubTotal += unitTotal * amount;

        const parentCode = String(product.codigo || item.code || product.id || '1').slice(0, 40);
        const parentCodePdv = String(product.codigo_pdv || item.codePdv || parentCode || '0').slice(0, 40);

        return {
          code: parentCode,
          codePdv: parentCodePdv,
          name: String(product.name || item.name || '').slice(0, 100),
          amount,
          unitary: String(item.unitary || 'UN').slice(0, 10),
          price: computed.base_price,
          complement: String(item.complement || item.notes || '').slice(0, 200),
          itemsCuston: allCustom
        };
      }

      // Product found without steps
      const catalogPrice = Number(product.price || item.price || 0);
      calculatedSubTotal += catalogPrice * amount;
      const parentCode = String(product.codigo || item.code || product.id || '1').slice(0, 40);
      const parentCodePdv = String(product.codigo_pdv || item.codePdv || parentCode || '0').slice(0, 40);

      return {
        code: parentCode,
        codePdv: parentCodePdv,
        name: String(product.name || item.name || '').slice(0, 100),
        amount,
        unitary: String(item.unitary || 'UN').slice(0, 10),
        price: catalogPrice,
        complement: String(item.complement || item.notes || '').slice(0, 200),
        itemsCuston: []
      };
    }

    // Fallback if item wasn't in catalog at all: sanitize without slicing UUIDs in half!
    const price = Number(item.price || item.unitaryPrice || item.unitary || 0);
    const normalizedCustom = rawCustom.map(c => {
      const cleanCode = extractRawGastrofoodId(c.code || c.id || '');
      const cleanFkPasso = extractRawGastrofoodId(c.fkPasso || c.stepId || '');
      return {
        code: String(cleanCode).slice(0, 40),
        codePdv: String(c.codePdv || cleanCode || 'C').slice(0, 40),
        name: String(c.name || '').slice(0, 60),
        amount: Number(c.amount || c.quantity || 1),
        price: Number(c.price || 0),
        typeCalc: c.typeCalc !== undefined ? Number(c.typeCalc) : 0,
        fkPasso: String(cleanFkPasso).slice(0, 40),
        numberPasso: c.numberPasso !== undefined ? Number(c.numberPasso) : 1
      };
    });
    const customExtras = normalizedCustom.reduce((sum, c) => sum + (c.price * c.amount), 0);
    calculatedSubTotal += (price + customExtras) * amount;

    return {
      code: String(item.code || item.id || '1').slice(0, 40),
      codePdv: String(item.codePdv || item.code || item.id || '0').slice(0, 40),
      name: String(item.name || '').slice(0, 100),
      amount,
      unitary: String(item.unitary || 'UN').slice(0, 10),
      price,
      complement: String(item.complement || item.notes || '').slice(0, 200),
      itemsCuston: normalizedCustom
    };
  });

  const txDelivery = Number(jsOrder.txDelivery !== undefined ? jsOrder.txDelivery : (jsOrder.deliveryTax !== undefined ? jsOrder.deliveryTax : 0)) || 0;
  const subTotal = Number((calculatedSubTotal > 0 ? calculatedSubTotal : (jsOrder.subTotal || 0)).toFixed(2));
  const discount = Number(jsOrder.discount || 0) || 0;
  const total = Number(Math.max(0, subTotal + txDelivery - discount).toFixed(2));

  jsOrder.txDelivery = txDelivery;
  jsOrder.subTotal = subTotal;
  jsOrder.discount = discount;
  jsOrder.total = total;
  if (!jsOrder.total_original) jsOrder.total_original = total;
  if (!jsOrder.troco) jsOrder.troco = 0;
  if (jsOrder.origin === undefined) jsOrder.origin = 1;
  if (jsOrder.idMethodOrder === undefined) jsOrder.idMethodOrder = 1;
  if (!jsOrder.dateOrder) jsOrder.dateOrder = new Date().toISOString();

  if (jsOrder.client && jsOrder.client.address && !jsOrder.address) {
    jsOrder.address = jsOrder.client.address;
  }

  return { payload: cloned, missingMandatoryWarnings };
}
