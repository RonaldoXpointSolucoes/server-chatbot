import { isTransientSupabaseError } from '../supabase.js';

const EXPECTED_ORDER_REJECTIONS = [
    'feature-not-implemented',
    'not-authorized',
    'item-not-found',
    'bad-request',
    'forbidden',
    'timeout_order_details'
];

/**
 * Cria um carregador resiliente de configuracao por instancia com Stale-While-Revalidate,
 * coalescing in-flight e cooldown apos timeouts transitorios no Supabase.
 */
export function createInstanceConfigLoader({
    fetchFn,
    cacheMap = new Map(),
    inFlightMap = new Map(),
    isCircuitOpen = () => false,
    isTransientError = isTransientSupabaseError,
    onResolvedTenantId = null,
    nowFn = () => Date.now(),
    freshTtlMs = 60_000,
    staleTtlMs = 300_000,
    cooldownMs = 15_000,
    timeoutMs = 4500,
    staleInFlightMs = 8000,
    logThrottleMs = 30_000,
    logger = console
}) {
    const cooldownUntilMap = new Map();
    let lastLogAt = 0;

    const logThrottled = (level, msg) => {
        const now = nowFn();
        if (now - lastLogAt >= logThrottleMs) {
            lastLogAt = now;
            if (level === 'warn') logger.warn(msg);
            else logger.info(msg);
        }
    };

    const startFetch = (instanceId, cachedConfig) => {
        if (inFlightMap.has(instanceId)) {
            const existingEntry = inFlightMap.get(instanceId);
            const entryPromise = existingEntry?.promise || existingEntry;
            const entryStartedAt = existingEntry?.startedAt || 0;
            if (entryPromise && entryStartedAt > 0 && (nowFn() - entryStartedAt < staleInFlightMs)) {
                return entryPromise;
            }
            logThrottled(
                'info',
                `[EventProcessor/SelfHealing] Reciclando consulta getInstanceConfig pendente (>${Math.round(staleInFlightMs / 1000)}s) da instancia ${instanceId}.`
            );
            inFlightMap.delete(instanceId);
        }

        const fetchPromise = (async () => {
            let cfgTimer = null;
            try {
                const res = await Promise.race([
                    fetchFn(instanceId),
                    new Promise((_, reject) => {
                        cfgTimer = setTimeout(() => reject(new Error('INSTANCE_CONFIG_TIMEOUT')), timeoutMs);
                    })
                ]);
                const data = res?.data;
                const error = res?.error;

                if (error) {
                    if (isTransientError(error)) {
                        cooldownUntilMap.set(instanceId, nowFn() + cooldownMs);
                        logThrottled('info', `[EventProcessor/InstanceConfig] Oscilacao transitoria ao buscar config (${instanceId}): ${error.message || error}`);
                    } else {
                        logger.warn('[EventProcessor] Aviso ao buscar config da instância:', error.message || error);
                    }
                    return cachedConfig || {};
                }

                const config = {
                    ...(data?.settings || {}),
                    _resolvedTenantId: data?.tenant_id || cachedConfig?._resolvedTenantId || null
                };
                cacheMap.set(instanceId, { config, timestamp: nowFn() });
                cooldownUntilMap.delete(instanceId);
                if (data?.tenant_id && typeof onResolvedTenantId === 'function') {
                    onResolvedTenantId(instanceId, data.tenant_id);
                }
                return config;
            } catch (err) {
                if (isTransientError(err)) {
                    cooldownUntilMap.set(instanceId, nowFn() + cooldownMs);
                    logThrottled('info', `[EventProcessor/InstanceConfig] Timeout/oscilacao transitoria (${instanceId}): ${err?.message || err}. Mantendo cache/fallback por ${Math.round(cooldownMs / 1000)}s.`);
                } else {
                    logger.warn(`[EventProcessor] Falha ao buscar config da instância ${instanceId}:`, err?.message || err);
                }
                return cachedConfig || {};
            } finally {
                if (cfgTimer) clearTimeout(cfgTimer);
                const currentEntry = inFlightMap.get(instanceId);
                if (!currentEntry || currentEntry === fetchPromise || currentEntry.promise === fetchPromise) {
                    inFlightMap.delete(instanceId);
                }
            }
        })();

        inFlightMap.set(instanceId, { promise: fetchPromise, startedAt: nowFn() });
        return fetchPromise;
    };

    return {
        async getConfig(instanceId) {
            if (!instanceId) return {};
            const now = nowFn();
            const cached = cacheMap.get(instanceId);
            const age = cached ? (now - cached.timestamp) : Infinity;

            if (cached && age < freshTtlMs) {
                return cached.config;
            }

            const blockedByCircuit = isCircuitOpen();
            const cooldownUntil = cooldownUntilMap.get(instanceId) || 0;
            const inCooldown = now < cooldownUntil;

            // Stale-While-Revalidate: responde instantaneamente e atualiza em segundo plano
            if (cached && age < staleTtlMs) {
                if (!blockedByCircuit && !inCooldown && !inFlightMap.has(instanceId)) {
                    startFetch(instanceId, cached.config).catch(() => {});
                }
                return cached.config;
            }

            if (blockedByCircuit || inCooldown) {
                return cached?.config || {};
            }

            return startFetch(instanceId, cached?.config);
        }
    };
}

