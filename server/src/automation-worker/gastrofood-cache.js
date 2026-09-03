import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Garante o diretório de dados persistente em server/data/
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'gastrofood_cache.json');

class GastrofoodCacheManager {
    constructor() {
        this.cache = {
            tenants: {}
        };
        this.initializedTenants = new Set();
        this.loadFromDisk();
    }

    /**
     * Carrega o cache persistente do disco, se existir.
     */
    loadFromDisk() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            if (fs.existsSync(CACHE_FILE)) {
                const raw = fs.readFileSync(CACHE_FILE, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed.tenants) {
                    this.cache = parsed;
                    console.log(`[GastrofoodCache] Cache carregado do disco com sucesso (${Object.keys(this.cache.tenants).length} tenants registrados).`);
                }
            }
        } catch (err) {
            console.warn('[GastrofoodCache] Aviso ao carregar cache do disco:', err.message);
        }
    }

    /**
     * Salva o cache persistente no disco de forma segura.
     */
    saveToDisk() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf8');
        } catch (err) {
            console.warn('[GastrofoodCache] Aviso ao salvar cache no disco:', err.message);
        }
    }

    /**
     * Normaliza IDs de produtos para busca case-insensitive e sem espaços.
     */
    normalizeId(id) {
        if (!id) return '';
        return String(id).toLowerCase().trim();
    }

    /**
     * Obtém ou inicializa a estrutura de um tenant no cache.
     */
    getTenantData(tenantId) {
        if (!this.cache.tenants[tenantId]) {
            this.cache.tenants[tenantId] = {
                lastCardapioSync: 0,
                syncedProducts: {}
            };
        }
        return this.cache.tenants[tenantId];
    }

    /**
     * Inicializa os dados do tenant a partir do Supabase na primeira execução.
     * Identifica todos os produtos que já possuem passos ou registro dummy gravados.
     */
    async initTenantFromDatabase(tenantId, supabase) {
        if (!tenantId || this.initializedTenants.has(tenantId)) {
            return;
        }

        const tenantData = this.getTenantData(tenantId);

        try {
            console.log(`[GastrofoodCache] Inicializando mapa de produtos já consultados para o tenant ${tenantId}...`);
            
            // Busca todos os passos e registros dummy de uma só vez (com paginação se necessário)
            let allPassos = [];
            let from = 0;
            const step = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('cardapio_passos')
                    .select('id, produto_id, created_at')
                    .eq('tenant_id', tenantId)
                    .range(from, from + step - 1);

                if (error) {
                    console.warn(`[GastrofoodCache] Erro ao carregar passos do tenant ${tenantId}:`, error.message);
                    break;
                }

                if (data && data.length > 0) {
                    allPassos = allPassos.concat(data);
                    if (data.length < step) {
                        hasMore = false;
                    } else {
                        from += step;
                    }
                } else {
                    hasMore = false;
                }
            }

            let loadedCount = 0;
            allPassos.forEach(p => {
                const normId = this.normalizeId(p.produto_id);
                if (normId) {
                    const isDummy = String(p.id).startsWith('no_steps_');
                    if (!tenantData.syncedProducts[normId]) {
                        tenantData.syncedProducts[normId] = {
                            syncedAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
                            hasSteps: !isDummy,
                            isDummy
                        };
                        loadedCount++;
                    }
                }
            });

            this.initializedTenants.add(tenantId);
            this.saveToDisk();

            console.log(`[GastrofoodCache] Tenant ${tenantId}: ${loadedCount} produtos identificados como já consultados e guardados no banco.`);
        } catch (err) {
            console.warn(`[GastrofoodCache] Falha ao sincronizar cache inicial do tenant ${tenantId}:`, err.message);
            this.initializedTenants.add(tenantId); // Evita loop de retry imediato
        }
    }

    /**
     * Verifica se o cardápio completo foi consultado há menos de 60 minutos (1 hora).
     */
    isCardapioRecent(tenantId, maxAgeMs = 60 * 60 * 1000) {
        const tenantData = this.getTenantData(tenantId);
        const now = Date.now();
        const diff = now - (tenantData.lastCardapioSync || 0);
        return diff < maxAgeMs;
    }

    /**
     * Retorna quantos minutos faltam para expirar a janela de 1 hora do cardápio.
     */
    getMinutesUntilNextAllowedSync(tenantId, maxAgeMs = 60 * 60 * 1000) {
        const tenantData = this.getTenantData(tenantId);
        const diff = Date.now() - (tenantData.lastCardapioSync || 0);
        if (diff >= maxAgeMs) return 0;
        return Math.ceil((maxAgeMs - diff) / (60 * 1000));
    }

    /**
     * Registra que o cardápio completo foi consultado com sucesso.
     */
    markCardapioSynced(tenantId) {
        const tenantData = this.getTenantData(tenantId);
        tenantData.lastCardapioSync = Date.now();
        this.saveToDisk();
    }

    /**
     * Verifica se os adicionais/passos de um produto já foram consultados e guardados.
     * Retorna true se NÃO deve consultar novamente.
     */
    isProductStepsSynced(tenantId, productId) {
        const tenantData = this.getTenantData(tenantId);
        const normId = this.normalizeId(productId);
        if (!normId) return true; // Se não tiver ID válido, ignora
        return Boolean(tenantData.syncedProducts[normId]);
    }

    /**
     * Marca um produto como consultado e guardado.
     * NUNCA mais será consultado na API Gastrofood.
     */
    markProductStepsSynced(tenantId, productId, hasSteps = false, stepsCount = 0) {
        const tenantData = this.getTenantData(tenantId);
        const normId = this.normalizeId(productId);
        if (!normId) return;

        tenantData.syncedProducts[normId] = {
            syncedAt: Date.now(),
            hasSteps: Boolean(hasSteps),
            stepsCount: Number(stepsCount || 0)
        };

        this.saveToDisk();
    }

    /**
     * Retorna estatísticas de cache do tenant.
     */
    getStats(tenantId) {
        const tenantData = this.getTenantData(tenantId);
        const totalSynced = Object.keys(tenantData.syncedProducts).length;
        const withSteps = Object.values(tenantData.syncedProducts).filter(p => p.hasSteps).length;
        return {
            totalSynced,
            withSteps,
            withoutSteps: totalSynced - withSteps,
            lastCardapioSync: tenantData.lastCardapioSync ? new Date(tenantData.lastCardapioSync).toISOString() : null
        };
    }
}

export const gastrofoodCache = new GastrofoodCacheManager();
