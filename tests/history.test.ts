import { beforeEach, describe, it, expect } from 'vitest';
import {
  addEntry,
  listToday,
  todayTotal,
  updateByQueueId,
  removeEntry,
  type HistoryEntry,
} from '../web/src/lib/history';
import { todayInSantiago } from '../web/src/lib/date';

// history.ts usa localStorage en cada lectura/escritura; en Node no existe, así
// que se le da un stub mínimo respaldado por un Map, nuevo en cada test.
class LocalStorageStub {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const TODAY = todayInSantiago();

function entry(partial: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    amount: 1000,
    category: 'Comida',
    date: TODAY,
    createdAt: Date.now(),
    status: 'synced',
    ...partial,
  };
}

beforeEach(() => {
  // El stub solo implementa lo que history.ts usa (get/set/remove/clear); basta
  // para el test, de ahí el cast a través de unknown al tipo Storage del DOM.
  globalThis.localStorage = new LocalStorageStub() as unknown as Storage;
});

describe('listToday', () => {
  it('devuelve los gastos de hoy, del más nuevo al más viejo', () => {
    addEntry(entry({ amount: 100, createdAt: 1000 }));
    addEntry(entry({ amount: 200, createdAt: 3000 }));
    addEntry(entry({ amount: 300, createdAt: 2000 }));
    expect(listToday().map((e) => e.amount)).toEqual([200, 300, 100]);
  });

  it('excluye gastos de otros días', () => {
    addEntry(entry({ amount: 100, date: TODAY }));
    addEntry(entry({ amount: 999, date: '2020-01-01' }));
    expect(listToday().map((e) => e.amount)).toEqual([100]);
  });

  it('incluye los fallidos: no deben desaparecer en silencio', () => {
    addEntry(entry({ amount: 100, status: 'synced' }));
    addEntry(entry({ amount: 200, status: 'failed' }));
    const statuses = listToday().map((e) => e.status);
    expect(statuses).toContain('failed');
    expect(listToday()).toHaveLength(2);
  });

  it('respeta el tope', () => {
    for (let i = 0; i < 15; i++) addEntry(entry({ amount: i, createdAt: i }));
    expect(listToday(10)).toHaveLength(10);
  });
});

describe('todayTotal', () => {
  it('suma synced y pending, pero no failed', () => {
    addEntry(entry({ amount: 8500, status: 'synced' }));
    addEntry(entry({ amount: 1200, status: 'pending' }));
    addEntry(entry({ amount: 3200, status: 'failed' }));
    expect(todayTotal()).toBe(9700);
  });

  it('ignora otros días', () => {
    addEntry(entry({ amount: 500, date: TODAY }));
    addEntry(entry({ amount: 999, date: '2020-01-01' }));
    expect(todayTotal()).toBe(500);
  });
});

describe('updateByQueueId', () => {
  it('pasa una entrada pendiente a synced con su pageId', () => {
    addEntry(entry({ amount: 100, status: 'pending', queueId: 'q-1' }));
    const id = updateByQueueId('q-1', { status: 'synced', pageId: 'page-1', queueId: undefined });
    expect(id).not.toBeNull();
    const [row] = listToday();
    expect(row!.status).toBe('synced');
    expect(row!.pageId).toBe('page-1');
  });

  it('devuelve null si no hay entrada con ese queueId', () => {
    expect(updateByQueueId('inexistente', { status: 'failed' })).toBeNull();
  });
});

describe('removeEntry', () => {
  it('saca la entrada del historial', () => {
    const e = entry({ amount: 100 });
    addEntry(e);
    removeEntry(e.id);
    expect(listToday()).toHaveLength(0);
  });
});