/**
 * Busca detalhes de carrinho via Baileys com protecao contra feature-not-implemented
 * e cooldown por instancia/pedido para nao gerar ruido continuo em DevLogger.
 */
export function createOrderDetailsFetcher({
    nowFn = () => Date.now(),
    timeoutMs = 5000,
    unsupportedTtlMs = 30 * 60 * 1000,
    logger = console
} = {}) {
    const unsupportedInstanceUntil = new Map();
    const failedOrdersUntil = new Map();

    const isExpectedRejection = (msg) => {
        const lower = String(msg || '').toLowerCase();
        return EXPECTED_ORDER_REJECTIONS.some((token) => lower.includes(token));
    };

    const normalizeOrderResult = (baseDetails, fetchedOrder) => {
        if (!fetchedOrder) return baseDetails;
        const products = (fetchedOrder.products || []).map((p) => ({
            id: p.id,
            name: p.name,
            quantity: Number(p.quantity || 1),
            price: p.price ? Number(p.price) / 1000 : 0,
            currency: p.currency || 'BRL',
            imageUrl: p.imageUrl || null
        }));
        const calcTotal = fetchedOrder.price?.total
            ? Number(fetchedOrder.price.total) / 1000
            : baseDetails.totalAmount;
        return {
            ...baseDetails,
            totalAmount: calcTotal,
            currency: fetchedOrder.price?.currency || baseDetails.currency,
            products
        };
    };

    return {
        async enrich(instanceId, sock, orderMessage, baseDetails) {
            if (!sock || typeof sock.getOrderDetails !== 'function' || !orderMessage?.orderId || !orderMessage?.token) {
                return baseDetails;
            }

            const now = nowFn();
            const instKey = instanceId || 'default';
            const instCooldown = unsupportedInstanceUntil.get(instKey) || 0;
            const orderKey = `${instKey}:${orderMessage.orderId}`;
            const orderCooldown = failedOrdersUntil.get(orderKey) || 0;

            if (now < instCooldown || now < orderCooldown) {
                return baseDetails;
            }

            let orderTimer = null;
            try {
                const fetchedOrder = await Promise.race([
                    sock.getOrderDetails(orderMessage.orderId, orderMessage.token),
                    new Promise((_, reject) => {
                        orderTimer = setTimeout(() => reject(new Error('TIMEOUT_ORDER_DETAILS')), timeoutMs);
                    })
                ]);
                return normalizeOrderResult(baseDetails, fetchedOrder);
            } catch (err) {
                const msg = err?.message || String(err);
                if (isExpectedRejection(msg)) {
                    const lower = msg.toLowerCase();
                    if (lower.includes('feature-not-implemented') || lower.includes('not-authorized') || lower.includes('forbidden')) {
                        unsupportedInstanceUntil.set(instKey, nowFn() + unsupportedTtlMs);
                    } else {
                        failedOrdersUntil.set(orderKey, nowFn() + unsupportedTtlMs);
                    }
                    logger.info(`[EventProcessor/Order] Detalhes do carrinho (${orderMessage.orderId}) indisponiveis (${msg}); usando resumo nativo.`);
                } else {
                    logger.warn(`[EventProcessor] Aviso ao buscar detalhes do carrinho (${orderMessage.orderId}):`, msg);
                }
                return baseDetails;
            } finally {
                if (orderTimer) clearTimeout(orderTimer);
            }
        }
    };
}
