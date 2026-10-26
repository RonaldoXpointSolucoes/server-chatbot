/**
 * Utilitário de conversão e formatação inteligente de Rich Text (Google Docs, Word, Gemini, ChatGPT, Web)
 * para o formato nativo do WhatsApp Real (*negrito*, _itálico_, ~tachado~, `código`, listas e parágrafos)
 * e detecção estrutural para renderização rica no ChatBoot.
 */

function wrapMarker(text: string, marker: string): string {
  if (!text) return '';
  const leadingMatch = text.match(/^\s*/);
  const trailingMatch = text.match(/\s*$/);
  const leading = leadingMatch ? leadingMatch[0] : '';
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const core = text.trim();
  if (!core) return text;
  // Evita duplicar marcadores se já estiver envolvido
  if (core.startsWith(marker) && core.endsWith(marker) && core.length > marker.length * 2) {
    return `${leading}${core}${trailing}`;
  }
  return `${leading}${marker}${core}${marker}${trailing}`;
}

function isElementBold(el: HTMLElement): boolean {
  const tag = el.tagName.toUpperCase();
  const fw = (el.style?.fontWeight || '').toLowerCase().trim();
  const id = el.id || '';

  // Google Docs envolve todo o documento copiado em <b style="font-weight:normal;" id="docs-internal-guid-...">
  if (id.startsWith('docs-internal-guid') || fw === 'normal' || fw === '400') {
    return false;
  }
  if (tag === 'B' || tag === 'STRONG' || /^H[1-6]$/.test(tag)) {
    return true;
  }
  if (fw === 'bold' || fw === 'bolder') {
    return true;
  }
  const numFw = parseInt(fw, 10);
  if (!isNaN(numFw) && numFw >= 600) {
    return true;
  }
  return false;
}

function isElementItalic(el: HTMLElement): boolean {
  const tag = el.tagName.toUpperCase();
  const fs = (el.style?.fontStyle || '').toLowerCase().trim();
  if (fs === 'normal') return false;
  return tag === 'I' || tag === 'EM' || fs === 'italic' || fs === 'oblique';
}

function isElementStrike(el: HTMLElement): boolean {
  const tag = el.tagName.toUpperCase();
  const td = (el.style?.textDecoration || el.style?.textDecorationLine || '').toLowerCase();
  return tag === 'S' || tag === 'DEL' || tag === 'STRIKE' || td.includes('line-through');
}

function isElementCode(el: HTMLElement): boolean {
  const tag = el.tagName.toUpperCase();
  return tag === 'CODE' || tag === 'PRE' || tag === 'KBD';
}

function getElementFontSizePt(el: HTMLElement): number {
  const fs = (el.style?.fontSize || '').toLowerCase().trim();
  if (!fs) return 0;
  if (fs.endsWith('pt')) {
    return parseFloat(fs) || 0;
  }
  if (fs.endsWith('px')) {
    const px = parseFloat(fs) || 0;
    return px * 0.75; // 16px = 12pt, 18px = 13.5pt, 24px = 18pt
  }
  if (fs.endsWith('rem') || fs.endsWith('em')) {
    const rem = parseFloat(fs) || 0;
    return rem * 12;
  }
  return 0;
}

function isHeadingBlock(el: HTMLElement): boolean {
  const tag = el.tagName.toUpperCase();
  if (/^H[1-6]$/.test(tag)) return true;
  if (el.getAttribute('role') === 'heading') return true;
  if (getElementFontSizePt(el) >= 13) return true;

  // Verifica se todos os spans com texto dentro do bloco possuem font-size >= 13pt (padrão Google Docs para Títulos)
  const spans = Array.from(el.querySelectorAll<HTMLElement>('span, b, strong, font'));
  if (spans.length > 0) {
    const textSpans = spans.filter(s => (s.textContent || '').trim().length > 0);
    if (textSpans.length > 0 && textSpans.every(s => getElementFontSizePt(s) >= 13)) {
      return true;
    }
  }
  return false;
}

