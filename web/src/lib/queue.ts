import { openDb, promisify, txDone, QUEUE_STORE } from './db';
import type { ExpenseInput } from '../../../shared/types';

export interface QueuedExpense {
  id: string;
  payload: ExpenseInput;
  createdAt: number;
  attempts: number;
  /** Lease: marca de tiempo del flush que lo tomó. Evita doble envío. */
  inFlightAt?: number;
  lastError?: string;
}

/** Un item "en vuelo" tomado hace más de esto se considera abandonado y se reintenta. */
const LEASE_TTL_MS = 30_000;

export async function enqueue(payload: ExpenseInput): Promise<QueuedExpense> {
  const item: QueuedExpense = {
    id: crypto.randomUUID(),
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  tx.objectStore(QUEUE_STORE).add(item);
  await txDone(tx);
  return item;
}

/** Todos los pendientes, del más viejo al más nuevo. */
export async function listQueue(): Promise<QueuedExpense[]> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readonly');
  const index = tx.objectStore(QUEUE_STORE).index('createdAt');
  return promisify(index.getAll());
}

export async function countQueue(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readonly');
  return promisify(tx.objectStore(QUEUE_STORE).count());
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  tx.objectStore(QUEUE_STORE).delete(id);
  await txDone(tx);
}

/**
 * Marca un item como tomado por este flush, en una transacción atómica: si otro
 * flush ya lo tenía con un lease vigente, devuelve null y no lo toca. Así dos
 * flushes concurrentes (evento `online` + apertura de la app, por ejemplo) no
 * mandan el mismo gasto dos veces.
 */
export async function claim(id: string, now: number = Date.now()): Promise<QueuedExpense | null> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(QUEUE_STORE);
  const item = await promisify(store.get(id) as IDBRequest<QueuedExpense | undefined>);

  if (!item) {
    await txDone(tx);
    return null;
  }
  if (item.inFlightAt && now - item.inFlightAt < LEASE_TTL_MS) {
    await txDone(tx);
    return null;
  }

  item.inFlightAt = now;
  item.attempts += 1;
  store.put(item);
  await txDone(tx);
  return item;
}

/** Suelta el lease y anota el error, para que un próximo flush lo reintente. */
export async function releaseClaim(id: string, error: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(QUEUE_STORE);
  const item = await promisify(store.get(id) as IDBRequest<QueuedExpense | undefined>);
  if (item) {
    delete item.inFlightAt;
    item.lastError = error;
    store.put(item);
  }
  await txDone(tx);
}
