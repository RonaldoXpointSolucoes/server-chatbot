import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// RAG 2.0 CURATOR, SEMANTIC CHUNKER, HEALTH AUDITOR & HYBRID RETRIEVER
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function withTimeout(promise, ms, label = 'OPERATION_TIMEOUT') {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

export function isValidUuid(value) {
    return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function normalizeUuidOrNull(value) {
    return isValidUuid(value) ? value.trim() : null;
}

export function parsePgVector(vec) {
    if (!vec) return null;
    if (Array.isArray(vec)) return vec.map(Number);
    if (typeof vec === 'string') {
        const trimmed = vec.trim();
        if (!trimmed.startsWith('[')) return null;
        return trimmed.slice(1, -1).split(',').map(Number);
    }
    if (ArrayBuffer.isView(vec)) return Array.from(vec);
    return null;
}

export function cosineSimilarityVec(a, b) {
    const va = parsePgVector(a);
    const vb = parsePgVector(b);
    if (!va || !vb || va.length === 0 || va.length !== vb.length) return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < va.length; i++) {
        const x = va[i];
        const y = vb[i];
        dot += x * y;
        magA += x * x;
        magB += y * y;
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function normalizeForComparison(text = '') {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/https?:\/\/(?:www\.)?/g, 'url:')
        .replace(/[^\p{L}\p{N}\s:./-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function computeNormalizedHash(text = '') {
    const normalized = normalizeForComparison(text);
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function tokenJaccardSimilarity(a = '', b = '') {
    const setA = new Set(normalizeForComparison(a).split(' ').filter(t => t.length > 2));
    const setB = new Set(normalizeForComparison(b).split(' ').filter(t => t.length > 2));
    if (setA.size === 0 || setB.size === 0) return 0;
    let inter = 0;
    for (const t of setA) {
        if (setB.has(t)) inter++;
    }
    return inter / (setA.size + setB.size - inter);
}

/**
 * Deterministic cleaning: fixes broken URLs, strips legacy ASCII banners,
 * invisible control chars, web-scrape header junk, and excessive whitespace.
 */
export function sanitizeRagText(raw = '') {
    let text = String(raw || '');
    text = text.replace(/\uFEFF|\u200B|\u200C|\u200D|\u00A0/g, ' ');
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Fix accidental typos in protocol domains like "https://.burguerplus.com.br"
    text = text.replace(/https?:\/\/\.([a-z0-9-]+\.[a-z]{2,})/gi, 'https://www.$1');

    // Strip internal AddRagModal banner headers containing emails/UUIDs
    text = text.replace(/={10,}\nBASE DE CONHECIMENTO RAG[\s\S]*?={10,}\n*/gi, '');
    text = text.replace(/^(Data de Criação|Criado Por|Mensagens de Origem)\s*:.*$/gim, '');

    // Strip common storefront scrape chrome
    text = text.replace(/\bLOJA FECHADA\s*•\s*Abre\s+[A-Za-zÀ-ÿ-]+\s+às\s+\d{1,2}:\d{2}/gi, '');
    text = text.replace(/\bInicio\s+Pedidos\s+R\$\s*0,00\s+0\s+itens\s+Perfil\b/gi, '');

    // Collapse trailing whitespace per line and >2 blank lines
    text = text
        .split('\n')
        .map(line => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return text;
}

export function detectSensitiveOrNoisyPatterns(text = '') {
    const alerts = [];
    const str = String(text || '');

    if (/https?:\/\/\./i.test(str)) {
        alerts.push({
            type: 'url_quebrada',
            severity: 'warning',
            description: 'Contém URL malformada (ex: "https://.dominio") que quebra cliques de clientes.'
        });
    }

    const cpfMatches = str.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g);
    if (cpfMatches && cpfMatches.length > 0) {
        alerts.push({
            type: 'lgpd',
            severity: 'critical',
            description: `Contém ${cpfMatches.length} CPF(s) potencialmente sensível(is) (LGPD).`
        });
    }

    const aptMatches = str.match(/(?:torre\s*\d+|bloco\s*[a-z0-9]+)\s*[-,]?\s*(?:ap(?:to)?|apartamento)\s*\d+/gi);
    if (aptMatches && aptMatches.length > 0) {
        alerts.push({
            type: 'lgpd',
            severity: 'critical',
            description: `Possível endereço residencial específico de cliente (${aptMatches[0]}). Não deve ir para base global.`
        });
    }

    const mobPixMatches = str.match(/(?:pix|chave)[^\n]{0,30}\b1[0-9]{9,10}\b/gi);
    if (mobPixMatches && mobPixMatches.length > 0) {
        alerts.push({
            type: 'lgpd',
            severity: 'warning',
            description: `Possível chave PIX pessoal / celular de terceiro detectada (${mobPixMatches[0]}).`
        });
    }

    const norm = normalizeForComparison(str);
    const words = norm.split(' ').filter(Boolean);
    const uniqueWords = new Set(words);
    if (words.length < 4 || str.trim().length < 20) {
        alerts.push({
            type: 'lixo',
            severity: 'critical',
            description: 'Conteúdo extremamente curto ou sem valor informacional suficiente para RAG.'
        });
    } else if (/\b(lorem ipsum|asdf+|qwerty|teste\s*123|aaaa+)\b/i.test(str) || (words.length > 15 && uniqueWords.size / words.length < 0.25)) {
        alerts.push({
            type: 'lixo',
            severity: 'critical',
            description: 'Padrão de texto fake, placeholder ou repetição excessiva detectado.'
        });
    }

    return alerts;
}

export async function extractTextFromFile(buffer, mimetype = '', originalname = '') {
    const ext = (originalname.split('.').pop() || '').toLowerCase();
    if (mimetype === 'application/pdf' || ext === 'pdf') {
        const parser = new PDFParse({ data: buffer });
        try {
            const data = await parser.getText();
            return sanitizeRagText(data?.text || '');
        } finally {
            await parser.destroy().catch(() => {});
        }
    }
    const raw = buffer.toString('utf-8');
    if (ext === 'csv' || mimetype === 'text/csv') {
        // Convert CSV rows into clear Key: Value readable lines for semantic embedding
        const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length >= 2) {
            const sep = lines[0].includes(';') ? ';' : ',';
            const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
            const formatted = lines.slice(1).map((line, idx) => {
                const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
                const pairs = headers
                    .map((h, i) => (cols[i] ? `- **${h || `Coluna ${i + 1}`}**: ${cols[i]}` : null))
                    .filter(Boolean);
                return `### Registro ${idx + 1}\n${pairs.join('\n')}`;
            }).join('\n\n');
            return sanitizeRagText(formatted);
        }
    }
    return sanitizeRagText(raw);
}

export function prepareTextForEmbedding(text = '', sectionTitle = '') {
    const body = String(text || '')
        .replace(/^\[[^\]]+\]\s*/g, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\n---\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const cleanSection = String(sectionTitle || '').replace(/[_-]+/g, ' ').trim();
    if (cleanSection && !body.toLowerCase().includes(cleanSection.toLowerCase())) {
        return `${cleanSection}: ${body}`;
    }
    return body;
}

/**
 * Structure-Aware Contextual Chunking optimized for Xenova/all-MiniLM-L6-v2
 * (256 WordPiece tokens max => target <= 135 words per chunk so 100% of every
 *  chunk is actually encoded in the 384-d vector without truncation or cutting items mid-sentence).
 */
export function semanticChunkDocument(rawText, options = {}) {
    const {
        documentName = 'Base de Conhecimento',
        category = 'Geral',
        maxWords = 135,
        minWords = 8
    } = options;

    const clean = sanitizeRagText(rawText);
    if (!clean) return [];

    // 1. Specialized splitter for "## Correção N:" reasoning manuals
    if (/##\s*Corre[çc][ãa]o\s+\d+/i.test(clean)) {
        const parts = clean.split(/(?=##\s*Corre[çc][ãa]o\s+\d+)/i).map(p => p.trim()).filter(Boolean);
        const out = [];
        for (const p of parts) {
            if (/^#\s+Manual de Racioc/i.test(p) && p.length < 400 && parts.length > 1) continue;
            const titleMatch = p.match(/^##\s*([^\n]+)/);
            const sectionTitle = titleMatch ? titleMatch[1].replace(/[:*#]+/g, '').trim() : 'Ajuste de Comportamento';
            const body = p.replace(/\n---\s*$/g, '').trim();
            if (body.length < 15) continue;
            const wc = body.split(/\s+/).length;
            out.push({
                content: `[${documentName} > ${sectionTitle}]\n${body}`,
                embeddingText: prepareTextForEmbedding(body, sectionTitle),
                sectionTitle,
                category: category || 'Regras & Ajustes I.A.',
                wordCount: wc,
                charCount: body.length,
                chunkHash: computeNormalizedHash(body)
            });
        }
        if (out.length > 0) return out;
    }

    // 2. General hierarchical parser: split by Markdown headings, CATEGORIA headers, or blank lines
    const lines = clean.split('\n');
    const blocks = [];
    let currentSection = '';
    let bufferLines = [];

    const flushBuffer = () => {
        const joined = bufferLines.join('\n').trim();
        bufferLines = [];
        if (!joined || joined === '---' || /^-{10,}$/.test(joined)) return;
        blocks.push({ section: currentSection, text: joined });
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            flushBuffer();
            continue;
        }
        if (/^-{5,}$/.test(trimmed) || /^={5,}$/.test(trimmed)) {
            flushBuffer();
            continue;
        }
        // Check section headers
        const mdHeading = trimmed.match(/^#{1,3}\s+(.+)$/);
        const catHeading = trimmed.match(/^CATEGORIA:\s*(.+)$/i);
        const bracketSection = trimmed.match(/^===\s*(.+?)\s*===$/);

        if (catHeading) {
            flushBuffer();
            currentSection = catHeading[1].trim();
            continue;
        }
        if (bracketSection) {
            flushBuffer();
            currentSection = bracketSection[1].trim();
            continue;
        }
        if (mdHeading) {
            flushBuffer();
            const headingText = mdHeading[1].trim();
            // Do not overwrite main category with sub-bullet unless informative
            currentSection = headingText;
            bufferLines.push(trimmed);
            continue;
        }

        // In Gastrofood auto-healed menus, each product starts with an UPPERCASE name line
        // followed by Descrição:/Preço:, so treat each Preço line as an atomic block boundary
        bufferLines.push(trimmed);
        if (/^Pre[çc]o:\s*R\$/i.test(trimmed) && !bufferLines.some(l => l.startsWith('Opções'))) {
            // Lookahead not needed if we keep blank lines, handled on next iteration
        }
    }
    flushBuffer();

    // 3. Split any oversized single block (> maxWords) cleanly by sentences, then pack small sibling blocks
    const atomicUnits = [];
    for (const blk of blocks) {
        const words = blk.text.split(/\s+/).filter(Boolean);
        if (words.length <= maxWords) {
            atomicUnits.push(blk);
        } else {
            // Try bullet line boundaries first, else sentence boundaries
            const subLines = blk.text.split('\n').filter(l => l.trim().length > 0);
            if (subLines.length > 1 && subLines.every(l => l.split(/\s+/).length <= maxWords)) {
                for (const sl of subLines) {
                    atomicUnits.push({ section: blk.section, text: sl });
                }
            } else {
                const sentences = blk.text.split(/(?<=[.!?])\s+/);
                let acc = [];
                let accWords = 0;
                for (const sent of sentences) {
                    const sw = sent.split(/\s+/).length;
                    if (accWords > 0 && accWords + sw > maxWords) {
                        atomicUnits.push({ section: blk.section, text: acc.join(' ') });
                        acc = [sent];
                        accWords = sw;
                    } else if (sw > maxWords) {
                        if (acc.length > 0) {
                            atomicUnits.push({ section: blk.section, text: acc.join(' ') });
                            acc = [];
                            accWords = 0;
                        }
                        const wSlice = sent.split(/\s+/);
                        for (let i = 0; i < wSlice.length; i += maxWords - 15) {
                            atomicUnits.push({
                                section: blk.section,
                                text: wSlice.slice(i, i + maxWords).join(' ')
                            });
                        }
                    } else {
                        acc.push(sent);
                        accWords += sw;
                    }
                }
                if (acc.length > 0) {
                    atomicUnits.push({ section: blk.section, text: acc.join(' ') });
                }
            }
        }
    }

    // 4. Pack atomic units up to maxWords WITHOUT crossing section boundaries and WITHOUT breaking items
    const chunks = [];
    const seenHashes = new Set();
    let currentGroup = [];
    let currentWords = 0;
    let activeSection = '';

    const emitChunk = () => {
        if (currentGroup.length === 0) return;
        const body = currentGroup.join('\n\n').trim();
        currentGroup = [];
        currentWords = 0;
        const wc = body.split(/\s+/).filter(Boolean).length;
        if (wc < minWords && body.length < 25) return;

        const sectionPrefix = activeSection ? `[${documentName} > ${activeSection}]` : `[${documentName}]`;
        const needsHeader = !body.startsWith(`[${documentName}`);
        const content = needsHeader ? `${sectionPrefix}\n${body}` : body;
        const chunkHash = computeNormalizedHash(body);
        if (seenHashes.has(chunkHash)) return;
        seenHashes.add(chunkHash);

        chunks.push({
            content,
            embeddingText: prepareTextForEmbedding(body, activeSection),
            sectionTitle: activeSection || category || documentName,
            category: category || 'Geral',
            wordCount: wc,
            charCount: content.length,
            chunkHash
        });
    };

    for (const unit of atomicUnits) {
        const uWords = unit.text.split(/\s+/).filter(Boolean).length;
        const sectionChanged = currentGroup.length > 0 && unit.section !== activeSection;
        const wouldOverflow = currentGroup.length > 0 && (currentWords + uWords > maxWords);

        if (sectionChanged || wouldOverflow) {
            emitChunk();
        }
        activeSection = unit.section;
        currentGroup.push(unit.text);
        currentWords += uWords;
    }
    emitChunk();

    return chunks;
}

export function inferCategoryFromContent(name = '', text = '') {
    const sample = `${name} ${text.slice(0, 600)}`.toLowerCase();
    if (/card[aá]pio|combo|lanche|hamb[uú]rguer|por[cç][õo]es|bebida|pre[cç]o:\s*r\$/.test(sample)) {
        return 'Cardápio & Produtos';
    }
    if (/entrega|delivery|frete|taxa|pix|pagamento|cart[ãa]o|motoboy|lalamove|retirada/.test(sample)) {
        return 'Entregas & Pagamentos';
    }
    if (/hor[aá]rio|funcionamento|endere[çc]o|localiza|wi-?fi|instagram|maps|link/.test(sample)) {
        return 'Horários & Localização';
    }
    if (/reserva|anivers[aá]rio|bolo|evento|sal[ãa]o|grupo|mesa/.test(sample)) {
        return 'Atendimento & Reservas';
    }
    if (/corre[çc][ãa]o|racioc[ií]nio|ajustes|resposta esperada/.test(sample)) {
        return 'Regras & Ajustes I.A.';
    }
    return 'Conhecimento Geral';
}

/**
 * Fetches all chunks for a tenant cleanly (paginating over 1000-row PostgREST windows if needed).
 */
export async function fetchAllTenantChunks(supabase, tenantId, includeEmbeddings = false, instanceId = undefined) {
    const cols = includeEmbeddings
        ? 'id, document_id, tenant_id, agent_id, instance_id, chunk_index, content, metadata, embedding'
        : 'id, document_id, tenant_id, agent_id, instance_id, chunk_index, content, metadata';
    const all = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        let query = supabase
            .from('knowledge_chunks')
            .select(cols)
            .eq('tenant_id', tenantId);
        if (instanceId === null) {
            query = query.is('instance_id', null);
        } else if (isValidUuid(instanceId)) {
            query = query.or(`instance_id.is.null,instance_id.eq.${instanceId.trim()}`);
        }
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

/**
 * Pre-Flight Gatekeeper: Analyzes a candidate document or manual text against existing
 * tenant RAG knowledge & company settings, detects duplicates/junk/PII/contradictions,
 * and refactors it into clean atomic Markdown before persisting to DB.
 */
export async function analyzeCandidateForTenant({
    supabase,
    transformer,
    apiKey,
    tenantId,
    agentId = null,
    originalName = 'conhecimento.txt',
    rawText = ''
}) {
    const cleanedInput = sanitizeRagText(rawText);
    const contentHash = computeNormalizedHash(cleanedInput);
    const noiseAlerts = detectSensitiveOrNoisyPatterns(cleanedInput);

    // Reject completely empty or junk-only short payloads fast
    const wordCount = cleanedInput.split(/\s+/).filter(Boolean).length;
    if (!cleanedInput || wordCount < 4) {
        return {
            verdict: 'reject',
            qualityScore: 0,
            redundancyScore: 0,
            suggestedTitle: originalName,
            suggestedCategory: 'Rejeitado',
            recommendedAction: 'reject',
            targetDocumentId: null,
            targetDocumentName: null,
            issuesFound: noiseAlerts.length ? noiseAlerts : [{
                type: 'lixo',
                severity: 'critical',
                description: 'Conteúdo vazio ou insuficiente para compor a base de conhecimento.'
            }],
            removedNoiseExamples: [rawText.slice(0, 120)],
            netNewFacts: [],
            overlappingDocuments: [],
            refactoredMarkdown: '',
            originalText: cleanedInput,
            contentHash,
            recommendationSummary: 'Conteúdo bloqueado pelo Gatekeeper: texto vazio ou sem valor informacional real para o chatbot.'
        };
    }

    // 1. Load company operational settings + existing tenant docs + real chunk counts
    const [{ data: companyRow }, { data: docs }] = await Promise.all([
        supabase.from('companies').select('name, settings').eq('id', tenantId).maybeSingle(),
        supabase.from('knowledge_documents').select('id, name, type, status, metadata, content_hash, agent_id, created_at').eq('tenant_id', tenantId)
    ]);

    const existingDocs = docs || [];
    const exactDuplicateDoc = existingDocs.find(d =>
        d.content_hash === contentHash || d.metadata?.content_hash === contentHash
    );

    const existingChunks = await fetchAllTenantChunks(supabase, tenantId, false);
    const chunkCountByDoc = new Map();
    const docSamples = new Map();
    const existingChunkHashes = new Set();
    for (const c of existingChunks) {
        chunkCountByDoc.set(c.document_id, (chunkCountByDoc.get(c.document_id) || 0) + 1);
        const chHash = c.metadata?.chunk_hash || computeNormalizedHash(String(c.content || '').replace(/^\[[^\]]+\]\s*/, ''));
        existingChunkHashes.add(chHash);
        if (!docSamples.has(c.document_id)) {
            docSamples.set(c.document_id, []);
        }
        if (docSamples.get(c.document_id).length < 4) {
            docSamples.get(c.document_id).push(String(c.content || '').slice(0, 260));
        }
    }

    // 2. Probe vector similarity against existing chunks using representative sections
    const probeChunks = semanticChunkDocument(cleanedInput, {
        documentName: originalName,
        maxWords: 135
    });

    const overlappingDocsMap = new Map();
    let redundantChunkCount = 0;

    if (existingChunks.length > 0 && probeChunks.length > 0) {
        const probeSubset = probeChunks.slice(0, 8);
        for (const pc of probeSubset) {
            if (existingChunkHashes.has(pc.chunkHash)) {
                redundantChunkCount++;
                continue;
            }
            try {
                const embOut = await transformer(pc.content, { pooling: 'mean', normalize: true, priority: 2 });
                const vec = Array.from(embOut.data);
                const { data: simRows } = await supabase.rpc('match_knowledge_chunks', {
                    query_embedding: vec,
                    match_threshold: 0.72,
                    match_count: 3,
                    p_tenant_id: tenantId,
                    p_agent_id: agentId
                });
                if (simRows && simRows.length > 0) {
                    const topSim = simRows[0].similarity || 0;
                    if (topSim >= 0.84) redundantChunkCount++;
                    for (const row of simRows) {
                        const parentDoc = existingDocs.find(d => d.id === row.document_id);
                        if (!parentDoc) continue;
                        const prev = overlappingDocsMap.get(parentDoc.id) || {
                            id: parentDoc.id,
                            name: parentDoc.name,
                            maxSimilarity: 0,
                            matchedSamples: []
                        };
                        prev.maxSimilarity = Math.max(prev.maxSimilarity, Number(row.similarity || 0));
                        if (prev.matchedSamples.length < 2) {
                            prev.matchedSamples.push(String(row.content || '').slice(0, 180));
                        }
                        overlappingDocsMap.set(parentDoc.id, prev);
                    }
                }
            } catch (e) {
                console.warn('[RagCurator] Aviso ao sondar similaridade pré-ingestão:', e.message);
            }
        }
        const denom = Math.max(1, probeSubset.length);
        redundantChunkCount = Math.round((redundantChunkCount / denom) * 100);
    }

    const overlappingDocuments = Array.from(overlappingDocsMap.values())
        .sort((a, b) => b.maxSimilarity - a.maxSimilarity);

    // Early deterministic fast-path for 100% exact document duplicate
    if (exactDuplicateDoc) {
        return {
            verdict: 'reject',
            qualityScore: 20,
            redundancyScore: 100,
            suggestedTitle: originalName,
            suggestedCategory: inferCategoryFromContent(originalName, cleanedInput),
            recommendedAction: 'replace_existing',
            targetDocumentId: exactDuplicateDoc.id,
            targetDocumentName: exactDuplicateDoc.name,
            issuesFound: [
                ...noiseAlerts,
                {
                    type: 'duplicata',
                    severity: 'critical',
                    description: `Conteúdo 100% idêntico ao documento já vetorizado "${exactDuplicateDoc.name}". Re-inserir causaria duplicidade inútil.`
                }
            ],
            removedNoiseExamples: [],
            netNewFacts: [],
            overlappingDocuments: [
                {
                    id: exactDuplicateDoc.id,
                    name: exactDuplicateDoc.name,
                    maxSimilarity: 1,
                    matchedSamples: docSamples.get(exactDuplicateDoc.id) || []
                }
            ],
            refactoredMarkdown: cleanedInput,
            originalText: cleanedInput,
            contentHash,
            recommendationSummary: `Duplicata exata detectada com "${exactDuplicateDoc.name}". Recomendamos NÃO criar um novo arquivo (ou apenas substituir caso queira atualizar metadados).`
        };
    }

    // 3. AI Semantic Curation & Refactoring (Gemini 2.5 Flash) with resilient local fallback
    const inferredCategory = inferCategoryFromContent(originalName, cleanedInput);
    const s = companyRow?.settings || {};
    const officialTruthSummary = {
        empresa: companyRow?.name || s.businessName || '',
        horario_funcionamento: s.horario_funcionamento || '',
        endereco: s.endereco || '',
        link_cardapio: s.link_cardapio || '',
        pagamentos: s.paymentMethods || '',
        aceita_pix: Boolean(s.acceptsPix),
        regra_taxa_entrega: s.deliveryFeeRules || ''
    };

    const existingDocsDigest = existingDocs.slice(0, 12).map(d => ({
        id: d.id,
        name: d.name,
        category: d.metadata?.category || inferCategoryFromContent(d.name, ''),
        chunks: chunkCountByDoc.get(d.id) || 0,
        sample: (docSamples.get(d.id) || ['(sem fragmentos)']).join(' | ').slice(0, 320)
    }));

    if (apiKey && !String(apiKey).includes('SERVER_MANAGED')) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.2
                }
            });

            const prompt = `Você é um Arquiteto Sênior de Engenharia de RAG (Retrieval-Augmented Generation) e Curador de Dados Corporativos.
Sua missão é analisar um texto/documento candidato ANTES de ele ser vetorizado no pgvector de um chatbot de atendimento via WhatsApp, garantindo ZERO redundância, ZERO lixo/spam/dados falsos, ZERO contradições e ZERO vazamento de dados pessoais (LGPD).

CONTEXTO OFICIAL DA EMPRESA (Fonte da Verdade no Banco de Dados):
${JSON.stringify(officialTruthSummary, null, 2)}

BASES RAG JÁ EXISTENTES NO TENANT:
${JSON.stringify(existingDocsDigest, null, 2)}

ALERTAS DETETADOS AUTOMATICAMENTE NA PRÉ-VARREDURA:
${JSON.stringify(noiseAlerts, null, 2)}

SOBREPOSIÇÃO VETORIAL DETECTADA NO BANCO (~${redundantChunkCount}%):
${JSON.stringify(overlappingDocuments.slice(0, 4), null, 2)}

NOME ORIGINAL DO ARQUIVO: "${originalName}"
CONTEÚDO CANDIDATO A INGERIR:
"""
${cleanedInput.slice(0, 22000)}
"""

INSTRUÇÕES RIGOROSAS DE CURADORIA:
1. Analise se o texto candidato contém conteúdo duradouro e útil para atendimento ao cliente, ou se é lixo/teste/fake/chat aleatório/cópia obsoleta de algo já existente.
2. Remova dados pessoais sensíveis de terceiros (CPFs, telefones pessoais de motoboys/clientes, endereços de apartamentos específicos), sujeiras de copy-paste de sites ("LOJA FECHADA", "0 itens", menus UI), erros de digitação e URLs quebradas (ex: "https://.dominio" -> "https://www.dominio").
3. Verifique se os dados entram em conflito com o CONTEXTO OFICIAL DA EMPRESA ou com as BASES JÁ EXISTENTES (ex: horário antigo diferente do oficial). Se houver conflito, aponte em "issuesFound" e priorize a informação oficial atualizada no texto refatorado.
4. Remova frases duplicadas internamente ou fatos já idênticos nas bases existentes.
5. Refatore o conteúdo útil restante em **Markdown estruturado de alta precisão para RAG**:
   - Use \`# Título Claro\`, \`## Subtítulos por Tópico/Categoria\` e bullet points declarativos curtos e autossuficientes (cada tópico deve fazer sentido sozinho sem depender do anterior!).
   - Preserve 100% dos fatos reais válidos (preços corretos se for cardápio, chaves PIX oficiais, regras de entrega, reservas, links válidos).
6. Escolha "recommendedAction":
   - "create_new": documento novo e distinto das bases existentes;
   - "merge_into_existing": complementa uma base existente do mesmo tema (indique "targetDocumentId");
   - "replace_existing": é uma versão atualizada de uma base existente (indique "targetDocumentId");
   - "reject": lixo, conteúdo fake, teste sem valor ou 100% duplicado sem nenhuma novidade.

Retorne ESTRITAMENTE um JSON válido com este schema exato:
{
  "verdict": "approve_new | refactor_and_insert | update_existing | merge_into_existing | reject",
  "recommendedAction": "create_new | merge_into_existing | replace_existing | reject",
  "qualityScore": 0-100,
  "redundancyScore": 0-100,
  "suggestedTitle": "nome_limpo_sem_espacos.md",
  "suggestedCategory": "Cardápio & Produtos | Entregas & Pagamentos | Horários & Localização | Atendimento & Reservas | Regras & Ajustes I.A. | Conhecimento Geral",
  "targetDocumentId": "uuid ou null",
  "targetDocumentName": "nome do doc alvo ou null",
  "issuesFound": [{ "type": "duplicata|lixo|contradicao|lgpd|formatacao", "severity": "critical|warning|info", "description": "..." }],
  "removedNoiseExamples": ["exemplos curtos de ruído/duplicata/PII removidos"],
  "netNewFacts": ["lista objetiva dos principais fatos novos que permanecem"],
  "refactoredMarkdown": "# Título...\n\n## Tópico...",
  "recommendationSummary": "Explicação executiva curta (2-3 linhas) em português claro recomendando o que fazer."
}`;

            const result = await withTimeout(
                model.generateContent(prompt),
                18000,
                'GEMINI_ANALYZE_TIMEOUT_18S'
            );
            const rawJson = result.response.text().trim();
            const parsed = JSON.parse(rawJson.replace(/^```json\s*|\s*```$/g, ''));

            return {
                verdict: parsed.verdict || 'refactor_and_insert',
                recommendedAction: parsed.recommendedAction || 'create_new',
                qualityScore: Math.max(0, Math.min(100, Number(parsed.qualityScore ?? 78))),
                redundancyScore: Math.max(0, Math.min(100, Number(parsed.redundancyScore ?? redundantChunkCount))),
                suggestedTitle: parsed.suggestedTitle || originalName.replace(/\.txt$/i, '.md'),
                suggestedCategory: parsed.suggestedCategory || inferredCategory,
                targetDocumentId: parsed.targetDocumentId || (overlappingDocuments[0]?.maxSimilarity >= 0.85 ? overlappingDocuments[0].id : null),
                targetDocumentName: parsed.targetDocumentName || (overlappingDocuments[0]?.maxSimilarity >= 0.85 ? overlappingDocuments[0].name : null),
                issuesFound: Array.isArray(parsed.issuesFound) && parsed.issuesFound.length > 0 ? [...noiseAlerts, ...parsed.issuesFound] : noiseAlerts,
                removedNoiseExamples: Array.isArray(parsed.removedNoiseExamples) ? parsed.removedNoiseExamples : [],
                netNewFacts: Array.isArray(parsed.netNewFacts) ? parsed.netNewFacts : [],
                overlappingDocuments,
                refactoredMarkdown: sanitizeRagText(parsed.refactoredMarkdown || cleanedInput),
                originalText: cleanedInput,
                contentHash,
                recommendationSummary: parsed.recommendationSummary || 'Conteúdo analisado e refatorado para o padrão semântico RAG 2.0.'
            };
        } catch (aiErr) {
            console.warn('[RagCurator] Fallback heurístico acionado na análise IA:', aiErr.message);
        }
    }

    // 4. Deterministic Fallback when Gemini key is absent or in contingency
    const hasCriticalJunk = noiseAlerts.some(a => a.type === 'lixo' && a.severity === 'critical');
    const cleanLines = cleanedInput
        .split('\n')
        .map(l => l.trim())
        .filter((l, idx, arr) => l.length > 0 && arr.indexOf(l) === idx);

    const refactored = `# ${originalName.replace(/\.(txt|md|pdf|csv)$/i, '').replace(/[_-]+/g, ' ').trim()}\n\n## ${inferredCategory}\n\n${cleanLines.join('\n')}`;
    const highOverlap = overlappingDocuments[0]?.maxSimilarity >= 0.85;

    return {
        verdict: hasCriticalJunk ? 'reject' : (highOverlap ? 'merge_into_existing' : 'refactor_and_insert'),
        recommendedAction: hasCriticalJunk ? 'reject' : (highOverlap ? 'merge_into_existing' : 'create_new'),
        qualityScore: hasCriticalJunk ? 15 : Math.max(55, 88 - Math.round(redundantChunkCount * 0.4)),
        redundancyScore: redundantChunkCount,
        suggestedTitle: originalName.replace(/\s+/g, '_').toLowerCase(),
        suggestedCategory: inferredCategory,
        targetDocumentId: highOverlap ? overlappingDocuments[0].id : null,
        targetDocumentName: highOverlap ? overlappingDocuments[0].name : null,
        issuesFound: noiseAlerts,
        removedNoiseExamples: [],
        netNewFacts: cleanLines.slice(0, 6).map(l => l.slice(0, 120)),
        overlappingDocuments,
        refactoredMarkdown: refactored,
        originalText: cleanedInput,
        contentHash,
        recommendationSummary: hasCriticalJunk
            ? 'Conteúdo bloqueado por baixa densidade informacional ou padrão de teste.'
            : highOverlap
                ? `Sobreposição alta (~${redundantChunkCount}%) com "${overlappingDocuments[0].name}". Recomendamos mesclar apenas as novidades ou substituir o antigo.`
                : 'Conteúdo higienizado, desduplicado por linhas e estruturado em seções Markdown prontas para chunks semânticos.'
    };
}

/**
 * Commits a curated/refactored document into Supabase with vector embeddings,
 * chunk-level deduplication, accurate chunks_total metadata, and atomic update.
 */
export async function commitCuratedDocument({
    supabase,
    transformer,
    tenantId,
    agentId = null,
    instanceId = undefined,
    mode = 'create', // 'create' | 'replace' | 'merge'
    targetDocumentId = null,
    title = 'conhecimento.md',
    type = 'text/markdown',
    category = 'Conhecimento Geral',
    content = '',
    qualityScore = 90,
    source = 'curated_rag_v2',
    behaviorProfile = null,
    extraMetadata = null,
    yieldMs = 15
}) {
    const cleanContent = sanitizeRagText(content);
    if (!cleanContent || cleanContent.length < 10) {
        throw new Error('O conteúdo refatorado não pode estar vazio.');
    }

    let docId = targetDocumentId;
    let finalContent = cleanContent;
    let finalName = String(title || 'conhecimento.md').trim();
    let existingDoc = null;

    if ((mode === 'replace' || mode === 'merge') && targetDocumentId) {
        const { data: loadedDoc } = await supabase
            .from('knowledge_documents')
            .select('id, name, instance_id, metadata')
            .eq('id', targetDocumentId)
            .eq('tenant_id', tenantId)
            .maybeSingle();
        existingDoc = loadedDoc || null;

        if (existingDoc && mode === 'merge') {
            finalName = existingDoc.name;
            const { data: prevChunks } = await supabase
                .from('knowledge_chunks')
                .select('content, chunk_index')
                .eq('document_id', targetDocumentId)
                .eq('tenant_id', tenantId)
                .order('chunk_index', { ascending: true, nullsFirst: false });

            const existingText = (prevChunks || [])
                .map(c => String(c.content || '').replace(/^\[[^\]]+\]\s*/g, '').trim())
                .join('\n\n');
            finalContent = sanitizeRagText(`${existingText}\n\n${cleanContent}`);
        }
    }

    const safeInstanceId = instanceId !== undefined
        ? normalizeUuidOrNull(instanceId)
        : normalizeUuidOrNull(existingDoc?.instance_id ?? null);
    const contentHash = computeNormalizedHash(finalContent);
    const effectiveCategory = category || inferCategoryFromContent(finalName, finalContent);
    const chunks = semanticChunkDocument(finalContent, {
        documentName: finalName,
        category: effectiveCategory
    });

    if (chunks.length === 0) {
        throw new Error('Nenhum fragmento semântico válido pôde ser gerado deste conteúdo.');
    }

    // Generate embeddings & same-scope deduplication BEFORE deleting any previous chunks
    const otherChunks = await fetchAllTenantChunks(supabase, tenantId, false, safeInstanceId);
    const otherHashes = new Set(
        otherChunks
            .filter(c => {
                if (c.document_id === docId) return false;
                if (!safeInstanceId) return !c.instance_id;
                return !c.instance_id || c.instance_id === safeInstanceId;
            })
            .map(c => c.metadata?.chunk_hash || computeNormalizedHash(String(c.content || '').replace(/^\[[^\]]+\]\s*/, '')))
    );

    const dbChunks = [];
    let skippedDuplicates = 0;

    for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (otherHashes.has(ch.chunkHash)) {
            skippedDuplicates++;
            continue;
        }
        if (yieldMs > 0) await new Promise(r => setTimeout(r, yieldMs));
        const output = await transformer(ch.embeddingText || ch.content, { pooling: 'mean', normalize: true });
        const embeddingVector = Array.from(output.data);

        dbChunks.push({
            document_id: docId,
            tenant_id: tenantId,
            agent_id: agentId,
            instance_id: safeInstanceId,
            content: ch.content,
            embedding: embeddingVector,
            chunk_index: dbChunks.length,
            metadata: {
                document_name: finalName,
                section_title: ch.sectionTitle,
                category: ch.category,
                chunk_hash: ch.chunkHash,
                word_count: ch.wordCount,
                char_count: ch.charCount,
                instance_id: safeInstanceId,
                rag_version: '2.0',
                source
            }
        });
    }

    if ((mode === 'replace' || mode === 'merge') && docId && dbChunks.length === 0) {
        throw new Error('Nenhum fragmento inédito válido pôde ser gerado para substituir o documento sem esvaziá-lo.');
    }

    const baseMeta = {
        ...(extraMetadata && typeof extraMetadata === 'object' ? extraMetadata : {}),
        size: Buffer.byteLength(finalContent, 'utf-8'),
        chunks_total: chunks.length,
        chunks_processed: 0,
        category: effectiveCategory,
        quality_score: qualityScore,
        content_hash: contentHash,
        rag_version: '2.0',
        instance_id: safeInstanceId,
        ...(behaviorProfile ? { behavior_profile: behaviorProfile } : {}),
        source,
        current_status: 'Gravando vetores semânticos...',
        updated_at: new Date().toISOString()
    };

    if ((mode === 'replace' || mode === 'merge') && docId) {
        const { error: updDocErr } = await supabase
            .from('knowledge_documents')
            .update({
                name: finalName,
                type: type || 'text/markdown',
                instance_id: safeInstanceId,
                status: 'processing',
                content_hash: contentHash,
                metadata: baseMeta
            })
            .eq('id', docId)
            .eq('tenant_id', tenantId);
        if (updDocErr) throw updDocErr;
        await supabase.from('knowledge_chunks').delete().eq('document_id', docId).eq('tenant_id', tenantId);
    } else {
        const { data: newDoc, error: insDocErr } = await supabase
            .from('knowledge_documents')
            .insert([{
                tenant_id: tenantId,
                agent_id: agentId,
                instance_id: safeInstanceId,
                name: finalName,
                type: type || 'text/markdown',
                status: 'processing',
                content_hash: contentHash,
                metadata: baseMeta
            }])
            .select('*')
            .single();
        if (insDocErr) throw insDocErr;
        docId = newDoc.id;
        for (const row of dbChunks) {
            row.document_id = docId;
        }
    }

    for (let i = 0; i < dbChunks.length; i += 100) {
        const batch = dbChunks.slice(i, i + 100);
        const { error: chErr } = await supabase.from('knowledge_chunks').insert(batch);
        if (chErr) throw chErr;
    }

    const finalMeta = {
        ...baseMeta,
        chunks_total: dbChunks.length,
        chunks_processed: dbChunks.length,
        skipped_duplicates: skippedDuplicates,
        last_update: new Date().toISOString(),
        current_status: 'Concluído com sucesso!'
    };

    const { data: finalDoc, error: finalErr } = await supabase
        .from('knowledge_documents')
        .update({
            status: 'ready',
            content_hash: contentHash,
            metadata: finalMeta
        })
        .eq('id', docId)
        .select('*')
        .single();

    if (finalErr) throw finalErr;

    return {
        document: finalDoc,
        insertedChunks: dbChunks.length,
        skippedDuplicates
    };
}

/**
 * Full forensic health check of a tenant's RAG database (docs + vectors + duplicates + conflicts).
 */
export async function auditTenantKnowledgeHealth({ supabase, tenantId }) {
    const [{ data: companyRow }, { data: docs, error: docErr }] = await Promise.all([
        supabase.from('companies').select('name, settings').eq('id', tenantId).maybeSingle(),
        supabase.from('knowledge_documents').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
    ]);
    if (docErr) throw docErr;

    const documentList = docs || [];
    const chunks = await fetchAllTenantChunks(supabase, tenantId, true);

    const chunksByDoc = new Map();
    for (const c of chunks) {
        if (!chunksByDoc.has(c.document_id)) chunksByDoc.set(c.document_id, []);
        chunksByDoc.get(c.document_id).push(c);
    }

    // Track exact duplicates, oversized chunks, broken URLs, PII across ALL tenant chunks
    const normalizedHashBuckets = new Map();
    const brokenUrlChunkIds = [];
    const piiChunkIds = [];
    const oversizedChunkIds = [];
    let unindexedNullVecs = 0;

    for (const c of chunks) {
        const rawBody = String(c.content || '').replace(/^\[[^\]]+\]\s*/g, '');
        const hash = computeNormalizedHash(rawBody);
        const scopedKey = `${c.instance_id || 'global'}::${hash}`;
        if (!normalizedHashBuckets.has(scopedKey)) normalizedHashBuckets.set(scopedKey, []);
        normalizedHashBuckets.get(scopedKey).push(c);

        if (!c.embedding) unindexedNullVecs++;
        if (/https?:\/\/\./i.test(c.content || '')) brokenUrlChunkIds.push(c.id);
        if ((c.content || '').split(/\s+/).length > 210) oversizedChunkIds.push(c.id);

        const pii = detectSensitiveOrNoisyPatterns(c.content || '').filter(a => a.type === 'lgpd');
        if (pii.length > 0) piiChunkIds.push(c.id);
    }

    let exactDuplicateChunksCount = 0;
    for (const group of normalizedHashBuckets.values()) {
        if (group.length > 1) exactDuplicateChunksCount += (group.length - 1);
    }

    // Sample-safe semantic near-duplicate scan (cosine >= 0.90) scoped per inbox/global
    // Caps O(N^2) pairwise checks at 450 distinct chunks to guarantee sub-200ms execution
    const uniqueHashesSeen = new Set();
    const distinctSampleChunks = [];
    for (const c of chunks) {
        const h = computeNormalizedHash(String(c.content || '').replace(/^\[[^\]]+\]\s*/g, ''));
        const scopedSampleKey = `${c.instance_id || 'global'}::${h}`;
        if (!uniqueHashesSeen.has(scopedSampleKey) && c.embedding) {
            uniqueHashesSeen.add(scopedSampleKey);
            distinctSampleChunks.push({ ...c, _vec: parsePgVector(c.embedding) });
        }
        if (distinctSampleChunks.length >= 450) break;
    }

    let nearDuplicatePairsCount = 0;
    const sampleDupePairs = [];
    for (let i = 0; i < distinctSampleChunks.length; i++) {
        const ci = distinctSampleChunks[i];
        const isMenuA = ci.metadata?.category === 'Cardápio & Produtos';
        for (let j = i + 1; j < distinctSampleChunks.length; j++) {
            const cj = distinctSampleChunks[j];
            if (ci.instance_id && cj.instance_id && ci.instance_id !== cj.instance_id) {
                continue;
            }
            const isMenuB = cj.metadata?.category === 'Cardápio & Produtos';
            const sim = cosineSimilarityVec(ci._vec, cj._vec);
            const jaccard = isMenuA && isMenuB ? tokenJaccardSimilarity(ci.content, cj.content) : 1;
            if (sim >= 0.91 && (!isMenuA || !isMenuB || jaccard >= 0.65)) {
                nearDuplicatePairsCount++;
                if (sampleDupePairs.length < 5) {
                    sampleDupePairs.push({
                        similarity: Number(sim.toFixed(3)),
                        a: ci.content?.slice(0, 95),
                        b: cj.content?.slice(0, 95)
                    });
                }
            }
        }
    }

    // Check per-document diagnostics & cross-doc redundancy (e.g. duplicate menus)
    const emptyDocs = [];
    const desyncedDocs = [];
    const docAuditList = documentList.map(doc => {
        const dChunks = chunksByDoc.get(doc.id) || [];
        const realCount = dChunks.length;
        const metaCount = Number(doc.metadata?.chunks_total || 0);
        const isEmpty = realCount === 0;
        const isDesynced = metaCount !== realCount;
        const docBrokenUrls = dChunks.filter(c => /https?:\/\/\./i.test(c.content || '')).length;
        const docPiiCount = dChunks.filter(c => detectSensitiveOrNoisyPatterns(c.content || '').some(a => a.type === 'lgpd')).length;

        const docHashes = new Set();
        let docInternalDupes = 0;
        for (const c of dChunks) {
            const h = computeNormalizedHash(String(c.content || '').replace(/^\[[^\]]+\]\s*/g, ''));
            if (docHashes.has(h)) docInternalDupes++;
            docHashes.add(h);
        }

        if (isEmpty) emptyDocs.push({ id: doc.id, name: doc.name });
        if (isDesynced) desyncedDocs.push({ id: doc.id, name: doc.name, metaCount, realCount });

        const docIssues = [];
        if (isEmpty) docIssues.push('Base fantasma com 0 vetores');
        if (docInternalDupes > 0) docIssues.push(`${docInternalDupes} fragmentos repetidos`);
        if (docBrokenUrls > 0) docIssues.push(`${docBrokenUrls} URL(s) quebrada(s)`);
        if (docPiiCount > 0) docIssues.push(`${docPiiCount} risco(s) LGPD/PII`);
        if (isDesynced) docIssues.push(`Contagem desatualizada (meta=${metaCount} vs real=${realCount})`);

        let docHealth = 100;
        if (isEmpty) docHealth -= 65;
        if (docInternalDupes > 0) docHealth -= Math.min(35, docInternalDupes * 4);
        if (docBrokenUrls > 0) docHealth -= 15;
        if (docPiiCount > 0) docHealth -= 25;
        if (doc.status === 'error') docHealth -= 50;

        return {
            id: doc.id,
            name: doc.name,
            type: doc.type,
            status: doc.status,
            category: doc.metadata?.category || inferCategoryFromContent(doc.name, dChunks[0]?.content || ''),
            real_chunks_count: realCount,
            meta_chunks_total: metaCount,
            internal_duplicates: docInternalDupes,
            broken_urls: docBrokenUrls,
            pii_alerts: docPiiCount,
            health_score: Math.max(0, docHealth),
            issues: docIssues,
            quality_tier: docHealth >= 85 ? 'healthy' : docHealth >= 55 ? 'warning' : 'critical',
            created_at: doc.created_at,
            metadata: doc.metadata
        };
    });

    // Check duplicate cardápio documents
    const menuDocs = documentList.filter(d => /cardapio/i.test(d.name || ''));
    const issues = [];
    if (emptyDocs.length > 0) {
        issues.push({
            id: 'empty_docs',
            severity: 'critical',
            title: `${emptyDocs.length} base(s) vazia(s) / zumbi(s)`,
            description: `Existem documentos listados sem nenhum vetor real no banco: ${emptyDocs.map(d => d.name).join(', ')}.`,
            actionLabel: 'Remover Bases Vazias'
        });
    }
    if (menuDocs.length > 1) {
        issues.push({
            id: 'duplicate_menus',
            severity: 'warning',
            title: `${menuDocs.length} cardápios concorrentes no RAG`,
            description: `Encontrados múltiplos cardápios (${menuDocs.map(d => d.name).join(' vs ')}), o que gera preços desatualizados ou respostas conflitantes.`,
            actionLabel: 'Manter apenas Cardápio Oficial Sincronizado'
        });
    }
    if (exactDuplicateChunksCount > 0 || nearDuplicatePairsCount > 0) {
        issues.push({
            id: 'duplicate_chunks',
            severity: exactDuplicateChunksCount > 15 ? 'critical' : 'warning',
            title: `${exactDuplicateChunksCount} duplicatas exatas e ${nearDuplicatePairsCount} pares redundantes`,
            description: 'Chunks duplicados ou parafraseados inflam os resultados top-K e impedem a IA de enxergar regras diferentes.',
            actionLabel: 'Executar Saneamento e Desduplicação'
        });
    }
    if (piiChunkIds.length > 0) {
        issues.push({
            id: 'pii_leaks',
            severity: 'critical',
            title: `${piiChunkIds.length} chunk(s) com possível dado pessoal / endereço residencial (LGPD)`,
            description: 'Foram detectados padrões de CPF, apartamentos privados ou celulares em fragmentos da base global.',
            actionLabel: 'Inspecionar e Limpar Dados Sensíveis'
        });
    }
    if (brokenUrlChunkIds.length > 0) {
        issues.push({
            id: 'broken_urls',
            severity: 'warning',
            title: `${brokenUrlChunkIds.length} chunk(s) com URL quebrada ("https://.")`,
            description: 'Links com ponto logo após "https://" falham ao clicar no WhatsApp e prejudicam conversões.',
            actionLabel: 'Corrigir Links Automaticamente'
        });
    }
    if (oversizedChunkIds.length > 0) {
        issues.push({
            id: 'oversized_chunks',
            severity: 'info',
            title: `${oversizedChunkIds.length} chunk(s) acima da janela ideal do modelo vetorial (> 200 palavras)`,
            description: 'Fragmentos muito longos têm o final truncado pelo modelo all-MiniLM-L6-v2 (limite de 256 tokens).',
            actionLabel: 'Re-fatiar com Chunking Semântico'
        });
    }
    if (desyncedDocs.length > 0) {
        issues.push({
            id: 'desynced_meta',
            severity: 'info',
            title: `${desyncedDocs.length} documento(s) com contador de chunks desatualizado nos metadados`,
            description: 'Os metadados antigos não refletiam a contagem real de vetores gravados no pgvector.',
            actionLabel: 'Sincronizar Metadados'
        });
    }

    let overallScore = 100;
    if (documentList.length === 0) overallScore = 60;
    if (emptyDocs.length > 0) overallScore -= Math.min(25, emptyDocs.length * 10);
    if (menuDocs.length > 1) overallScore -= 15;
    if (exactDuplicateChunksCount > 0) overallScore -= Math.min(25, Math.ceil(exactDuplicateChunksCount / 5));
    if (nearDuplicatePairsCount > 3) overallScore -= Math.min(20, nearDuplicatePairsCount);
    if (piiChunkIds.length > 0) overallScore -= 20;
    if (brokenUrlChunkIds.length > 0) overallScore -= 10;
    if (oversizedChunkIds.length > 0) overallScore -= Math.min(10, oversizedChunkIds.length * 2);
    overallScore = Math.max(0, Math.min(100, overallScore));

    return {
        tenant_id: tenantId,
        company_name: companyRow?.name || '',
        health_score: overallScore,
        health_tier: overallScore >= 85 ? 'healthy' : overallScore >= 60 ? 'warning' : 'critical',
        stats: {
            total_documents: documentList.length,
            total_real_chunks: chunks.length,
            exact_duplicate_chunks: exactDuplicateChunksCount,
            near_duplicate_pairs: nearDuplicatePairsCount,
            empty_docs: emptyDocs.length,
            broken_urls: brokenUrlChunkIds.length,
            pii_alerts: piiChunkIds.length,
            oversized_chunks: oversizedChunkIds.length,
            unindexed_vectors: unindexedNullVecs
        },
        sample_duplicate_pairs: sampleDupePairs,
        issues,
        documents: docAuditList
    };
}