function serializeInline(node: Node, inheritedBold = false, inheritedItalic = false, inheritedStrike = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/\u00A0/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  if (tag === 'BR') {
    return '\n';
  }
  if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'META' || tag === 'HEAD' || tag === 'SVG') {
    return '';
  }

  const boldHere = !inheritedBold && isElementBold(el);
  const italicHere = !inheritedItalic && isElementItalic(el);
  const strikeHere = !inheritedStrike && isElementStrike(el);
  const codeHere = isElementCode(el);

  const nextBold = inheritedBold || boldHere;
  const nextItalic = inheritedItalic || italicHere;
  const nextStrike = inheritedStrike || strikeHere;

  let inner = '';
  for (const child of Array.from(el.childNodes)) {
    inner += serializeInline(child, nextBold, nextItalic, nextStrike);
  }

  if (!inner.trim()) return inner;

  // Consolida marcadores adjacentes caso spans seguidos tenham sido formatados
  if (codeHere) {
    inner = wrapMarker(inner, '`');
  } else {
    if (strikeHere) inner = wrapMarker(inner, '~');
    if (italicHere) inner = wrapMarker(inner, '_');
    if (boldHere) inner = wrapMarker(inner, '*');
  }

  return inner;
}

interface ParsedBlock {
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote' | 'empty';
  text: string;
  isFullBold?: boolean;
  hasBottomMargin?: boolean;
}

