import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ExpenseInput } from '../shared/types';

// sync + queue comparten estado de módulo (la conexión IndexedDB, el flag de
// flush). Se reimportan juntos tras estrenar la IDBFactory para aislar cada test.
let queue: typeof import('../web/src/lib/queue');
let sync: typeof import('../web/src/lib/sync');

const expense = (amount: number): ExpenseInput => ({ amount, category: 'Comida' });

function okResponse(pageId: string): Response {
  return new Response(JSON.stringify({ ok: true, pageId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message: code } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(async () => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  vi.resetModules();
  queue = await import('../web/src/lib/queue');
  sync = await import('../web/src/lib/sync');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('flushQueue', () => {
  it('vacía la cola en éxito y avisa cada sincronización', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => okResponse(`page-${++n}`));
    vi.stubGlobal('fetch', fetchMock);

    await queue.enqueue(expense(1000));
    await queue.enqueue(expense(2000));

    const synced: string[] = [];
    sync.configureSync({ onSynced: (_item, pageId) => synced.push(pageId) });

    const sent = await sync.flushQueue();

    expect(sent).toBe(2);
    expect(synced).toEqual(['page-1', 'page-2']);
    expect(await queue.countQueue()).toBe(0);
  });

  it('descarta de la cola un error definitivo y lo reporta como fallido', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse('invalid_request', 400)));

    await queue.enqueue(expense(1000));
    const failed: string[] = [];
    sync.configureSync({ onFailed: (_item, error) => failed.push(error) });

    const sent = await sync.flushQueue();

    expect(sent).toBe(0);
    expect(failed).toHaveLength(1);
    expect(await queue.countQueue()).toBe(0); // no queda trancando la cola
  });

  it('conserva en la cola un error recuperable para reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse('upstream_unavailable', 502)));

    await queue.enqueue(expense(1000));
    const synced: string[] = [];
    sync.configureSync({ onSynced: (_i, p) => synced.push(p) });

    const sent = await sync.flushQueue();

    expect(sent).toBe(0);
    expect(synced).toHaveLength(0);
    expect(await queue.countQueue()).toBe(1); // sigue pendiente

    // El lease se soltó: un próximo flush lo puede volver a tomar.
    const items = await queue.listQueue();
    expect(items[0]!.inFlightAt).toBeUndefined();
    expect(items[0]!.lastError).toBeTruthy();
  });

  it('corta si se cae la red y deja todo pendiente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await queue.enqueue(expense(1000));
    await queue.enqueue(expense(2000));

    const sent = await sync.flushQueue();

    expect(sent).toBe(0);
    expect(await queue.countQueue()).toBe(2);
  });

  it('dos flushes concurrentes no mandan lo mismo dos veces', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => okResponse(`page-${++n}`));
    vi.stubGlobal('fetch', fetchMock);

    await queue.enqueue(expense(1000));

    const [a, b] = await Promise.all([sync.flushQueue(), sync.flushQueue()]);

    // Uno hace el trabajo, el otro se corta por el guard de flush en curso.
    expect(a + b).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await queue.countQueue()).toBe(0);
  });
});