/**
 * Sanitizes existing tenant data: removes empty zombie docs, deletes exact duplicate chunks
 * (and near-duplicate >= 0.92 cosine within/across docs), fixes malformed URLs, and updates metadata.
 */
export async function sanitizeTenantKnowledgeBase({ supabase, transformer, tenantId }) {
    const { data: docs, error: docErr } = await supabase
        .from('knowledge_documents')
        .select('*')
        .eq('tenant_id', tenantId);
    if (docErr) throw docErr;

    const chunks = await fetchAllTenantChunks(supabase, tenantId, true);
    const chunksByDoc = new Map();
    for (const c of chunks) {
        if (!chunksByDoc.has(c.document_id)) chunksByDoc.set(c.document_id, []);
        chunksByDoc.get(c.document_id).push(c);
    }

    let removedEmptyDocs = 0;
    let removedDuplicateChunks = 0;
    let fixedUrlsCount = 0;
    let syncedDocsCount = 0;

    // 1. Delete empty zombie documents (0 chunks)
    for (const d of (docs || [])) {
        const dChunks = chunksByDoc.get(d.id) || [];
        if (dChunks.length === 0 && d.status !== 'processing') {
            await supabase.from('knowledge_documents').delete().eq('id', d.id).eq('tenant_id', tenantId);
            removedEmptyDocs++;
        }
    }

    // 2. Deduplicate chunks & fix broken URLs partitioned strictly by scope (Global first, then each inbox independently)
    const sortedDocs = [...(docs || [])].sort((a, b) => {
        const aGlobal = !a.instance_id ? 0 : 1;
        const bGlobal = !b.instance_id ? 0 : 1;
        return aGlobal - bGlobal;
    });

    const keptHashesByScope = new Map();
    const keptVecsByScope = new Map();
    const getScopeHashes = (scopeKey) => {
        if (!keptHashesByScope.has(scopeKey)) keptHashesByScope.set(scopeKey, new Set());
        return keptHashesByScope.get(scopeKey);
    };
    const getScopeVecs = (scopeKey) => {
        if (!keptVecsByScope.has(scopeKey)) keptVecsByScope.set(scopeKey, []);
        return keptVecsByScope.get(scopeKey);
    };

    for (const d of sortedDocs) {
        const dChunks = (chunksByDoc.get(d.id) || []).sort((a, b) => (a.chunk_index ?? 999999) - (b.chunk_index ?? 999999));
        if (dChunks.length === 0) continue;

        const docScopeKey = d.instance_id || 'global';
        const scopeHashes = getScopeHashes(docScopeKey);
        const scopeVecs = getScopeVecs(docScopeKey);
        const globalHashes = getScopeHashes('global');
        const globalVecs = getScopeVecs('global');

        const idsToDelete = [];
        let survivingCount = 0;

        for (const c of dChunks) {
            let content = String(c.content || '');
            const hadBrokenUrl = /https?:\/\/\./i.test(content);
            if (hadBrokenUrl) {
                content = content.replace(/https?:\/\/\.([a-z0-9-]+\.[a-z]{2,})/gi, 'https://www.$1');
                const embOut = await transformer(content, { pooling: 'mean', normalize: true });
                await supabase
                    .from('knowledge_chunks')
                    .update({ content, embedding: Array.from(embOut.data) })
                    .eq('id', c.id);
                fixedUrlsCount++;
            }

            const bodyForHash = content.replace(/^\[[^\]]+\]\s*/g, '');
            const cHash = computeNormalizedHash(bodyForHash);
            const vec = parsePgVector(c.embedding);

            let isDuplicate = scopeHashes.has(cHash) || (docScopeKey !== 'global' && globalHashes.has(cHash));
            if (!isDuplicate && vec) {
                const candidateVecs = docScopeKey !== 'global' ? [...globalVecs, ...scopeVecs] : globalVecs;
                for (const prev of candidateVecs.slice(0, 300)) {
                    if (cosineSimilarityVec(vec, prev) >= 0.93) {
                        isDuplicate = true;
                        break;
                    }
                }
            }

            if (isDuplicate) {
                idsToDelete.push(c.id);
            } else {
                scopeHashes.add(cHash);
                if (vec && scopeVecs.length < 300) scopeVecs.push(vec);
                survivingCount++;
            }
        }

        for (let i = 0; i < idsToDelete.length; i += 200) {
            await supabase.from('knowledge_chunks').delete().in('id', idsToDelete.slice(i, i + 200));
            removedDuplicateChunks += idsToDelete.slice(i, i + 200).length;
        }

        if (survivingCount === 0) {
            await supabase.from('knowledge_documents').delete().eq('id', d.id).eq('tenant_id', tenantId);
            removedEmptyDocs++;
        } else {
            await supabase
                .from('knowledge_documents')
                .update({
                    status: 'ready',
                    metadata: {
                        ...(d.metadata || {}),
                        chunks_total: survivingCount,
                        chunks_processed: survivingCount,
                        rag_version: '2.0',
                        sanitized_at: new Date().toISOString(),
                        current_status: 'Concluído com sucesso!'
                    }
                })
                .eq('id', d.id);
            syncedDocsCount++;
        }
    }

    return {
        removedEmptyDocs,
        removedDuplicateChunks,
        fixedUrlsCount,
        syncedDocsCount
    };
}

