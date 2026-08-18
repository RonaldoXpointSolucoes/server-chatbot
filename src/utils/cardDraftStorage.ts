/**
 * Utilitário de Cache Local Anti-Perda de Dados para Criação de Tarefas no CRM Kanban
 * Utiliza IndexedDB com fallback para LocalStorage para suportar mídias grandes (áudios, prints, vídeos).
 */

export interface CardMediaAttachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  size: number;
  base64: string;
  previewUrl?: string;
  file?: File;
}

export interface CardDraftData {
  textPrompt?: string;
  audioBase64?: string;
  audioMimeType?: string;
  attachments?: CardMediaAttachment[];
  generatedPlan?: any;
  targetStage?: string;
  updatedAt: number;
}

const DB_NAME = 'ChatBoot_KanbanDrafts';
const STORE_NAME = 'card_drafts';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB não suportado'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'boardId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva o rascunho da tarefa no cache local
 */
export async function saveCardDraft(boardId: string, data: Omit<CardDraftData, 'updatedAt'>): Promise<void> {
  const draftData: CardDraftData = {
    ...data,
    updatedAt: Date.now()
  };

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ boardId, ...draftData });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Fallback para LocalStorage (com tratamento para limite de cota)
    try {
      const serialized = JSON.stringify(draftData);
      localStorage.setItem(`card_draft_${boardId}`, serialized);
    } catch (lsErr) {
      console.warn('[CardDraftStorage] Falha ao salvar no localStorage fallback:', lsErr);
    }
  }
}

/**
 * Carrega o rascunho da tarefa do cache local
 */
export async function loadCardDraft(boardId: string): Promise<CardDraftData | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(boardId);
      req.onsuccess = () => {
        if (req.result) {
          const { boardId: _, ...data } = req.result;
          resolve(data as CardDraftData);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    try {
      const item = localStorage.getItem(`card_draft_${boardId}`);
      if (item) {
        return JSON.parse(item);
      }
    } catch (e) {}
    return null;
  }
}

/**
 * Limpa o rascunho da tarefa após criação com sucesso
 */
export async function clearCardDraft(boardId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(boardId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    try {
      localStorage.removeItem(`card_draft_${boardId}`);
    } catch (e) {}
  }
}
