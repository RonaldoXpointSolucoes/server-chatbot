import { useState, useEffect } from 'react';

export type ViewMode = 'grid' | 'list';

export const SYSTEM_VIEW_MODE_STORAGE_KEY = 'system_global_view_mode';

/**
 * Obtém a preferência global de visualização ('grid' ou 'list') do localStorage.
 * Caso não exista, retorna o defaultMode (padrão: 'grid').
 */
export function getGlobalViewMode(defaultMode: ViewMode = 'grid'): ViewMode {
  if (typeof window === 'undefined') return defaultMode;
  try {
    const saved = localStorage.getItem(SYSTEM_VIEW_MODE_STORAGE_KEY);
    if (saved === 'grid' || saved === 'list') {
      return saved;
    }
    // Fallback para chaves legadas se existirem
    const legacy = localStorage.getItem('checklist_user_view_mode') || 
                   localStorage.getItem('checklist_cargo_view_mode') ||
                   localStorage.getItem('checklist_builder_view_mode');
    if (legacy === 'grid' || legacy === 'list') {
      return legacy;
    }
  } catch (e) {
    console.warn('[ViewModePreference] Erro ao ler preferência de visualização:', e);
  }
  return defaultMode;
}

/**
 * Salva a preferência global de visualização ('grid' ou 'list') de forma persistente.
 * Dispara evento em tempo real para sincronizar todas as telas e abas.
 */
export function setGlobalViewMode(mode: ViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SYSTEM_VIEW_MODE_STORAGE_KEY, mode);
    // Sincroniza chaves legadas para compatibilidade
    localStorage.setItem('checklist_user_view_mode', mode);
    localStorage.setItem('checklist_cargo_view_mode', mode);
    localStorage.setItem('checklist_builder_view_mode', mode);
    localStorage.setItem('checklist_tasks_view_mode', mode);

    // Dispara evento customizado na mesma janela/aba
    window.dispatchEvent(new CustomEvent('global_view_mode_changed', { detail: mode }));
  } catch (e) {
    console.warn('[ViewModePreference] Erro ao salvar preferência de visualização:', e);
  }
}

/**
 * Hook React para gerenciar e sincronizar a visualização em Grade ('grid') ou Lista ('list')
 * de forma unificada e persistente em todas as telas da aplicação.
 */
export function useGlobalViewMode(defaultMode: ViewMode = 'grid'): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setLocalViewMode] = useState<ViewMode>(() => getGlobalViewMode(defaultMode));

  const changeViewMode = (newMode: ViewMode) => {
    setLocalViewMode(newMode);
    setGlobalViewMode(newMode);
  };

  useEffect(() => {
    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<ViewMode>;
      if (customEvent.detail && (customEvent.detail === 'grid' || customEvent.detail === 'list')) {
        setLocalViewMode(customEvent.detail);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SYSTEM_VIEW_MODE_STORAGE_KEY && (e.newValue === 'grid' || e.newValue === 'list')) {
        setLocalViewMode(e.newValue);
      }
    };

    window.addEventListener('global_view_mode_changed', handleCustomChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('global_view_mode_changed', handleCustomChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return [viewMode, changeViewMode];
}
