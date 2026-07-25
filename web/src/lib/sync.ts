import { claim, listQueue, releaseClaim, removeFromQueue, type QueuedExpense } from './queue';
import { createExpense, ApiError } from './api';

/** Tag del Background Sync. El SW lo escucha y despierta a los clientes. */
export const SYNC_TAG = 'qe-sync';

/** Notion tolera ~3 req/s. Espaciar los envíos evita gatillar 429 en cascada. */
const PACING_MS = 350;

export interface FlushCallbacks {
  /** El gasto llegó a Notion. `pageId` habilita el deshacer en el historial. */
  onSynced?(item: QueuedExpense, pageId: string): void;
  /** Error definitivo (payload/esquema): se descarta de la cola, no se reintenta. */
  onFailed?(item: QueuedExpense, error: string): void;
  /** Cambió la cantidad de pendientes. Refresca el indicador. */
  onChange?(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Un solo flush a la vez en esta pestaña: dos en paralelo pelearían por los
// leases y desordenarían el ritmo. Los leases en IndexedDB cubren el caso entre
// pestañas distintas.
let flushing = false;
let callbacks: FlushCallbacks = {};

export function configureSync(cb: FlushCallbacks): void {
  callbacks = cb;
}

/**
 * Vacía la cola en orden, un gasto a la vez. Devuelve cuántos se enviaron.
 * No lanza: los errores se resuelven por item para que uno malo no frene al resto.
 */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

  flushing = true;
  let sent = 0;

  try {
    const pending = await listQueue();

    for (let i = 0; i < pending.length; i++) {
      const queued = pending[i];
      if (!queued) continue;

      const item = await claim(queued.id);
      if (!item) continue; // otro flush lo tomó, o su lease sigue vigente

      try {
        const pageId = await createExpense(item.payload);
        await removeFromQueue(item.id);
        callbacks.onSynced?.(item, pageId);
        callbacks.onChange?.();
        sent++;
      } catch (err) {
        if (err instanceof ApiError && !err.retryable) {
          // Payload o esquema inválido: reintentar no lo va a arreglar. Se saca
          // de la cola para no tenerla trancada por siempre.
          await removeFromQueue(item.id);
          callbacks.onFailed?.(item, err.message);
          callbacks.onChange?.();
        } else {
          // Red, 429 o 5xx: suelta el lease y queda para el próximo intento.
          const reason = err instanceof Error ? err.message : 'error de red';
          await releaseClaim(item.id, reason);
          // Si se cortó la red, no tiene sentido seguir golpeando: cortar acá.
          if (err instanceof ApiError && err.code === 'network') break;
        }
      }

      if (i < pending.length - 1) await sleep(PACING_MS);
    }
  } finally {
    flushing = false;
  }

  return sent;
}

/** Pide un Background Sync donde exista (Android/Chrome). En iOS es no-op. */
export async function requestBackgroundSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    };
    await reg.sync?.register(SYNC_TAG);
  } catch {
    /* sin Background Sync: el flush en primer plano se hace cargo */
  }
}

/**
 * Conecta los disparadores del flush en primer plano. Es el mecanismo que de
 * verdad corre en el iPhone, donde Background Sync no existe: se vacía la cola
 * al recuperar red, al volver a la app y al abrirla.
 */
export function startForegroundSync(): void {
  const kick = () => void flushQueue();

  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });

  // El SW, ante un Background Sync, nos avisa para que vaciemos con el token que
  // solo vive en el contexto de la página.
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    if (event.data === SYNC_TAG) kick();
  });

  kick();
}