/**
 * Next-Gen Hybrid Retrieval + MMR Diversity Filter:
 * Combines pgvector semantic cosine similarity + PostgreSQL PT-BR FTS + keyword bonus
 * while suppressing duplicate/redundant chunks in the final top-K result set.
 */
export async function hybridRetrieveKnowledge({
    supabase,
    queryEmbedding,
    queryText,
    tenantId,
    agentId = null,
    instanceId = null,
    topK = 5,
    vectorThreshold = 0.24
}) {
    const cleanQuery = String(queryText || '').trim();
    const safeInstanceId = normalizeUuidOrNull(instanceId);
    const candidateLimit = Math.max(topK * 4, 16);
    let candidates = [];

    // 1. Primary path: Native Postgres Hybrid RPC (HNSW iterative scan + PT-BR FTS OR-rank + RRF)
    const { data: hybridRows, error: hybridErr } = await supabase.rpc('match_knowledge_chunks_hybrid', {
        query_embedding: queryEmbedding,
        query_text: cleanQuery,
        p_tenant_id: tenantId,
        p_agent_id: agentId,
        vector_threshold: vectorThreshold,
        match_count: candidateLimit,
        p_instance_id: safeInstanceId
    });

    if (!hybridErr && Array.isArray(hybridRows)) {
        candidates = hybridRows.map(r => ({
            id: r.id,
            document_id: r.document_id,
            instance_id: r.instance_id !== undefined ? r.instance_id : (r.metadata?.instance_id ?? null),
            document_name: r.document_name || r.metadata?.document_name || 'Base de Conhecimento',
            section: r.metadata?.section_title || '',
            content: r.content,
            metadata: r.metadata || {},
            vector_similarity: Number(r.vector_similarity || 0),
            lexical_score: Number(r.lexical_score || 0),
            rrf_score: Number(r.rrf_score || 0)
        }));
    } else {
        if (hybridErr) {
            console.warn('[HybridRAG] Fallback para RPC padrão:', hybridErr.message);
        }
        const { data: semRows, error: semErr } = await supabase.rpc('match_knowledge_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: vectorThreshold,
            match_count: candidateLimit,
            p_tenant_id: tenantId,
            p_agent_id: agentId,
            p_instance_id: safeInstanceId
        });
        if (semErr) {
            console.error('[HybridRAG] Erro em match_knowledge_chunks:', semErr.message);
        }
        for (const r of (semRows || [])) {
            candidates.push({
                id: r.id,
                document_id: r.document_id,
                instance_id: r.instance_id !== undefined ? r.instance_id : (r.metadata?.instance_id ?? null),
                document_name: r.metadata?.document_name || 'Base de Conhecimento',
                section: r.metadata?.section_title || '',
                content: r.content,
                metadata: r.metadata || {},
                vector_similarity: Number(r.similarity || 0),
                lexical_score: 0,
                rrf_score: Number(r.similarity || 0) * 0.05
            });
        }
    }

    // 2. Exact keyword & accent-folded token re-scoring / supplementation
    const stopWords = new Set([
        'qual', 'quais', 'como', 'onde', 'para', 'voces', 'voce', 'temos', 'sobre',
        'quanto', 'custa', 'valor', 'preco', 'pode', 'posso', 'quero', 'faco', 'meu',
        'minha', 'pelo', 'pela', 'isso', 'este', 'esta', 'nesse', 'nesta', 'funciona'
    ]);
    const normQuery = normalizeForComparison(cleanQuery);
    const sigTokens = normQuery
        .split(' ')
        .filter(t => t.length >= 3 && !stopWords.has(t));

    if (sigTokens.length > 0) {
        const candidateById = new Map(candidates.map(c => [c.id, c]));

        // 2a. Prioritize chunks matching ALL/most rarest tokens first (AND filter), then supplement with OR filter
        const longestTokens = [...sigTokens].sort((a, b) => b.length - a.length).slice(0, 4);
        const orFilter = longestTokens.map(t => `content.ilike.%${t}%`).join(',');
        const andTokens = longestTokens.slice(0, 2);

        const buildBaseIlike = () => {
            let q = supabase
                .from('knowledge_chunks')
                .select('id, document_id, agent_id, instance_id, content, metadata')
                .eq('tenant_id', tenantId);
            if (safeInstanceId) {
                q = q.or(`instance_id.is.null,instance_id.eq.${safeInstanceId}`);
            } else if (agentId) {
                q = q.or(`agent_id.is.null,agent_id.eq.${agentId}`);
            } else {
                q = q.is('agent_id', null);
            }
            return q;
        };

        let exactAndRows = [];
        if (andTokens.length >= 2) {
            let andQ = buildBaseIlike();
            for (const t of andTokens) andQ = andQ.ilike('content', `%${t}%`);
            const { data } = await andQ.limit(20);
            exactAndRows = data || [];
        }

        const { data: exactOrRows } = await buildBaseIlike().or(orFilter).limit(40);
        const mergedRowsMap = new Map();
        for (const r of [...exactAndRows, ...(exactOrRows || [])]) {
            if (agentId && r.agent_id && r.agent_id !== agentId) continue;
            if (!agentId && r.agent_id) continue;
            if (safeInstanceId && r.instance_id && r.instance_id !== safeInstanceId) continue;
            if (!mergedRowsMap.has(r.id)) mergedRowsMap.set(r.id, r);
        }

        const phraseCandidate = sigTokens.join(' ');

        for (const er of mergedRowsMap.values()) {
            const normC = normalizeForComparison(er.content || '');
            const matchedCount = sigTokens.filter(t => normC.includes(t)).length;
            if (matchedCount === 0) continue;

            const coverage = matchedCount / sigTokens.length;
            const hasExactPhrase = phraseCandidate.length >= 6 && normC.includes(phraseCandidate);
            const exactBoost = coverage * 0.65 + (hasExactPhrase ? 0.35 : 0);

            if (candidateById.has(er.id)) {
                const existing = candidateById.get(er.id);
                existing.lexical_score = Math.max(existing.lexical_score, exactBoost);
                if (hasExactPhrase) existing.exact_phrase_hit = true;
            } else {
                const newItem = {
                    id: er.id,
                    document_id: er.document_id,
                    instance_id: er.instance_id !== undefined ? er.instance_id : (er.metadata?.instance_id ?? null),
                    document_name: er.metadata?.document_name || 'Base de Conhecimento',
                    section: er.metadata?.section_title || '',
                    content: er.content,
                    metadata: er.metadata || {},
                    vector_similarity: er.vector_similarity || 0,
                    lexical_score: exactBoost,
                    exact_phrase_hit: hasExactPhrase,
                    rrf_score: 0.02 + exactBoost * 0.04
                };
                candidates.push(newItem);
                candidateById.set(er.id, newItem);
            }
        }
    }

    // Also compute query token coverage on existing candidates so hybrid rank reflects multi-token precision
    const scored = candidates.map(c => {
        const normC = normalizeForComparison(c.content || '');
        const tokenCov = sigTokens.length > 0
            ? sigTokens.filter(t => normC.includes(t)).length / sigTokens.length
            : 0;
        const phraseBonus = c.exact_phrase_hit ? 0.18 : 0;
        const isCurrentInboxChunk = Boolean(safeInstanceId && c.instance_id === safeInstanceId);
        const inboxPriorityBonus = isCurrentInboxChunk ? 0.06 : 0;
        const effLex = Math.max(Math.min(1, c.lexical_score), tokenCov * 0.85);
        const hasVec = c.vector_similarity > 0;
        const hasLex = effLex >= 0.2;

        const baseScore = hasVec && hasLex
            ? (c.vector_similarity * 0.55 + effLex * 0.45 + 0.12 + phraseBonus + inboxPriorityBonus)
            : hasVec
                ? (c.vector_similarity * 0.95 + inboxPriorityBonus)
                : (effLex * 0.82 + phraseBonus + inboxPriorityBonus);

        const compositeScore = Math.min(0.99, Math.max(0, baseScore));
        const method = hasVec && hasLex
            ? 'Sinergia Híbrida (Vetor + Lexical)'
            : hasVec
                ? 'Semântico (pgvector HNSW)'
                : 'Exato (Palavra-Chave / PT-BR)';

        return {
            ...c,
            lexical_score: Number(effLex.toFixed(4)),
            similarity: Number(compositeScore.toFixed(4)),
            method
        };
    }).sort((a, b) => {
        if (b.similarity !== a.similarity) return b.similarity - a.similarity;
        const aInb = safeInstanceId && a.instance_id === safeInstanceId ? 1 : 0;
        const bInb = safeInstanceId && b.instance_id === safeInstanceId ? 1 : 0;
        return bInb - aInb;
    });

    // Filter out near-duplicate chunks from top-K so distinct facts win
    const diverseSelected = [];
    for (const cand of scored) {
        if (diverseSelected.length >= topK) break;
        const normCand = String(cand.content || '').replace(/^\[[^\]]+\]\s*/g, '');
        const isTooSimilarToPicked = diverseSelected.some(picked => {
            const normPicked = String(picked.content || '').replace(/^\[[^\]]+\]\s*/g, '');
            return computeNormalizedHash(normCand) === computeNormalizedHash(normPicked) ||
                   tokenJaccardSimilarity(normCand, normPicked) >= 0.72;
        });
        if (!isTooSimilarToPicked) {
            diverseSelected.push(cand);
        }
    }

    return diverseSelected;
}