function cleanAdjacentMarkers(str: string): string {
  return str
    // Junta *parte 1* *parte 2* ou *parte 1**parte 2* gerados por spans adjacentes do Google Docs
    .replace(/\*(\s*)\*/g, '$1')
    .replace(/_(\s*)_/g, '$1')
    .replace(/~(\s*)~/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const KNOWN_MAIN_HEADERS = new Set([
  'resumo',
  'decisões',
  'decisoes',
  'conclusão',
  'conclusao',
  'próximos passos',
  'proximos passos',
  'objetivo',
  'objetivos',
  'pauta',
  'ata de reunião',
  'ata da reunião',
  'introdução',
  'introducao',
  'contexto',
  'observações',
  'observacoes',
  'pendências',
  'pendencias',
  'ações',
  'acoes',
  'alinhamento',
  'alinhada',
  'participantes',
  'cronograma',
  'orçamento',
  'orcamento'
]);

/**
 * Fallback inteligente para texto puro (quando não há HTML ou o HTML veio sem tags semânticas):
 * Detecta títulos principais (ex: "Resumo", "Decisões") e subtítulos de blocos (linha curta sem ponto final
 * seguida na linha de baixo por uma frase descritiva).
 */
export function formatStructuredPlainText(plainText: string): string {
  if (!plainText) return '';
  const normalized = plainText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Se o texto já possui formatação explícita do WhatsApp ou Markdown, apenas normaliza ** -> * e ### -> *...*
  if (/(\*[^*\n]+\*|^#{1,4}\s+)/m.test(normalized)) {
    return normalized
      .replace(/^#{1,4}\s+\**([^*\n]+)\**\s*$/gm, '*$1*\n')
      .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const rawParagraphs = normalized.split(/\n{2,}/);
  const formattedParagraphs: string[] = [];
  let hasFormattedAny = false;

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const rawBlock = rawParagraphs[pIdx].trim();
    if (!rawBlock) continue;

    const lines = rawBlock.split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length === 1) {
      const single = lines[0];
      const lower = single.toLowerCase().replace(/[:.]+$/, '');
      const isShortHeader =
        KNOWN_MAIN_HEADERS.has(lower) ||
        (single.length <= 45 &&
          !/[.!?;]$/.test(single) &&
          /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(single) &&
          rawParagraphs.length > 1 &&
          pIdx < rawParagraphs.length - 1);

      if (isShortHeader) {
        formattedParagraphs.push(`*${single}*`);
        hasFormattedAny = true;
      } else {
        formattedParagraphs.push(single);
      }
      continue;
    }

    if (lines.length >= 2) {
      const firstLine = lines[0];
      const secondLine = lines[1];
      const restLines = lines.slice(1).join('\n');
      const firstLower = firstLine.toLowerCase().replace(/[:.]+$/, '');

      const isTitleAndBody =
        firstLine.length <= 68 &&
        !/[.!?]$/.test(firstLine) &&
        /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9]/.test(firstLine) &&
        (secondLine.length > firstLine.length || /[.!?]$/.test(secondLine));

      if (isTitleAndBody) {
        hasFormattedAny = true;
        const isMainSectionHeader =
          KNOWN_MAIN_HEADERS.has(firstLower) ||
          (pIdx === 0 && firstLine.split(/\s+/).length <= 3 && firstLine.length <= 25);

        if (isMainSectionHeader) {
          // Título Principal ("Parte Grande"): separado do parágrafo por linha em branco (\n\n)
          formattedParagraphs.push(`*${firstLine}*\n\n${restLines}`);
        } else {
          // Subtítulo em Negrito: colado acima do seu parágrafo descritivo (\n)
          formattedParagraphs.push(`*${firstLine}*\n${restLines}`);
        }
        continue;
      }
    }

    // Tratamento de linhas de lista no texto puro
    const processedLines = lines.map(line => {
      const bulletMatch = line.match(/^(?:[•\-*]\s+)(.+)$/);
      if (bulletMatch) {
        return `• ${bulletMatch[1]}`;
      }
      return line;
    });
    formattedParagraphs.push(processedLines.join('\n'));
  }

  if (!hasFormattedAny) {
    return normalized;
  }

  return formattedParagraphs.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Converte conteúdo da área de transferência (HTML do Google Docs, Word, Notion, Gemini, Web ou Texto Puro)
 * para o formato rico do WhatsApp e do ChatBoot.
 */
export function convertClipboardToWhatsAppFormat(html: string, plainText: string): string {
  if (!html || !html.trim()) {
    return formatStructuredPlainText(plainText);
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const blocks: ParsedBlock[] = [];

    const walkBlocks = (root: ParentNode) => {
      const children = Array.from(root.childNodes);

      for (const node of children) {
        if (node.nodeType === Node.TEXT_NODE) {
          const txt = (node.textContent || '').replace(/\u00A0/g, ' ').trim();
          if (txt) {
            blocks.push({ type: 'paragraph', text: txt });
          }
          continue;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as HTMLElement;
        const tag = el.tagName.toUpperCase();

        if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'META' || tag === 'HEAD' || tag === 'SVG') {
          continue;
        }

        if (tag === 'BR') {
          blocks.push({ type: 'empty', text: '' });
          continue;
        }

        // Wrapper do Google Docs (<b style="font-weight:normal;" id="docs-internal-guid-...">) ou containers genéricos
        if (
          (tag === 'B' && (el.id?.startsWith('docs-internal-guid') || el.style?.fontWeight === 'normal')) ||
          tag === 'BODY' ||
          tag === 'ARTICLE' ||
          tag === 'SECTION' ||
          tag === 'MAIN' ||
          (tag === 'DIV' && el.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote'))
        ) {
          walkBlocks(el);
          continue;
        }

        if (tag === 'UL' || tag === 'OL') {
          const items = Array.from(el.querySelectorAll(':scope > li'));
          items.forEach((li, idx) => {
            const rawItem = cleanAdjacentMarkers(serializeInline(li));
            if (rawItem) {
              const prefix = tag === 'OL' ? `${idx + 1}. ` : '• ';
              blocks.push({
                type: 'list-item',
                text: `${prefix}${rawItem.replace(/\n+/g, ' ')}`
              });
            }
          });
          blocks.push({ type: 'empty', text: '' });
          continue;
        }

        if (tag === 'BLOCKQUOTE') {
          const quoteTxt = cleanAdjacentMarkers(serializeInline(el));
          if (quoteTxt) {
            blocks.push({
              type: 'blockquote',
              text: quoteTxt
                .split('\n')
                .map(l => `> ${l.trim()}`)
                .join('\n')
            });
          }
          continue;
        }

        if (/^H[1-6]$/.test(tag) || isHeadingBlock(el)) {
          const rawHeading = cleanAdjacentMarkers(serializeInline(el, true));
          const cleanTitle = rawHeading.replace(/^\*+|\*+$/g, '').trim();
          if (cleanTitle) {
            blocks.push({
              type: 'heading',
              text: `*${cleanTitle}*`,
              isFullBold: true,
              hasBottomMargin: true
            });
          }
          continue;
        }

        if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
          const mb = parseFloat(el.style?.marginBottom || '0') || 0;
          const serialized = cleanAdjacentMarkers(serializeInline(el));
          if (!serialized) {
            blocks.push({ type: 'empty', text: '' });
            continue;
          }

          // Verifica se o parágrafo contém quebras internas <br>
          const subLines = serialized.split('\n').map(s => cleanAdjacentMarkers(s)).filter(Boolean);
          for (let i = 0; i < subLines.length; i++) {
            const line = subLines[i];
            const isFullBold =
              line.startsWith('*') &&
              line.endsWith('*') &&
              !line.slice(1, -1).includes('*') &&
              line.length <= 90;

            const plainCore = line.replace(/^\*+|\*+$/g, '').trim().toLowerCase().replace(/[:.]+$/, '');
            const isKnownMainHeader = isFullBold && KNOWN_MAIN_HEADERS.has(plainCore);

            blocks.push({
              type: isKnownMainHeader ? 'heading' : 'paragraph',
              text: line,
              isFullBold,
              hasBottomMargin: mb >= 6 || isKnownMainHeader
            });
          }
          continue;
        }

        // Qualquer outro elemento inline de nível superior
        const fallbackTxt = cleanAdjacentMarkers(serializeInline(el));
        if (fallbackTxt) {
          blocks.push({ type: 'paragraph', text: fallbackTxt });
        }
      }
    };

    walkBlocks(doc.body);

    const nonEmptyBlocks = blocks.filter(b => b.type !== 'empty' && b.text.trim().length > 0);
    if (nonEmptyBlocks.length === 0) {
      return formatStructuredPlainText(plainText);
    }

    // Se o HTML não trouxe nenhum negrito/heading/lista (ex: colado de um editor sem estilo), aplica o detector estrutural no texto puro
    const hasRichMarkers = nonEmptyBlocks.some(
      b => b.type === 'heading' || b.type === 'list-item' || b.type === 'blockquote' || /[*_~`]/.test(b.text)
    );
    if (!hasRichMarkers) {
      return formatStructuredPlainText(plainText);
    }

    // Monta a string final preservando a hierarquia visual:
    // - Heading ("Parte Grande", ex: *Resumo*): seguido de linha em branco (\n\n)
    // - Subtítulo em Negrito (*Elaboração de PGR e PCMSO*) seguido de parágrafo normal: unido por (\n) com o parágrafo, e (\n\n) após o parágrafo!
    let result = '';
    for (let i = 0; i < blocks.length; i++) {
      const curr = blocks[i];
      if (curr.type === 'empty') {
        if (result && !result.endsWith('\n\n')) {
          result = result.replace(/\n*$/, '\n\n');
        }
        continue;
      }

      // Encontra próximo bloco não-vazio
      let nextNonEmpty: ParsedBlock | null = null;
      let hasExplicitEmptyBetween = false;
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[j].type === 'empty') {
          hasExplicitEmptyBetween = true;
        } else {
          nextNonEmpty = blocks[j];
          break;
        }
      }

      result += curr.text;

      if (!nextNonEmpty) break;

      if (curr.type === 'heading') {
        // Título principal (ex: *Resumo*, *Decisões*) sempre tem linha em branco abaixo dele
        result += '\n\n';
      } else if (
        curr.type === 'paragraph' &&
        curr.isFullBold &&
        !hasExplicitEmptyBetween &&
        nextNonEmpty.type === 'paragraph' &&
        !nextNonEmpty.isFullBold
      ) {
        // Subtítulo em negrito (ex: *Elaboração de PGR e PCMSO*) fica imediatamente acima do seu parágrafo descritivo
        result += '\n';
      } else if (curr.type === 'list-item' && nextNonEmpty.type === 'list-item' && !hasExplicitEmptyBetween) {
        result += '\n';
      } else {
        // Entre parágrafos ou seções distintas, garante espaçamento de parágrafo (\n\n)
        result += '\n\n';
      }
    }

    return result.replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    return formatStructuredPlainText(plainText);
  }
}

/**
 * Verifica se um texto possui marcações de formatação WhatsApp/Markdown
 */
export function hasWhatsAppRichFormatting(text: string): boolean {
  if (!text || text.trim().length < 3) return false;
  return /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|^#{1,4}\s+|^[•\-]\s+|\n\n)/m.test(text);
}
