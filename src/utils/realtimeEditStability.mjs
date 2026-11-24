/**
 * Helpers puros de estabilidade de UI contra atualizações redundantes de Realtime / Auth / Polling.
 * Evita re-renders, piscadas e reset de formulários em edição sem bloquear eventos reais (mensagens, status, etc.).
 */

function stableSerialize(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`;
}

/**
 * Compara os campos relevantes de um registro de empresa (`companies`) para evitar
 * substituição de referência de `tenantInfo` quando nada estrutural mudou.
 */
export function haveTenantFieldsChanged(prevTenant, nextTenant) {
  if (!prevTenant && !nextTenant) return false;
  if (!prevTenant || !nextTenant) return true;
  if (prevTenant === nextTenant) return false;

  const scalarKeys = [
    'id',
    'name',
    'email',
    'status',
    'plan_id',
    'global_ai_enabled',
    'evolution_api_instance',
    'economic_group_id'
  ];

  for (const key of scalarKeys) {
    if ((prevTenant[key] ?? null) !== (nextTenant[key] ?? null)) {
      return true;
    }
  }

  return stableSerialize(prevTenant.settings ?? null) !== stableSerialize(nextTenant.settings ?? null);
}

/**
 * Determina se um evento Realtime em `whatsapp_instances` trouxe alteração visual ou
 * de configuração real, ignorando batimentos cardíacos/leases do backend mesmo sem
 * REPLICA IDENTITY FULL no Supabase.
 */
export function haveInstanceVisualFieldsChanged({ eventType, oldRecord, newRecord, cachedRecord } = {}) {
  if (eventType === 'INSERT' || eventType === 'DELETE') return true;
  if (!newRecord) return false;

  const oldRec = oldRecord || {};
  const cached = cachedRecord || null;
  const visualKeys = ['status', 'display_name', 'color', 'phone_number'];
  const fullKeys = ['status', 'display_name', 'color', 'phone_number', 'api_key', 'ticket_mode', 'hide_ticket_modal'];

  const hasMeaningfulOld = visualKeys.some((k) => oldRec[k] !== undefined);
  if (!hasMeaningfulOld && !cached) {
    return true;
  }

  for (const key of fullKeys) {
    const hasOld = oldRec[key] !== undefined;
    const hasCached = cached && cached[key] !== undefined;
    if (!hasOld && !hasCached) continue;
    const baseline = hasOld ? oldRec[key] : cached[key];
    if ((baseline ?? null) !== (newRecord[key] ?? null)) {
      return true;
    }
  }

  const hasSettingsBaseline = oldRec.settings !== undefined || (cached && cached.settings !== undefined);
  if (hasSettingsBaseline) {
    const baseSettings = oldRec.settings !== undefined ? oldRec.settings : cached.settings;
    if (stableSerialize(baseSettings ?? null) !== stableSerialize(newRecord.settings ?? null)) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica se a lista de instâncias exibida na sidebar realmente mudou.
 */
export function haveInstanceListsChanged(prevList = [], nextList = []) {
  if (prevList === nextList) return false;
  if (!Array.isArray(prevList) || !Array.isArray(nextList)) return true;
  if (prevList.length !== nextList.length) return true;

  for (let i = 0; i < prevList.length; i++) {
    const a = prevList[i];
    const b = nextList[i];
    if (!a || !b) return true;
    if (
      a.id !== b.id ||
      a.display_name !== b.display_name ||
      a.status !== b.status ||
      a.color !== b.color ||
      a.phone_number !== b.phone_number ||
      a.tenant_id !== b.tenant_id ||
      stableSerialize(a.settings ?? null) !== stableSerialize(b.settings ?? null)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Decide se um evento do Supabase Auth deve disparar nova busca de empresa/configuração global.
 * Renovações rotineiras de JWT (`TOKEN_REFRESHED`) e recuperações de foco redundantes (`SIGNED_IN`
 * com o mesmo tenant já hidratado) não devem recarregar a UI.
 */
export function shouldFetchTenantOnAuthEvent({
  event,
  storedTenantId,
  currentStoreTenantId,
  hasCompaniesLoaded
} = {}) {
  if (event === 'TOKEN_REFRESHED') {
    return { refetchTenant: false, refetchCompanies: false };
  }

  if (event === 'SIGNED_IN') {
    const isSameTenantHydrated = Boolean(
      storedTenantId &&
        currentStoreTenantId &&
        String(storedTenantId) === String(currentStoreTenantId)
    );
    return {
      refetchTenant: !isSameTenantHydrated,
      refetchCompanies: !isSameTenantHydrated || !hasCompaniesLoaded
    };
  }

  return { refetchTenant: false, refetchCompanies: false };
}

/**
 * Decide se um modal de edição deve reinicializar seus campos a partir das props.
 */
export function shouldResetModalForm({ wasOpen, isOpen, prevTargetKey, nextTargetKey } = {}) {
  if (!isOpen) return false;
  if (!wasOpen) return true;
  return prevTargetKey !== nextTargetKey;
}

/**
 * Decide se uma tela de configurações vinculada a `tenantInfo` deve hidratar os inputs.
 * Impede que atualizações em segundo plano de `tenantInfo` apaguem edições locais em andamento.
 */
export function shouldHydrateTenantForm({ prevHydratedTenantId, nextTenant, isDirty } = {}) {
  if (!nextTenant?.id || !nextTenant?.settings) return false;
  if (prevHydratedTenantId !== nextTenant.id) return true;
  if (isDirty) return false;
  return !prevHydratedTenantId;
}

/**
 * Mescla atualizações Realtime de um card Kanban preservando campos editados localmente
 * pelo usuário na janela ativa de edição.
 */
export function mergeLeadRealtimeSafely({
  currentSelected,
  incomingLead,
  isProtectedEditActive = false,
  dirtyFields = null
} = {}) {
  if (!currentSelected || !incomingLead) return currentSelected;
  if (currentSelected.id !== incomingLead.id) return currentSelected;

  const merged = { ...currentSelected, ...incomingLead };
  if (!isProtectedEditActive && !(dirtyFields && dirtyFields.size > 0)) {
    return merged;
  }

  const protectedKeys = dirtyFields && dirtyFields.size > 0
    ? Array.from(dirtyFields)
    : ['title', 'notes', 'estimated_revenue', 'probability', 'priority', 'agent_id', 'due_date', 'tags'];

  for (const key of protectedKeys) {
    if (key in currentSelected) {
      merged[key] = currentSelected[key];
    }
  }

  return merged;
}
