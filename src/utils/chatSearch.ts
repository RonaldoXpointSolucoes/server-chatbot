export type SearchScopeType = 'all' | 'contact' | 'company' | 'messages';

export interface SearchMatchMeta {
  normalizedTerm: string;
  rawTerm: string;
  source: 'contact' | 'company' | 'message' | 'note' | 'label';
  matchedText?: string;
  matchedTimestamp?: string | null;
  matchedMessageId?: string | null;
  matchedConversationId?: string | null;
  matchedCompanyName?: string | null;
}

export interface LocalSearchCriteria {
  rawTerm: string;
  normTerm: string;
  digitsTerm: string;
  scope: SearchScopeType;
}

/**
 * Normaliza texto para busca tolerante a acentos, caixa e espaços extras.
 */
export const normalizeSearchText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Extrai apenas dígitos numéricos para comparar telefones e CPF/CNPJ sem máscara.
 */
export const extractSearchDigits = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
};

/**
 * Higieniza termo livre para uso seguro dentro de filtros `.or(...)` do PostgREST,
 * evitando que vírgulas, parênteses ou asteriscos quebrem a sintaxe da query.
 */
export const sanitizePostgrestTerm = (term: string): string => {
  return String(term || '')
    .replace(/[,()\\*{}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Constrói critério normalizado único a ser reutilizado fora de loops `.filter()`.
 */
export const buildLocalSearchCriteria = (
  searchTerm: string,
  scope: SearchScopeType = 'all'
): LocalSearchCriteria | null => {
  const rawTerm = String(searchTerm || '').trim();
  const normTerm = normalizeSearchText(rawTerm);
  if (!normTerm) return null;

  return {
    rawTerm,
    normTerm,
    digitsTerm: extractSearchDigits(rawTerm),
    scope
  };
};

const includesNormalized = (candidate: unknown, normTerm: string): boolean => {
  if (!candidate || !normTerm) return false;
  return normalizeSearchText(candidate).includes(normTerm);
};

const includesDigits = (candidate: unknown, digitsTerm: string): boolean => {
  if (!candidate || digitsTerm.length < 3) return false;
  return extractSearchDigits(candidate).includes(digitsTerm);
};

/**
 * Extrai um trecho legível ao redor da primeira ocorrência do termo pesquisado,
 * removendo formatação markdown excessiva para exibição na prévia do card.
 */
export const extractMatchSnippet = (
  text: string | null | undefined,
  term: string,
  maxLength = 76
): string => {
  const clean = String(text || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= maxLength) return clean;

  const normClean = normalizeSearchText(clean);
  const normTerm = normalizeSearchText(term);
  const matchIdx = normTerm ? normClean.indexOf(normTerm) : -1;

  if (matchIdx <= 18) {
    return clean.slice(0, maxLength - 1).trimEnd() + '…';
  }

  // Como normalizeSearchText preserva quase 1:1 o índice base em strings PT-BR, aproximamos o recorte com margem segura
  const approxStart = Math.max(0, Math.min(clean.length - maxLength, matchIdx - 22));
  const slice = clean.slice(approxStart, approxStart + maxLength - 2).trim();
  return `${approxStart > 0 ? '…' : ''}${slice}${approxStart + maxLength - 2 < clean.length ? '…' : ''}`;
};

export interface LocalSearchEvaluationInput {
  contact: any;
  criteria: LocalSearchCriteria;
  linkedCompanies?: any[];
  contactGroups?: any[];
}

/**
 * Avalia se um contato (e suas empresas vinculadas / grupos / mensagens em RAM / metadados de busca)
 * corresponde ao termo e ao escopo ativo (`all` | `contact` | `company` | `messages`).
 */
export const evaluateContactSearchMatch = ({
  contact,
  criteria,
  linkedCompanies = [],
  contactGroups = []
}: LocalSearchEvaluationInput): { matched: boolean; matchSource: SearchMatchMeta['source'] | null } => {
  const { normTerm, digitsTerm, scope } = criteria;
  if (!contact || !normTerm) return { matched: true, matchSource: null };

  const meta: SearchMatchMeta | undefined = contact.searchMatchMeta;
  const hasCurrentMeta = Boolean(meta && meta.normalizedTerm === normTerm);

  const checkContactFields = (): boolean => {
    if (
      includesNormalized(contact.name, normTerm) ||
      includesNormalized(contact.custom_name, normTerm) ||
      includesNormalized(contact.push_name, normTerm) ||
      includesNormalized(contact.pushname, normTerm) ||
      includesNormalized(contact.phone, normTerm) ||
      includesNormalized(contact.whatsapp_jid, normTerm) ||
      includesNormalized(contact.document_number, normTerm)
    ) {
      return true;
    }

    if (digitsTerm.length >= 3) {
      if (
        includesDigits(contact.phone, digitsTerm) ||
        includesDigits(contact.whatsapp_jid, digitsTerm) ||
        includesDigits(contact.document_number, digitsTerm)
      ) {
        return true;
      }
    }

    return hasCurrentMeta && meta?.source === 'contact';
  };

  const checkCompanyFields = (): boolean => {
    const isDirectCompany =
      contact.document_type === 'cnpj' ||
      Boolean(contact.fantasy_name);

    if (includesNormalized(contact.fantasy_name, normTerm)) return true;

    if (isDirectCompany) {
      if (
        includesNormalized(contact.name, normTerm) ||
        includesNormalized(contact.custom_name, normTerm) ||
        includesNormalized(contact.document_number, normTerm) ||
        includesDigits(contact.document_number, digitsTerm)
      ) {
        return true;
      }
    }

    for (const comp of linkedCompanies) {
      if (!comp) continue;
      if (
        includesNormalized(comp.fantasy_name, normTerm) ||
        includesNormalized(comp.custom_name, normTerm) ||
        includesNormalized(comp.name, normTerm) ||
        includesNormalized(comp.document_number, normTerm) ||
        includesDigits(comp.document_number, digitsTerm)
      ) {
        return true;
      }
    }

    if (contactGroups.length > 0) {
      const contactTags: string[] = Array.isArray(contact.tags) ? contact.tags : [];
      for (const grp of contactGroups) {
        if (!grp?.id || !grp?.name) continue;
        const belongsToGroup =
          contactTags.includes(grp.id) ||
          linkedCompanies.some((lc) => Array.isArray(lc?.tags) && lc.tags.includes(grp.id));
        if (belongsToGroup && includesNormalized(grp.name, normTerm)) {
          return true;
        }
      }
    }

    return hasCurrentMeta && meta?.source === 'company';
  };

  const checkMessageFields = (): boolean => {
    if (hasCurrentMeta && (meta?.source === 'message' || meta?.source === 'note')) {
      return true;
    }

    if (includesNormalized(contact.last_message_preview, normTerm)) {
      return true;
    }

    if (Array.isArray(contact.messages) && contact.messages.length > 0) {
      // Verifica da mais recente para a mais antiga para retorno rápido
      for (let i = contact.messages.length - 1; i >= 0; i--) {
        const msg = contact.messages[i];
        if (!msg) continue;
        if (
          includesNormalized(msg.text, normTerm) ||
          includesNormalized(msg.transcription, normTerm)
        ) {
          return true;
        }
      }
    }

    return false;
  };

  const checkLabelFields = (): boolean => {
    if (!Array.isArray(contact.conv_labels)) return false;
    return contact.conv_labels.some((lbl: any) => includesNormalized(lbl?.name, normTerm));
  };

  if (scope === 'contact') {
    return checkContactFields()
      ? { matched: true, matchSource: 'contact' }
      : { matched: false, matchSource: null };
  }

  if (scope === 'company') {
    return checkCompanyFields()
      ? { matched: true, matchSource: 'company' }
      : { matched: false, matchSource: null };
  }

  if (scope === 'messages') {
    return checkMessageFields()
      ? { matched: true, matchSource: meta?.source === 'note' ? 'note' : 'message' }
      : { matched: false, matchSource: null };
  }

  // scope === 'all': prioridade de correspondência clara para feedback visual
  if (checkContactFields()) return { matched: true, matchSource: 'contact' };
  if (checkCompanyFields()) return { matched: true, matchSource: 'company' };
  if (checkLabelFields()) return { matched: true, matchSource: 'label' };
  if (checkMessageFields()) return { matched: true, matchSource: meta?.source === 'note' ? 'note' : 'message' };

  return { matched: false, matchSource: null };
};
