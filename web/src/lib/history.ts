import { todayInSantiago } from './date';

/**
 * Historial local, en localStorage. Es una vista de conveniencia — la fuente de
 * verdad es Notion —, así que no necesita IndexedDB: unas pocas decenas de
 * entradas caben de sobra.
 */
export type HistoryStatus = 'synced' | 'pending' | 'failed';

export interface HistoryEntry {
  id: string;
  /** Presente solo si llegó a Notion. Habilita el deshacer (archivar). */
  pageId?: string;
  /** Enlace con la cola offline mientras está 'pending'. */
  queueId?: string;
  amount: number;
  category: string;
  note?: string;
  date: string;
  createdAt: number;
  status: HistoryStatus;
  /** Motivo, cuando status es 'failed'. */
  lastError?: string;
}

const STORAGE_KEY = 'qe:history:v1';
const MAX_ENTRIES = 50;

function read(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* sin persistencia el historial dura la sesión; no vale romper el flujo */
  }
}

export function addEntry(entry: HistoryEntry): void {
  write([entry, ...read()]);
}

export function updateEntry(id: string, patch: Partial<HistoryEntry>): void {
  write(read().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

/** Actualiza la entrada ligada a un item de la cola. Devuelve su id, si existía. */
export function updateByQueueId(queueId: string, patch: Partial<HistoryEntry>): string | null {
  const entries = read();
  const target = entries.find((e) => e.queueId === queueId);
  if (!target) return null;
  write(entries.map((e) => (e.queueId === queueId ? { ...e, ...patch } : e)));
  return target.id;
}

export function removeEntry(id: string): void {
  write(read().filter((e) => e.id !== id));
}

/** Gastos de hoy, del más reciente al más viejo, tope de `limit`. */
export function listToday(limit = 10, today: string = todayInSantiago()): HistoryEntry[] {
  return read()
    .filter((e) => e.date === today && e.status !== 'failed')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** Total acumulado de hoy. Cuenta lo confirmado y lo pendiente, no lo fallido. */
export function todayTotal(today: string = todayInSantiago()): number {
  return read()
    .filter((e) => e.date === today && e.status !== 'failed')
    .reduce((sum, e) => sum + e.amount, 0);
}
