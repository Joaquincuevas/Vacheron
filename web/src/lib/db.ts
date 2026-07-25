/**
 * Apertura de IndexedDB y helpers promisificados. IndexedDB es callback-based y
 * verboso; estas envolturas dejan el resto del código en async/await.
 *
 * El SW también abre esta misma base para vaciar la cola en background sync, así
 * que la definición del store vive acá y la importan ambos.
 */

export const DB_NAME = 'quick-expense';
export const DB_VERSION = 1;
export const QUEUE_STORE = 'queue';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        // Índice para vaciar en el orden en que se registraron los gastos.
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
  });

  return dbPromise;
}

/** Envuelve un IDBRequest en una promesa. */
export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error de IndexedDB'));
  });
}

/** Espera a que la transacción complete, para saber que el commit se hizo. */
export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transacción fallida'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}
