import { beforeEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { ExpenseInput } from '../shared/types';

// La cola cachea la conexión a IndexedDB a nivel de módulo. Para aislar cada
// test, se estrena una IDBFactory y se reimporta el módulo con la cache limpia.
let q: typeof import('../web/src/lib/queue');

beforeEach(async () => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  vi.resetModules();
  q = await import('../web/src/lib/queue');
});

const expense = (amount: number): ExpenseInput => ({ amount, category: 'Comida' });

describe('enqueue y listado', () => {
  it('encola y cuenta', async () => {
    await q.enqueue(expense(1000));
    await q.enqueue(expense(2000));
    expect(await q.countQueue()).toBe(2);
  });

  it('lista del más viejo al más nuevo', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    await q.enqueue(expense(100));
    now.mockReturnValue(2000);
    await q.enqueue(expense(200));
    now.mockReturnValue(3000);
    await q.enqueue(expense(300));
    now.mockRestore();

    const list = await q.listQueue();
    expect(list.map((i) => i.payload.amount)).toEqual([100, 200, 300]);
  });

  it('asigna id y createdAt', async () => {
    const item = await q.enqueue(expense(500));
    expect(item.id).toMatch(/[0-9a-f-]{36}/);
    expect(item.attempts).toBe(0);
    expect(typeof item.createdAt).toBe('number');
  });
});

describe('remove', () => {
  it('borra por id', async () => {
    const a = await q.enqueue(expense(100));
    await q.enqueue(expense(200));
    await q.removeFromQueue(a.id);
    const list = await q.listQueue();
    expect(list.map((i) => i.payload.amount)).toEqual([200]);
  });
});

describe('claim: lease anti-doble-envío', () => {
  it('el primer claim toma el item e incrementa attempts', async () => {
    const item = await q.enqueue(expense(100));
    const claimed = await q.claim(item.id, 10_000);
    expect(claimed).not.toBeNull();
    expect(claimed!.attempts).toBe(1);
    expect(claimed!.inFlightAt).toBe(10_000);
  });

  it('un segundo claim con lease vigente devuelve null', async () => {
    const item = await q.enqueue(expense(100));
    await q.claim(item.id, 10_000);
    const second = await q.claim(item.id, 10_500); // dentro del TTL
    expect(second).toBeNull();
  });

  it('un item con lease vencido se puede volver a tomar', async () => {
    const item = await q.enqueue(expense(100));
    await q.claim(item.id, 10_000);
    const later = await q.claim(item.id, 10_000 + 31_000); // pasado el TTL de 30s
    expect(later).not.toBeNull();
    expect(later!.attempts).toBe(2);
  });

  it('claim de un id inexistente devuelve null', async () => {
    expect(await q.claim('no-existe')).toBeNull();
  });
});

describe('releaseClaim', () => {
  it('suelta el lease para que un próximo flush lo reintente', async () => {
    const item = await q.enqueue(expense(100));
    await q.claim(item.id, 10_000);
    await q.releaseClaim(item.id, 'timeout');

    // Con el lease liberado, se puede reclamar aunque no haya pasado el TTL.
    const reclaimed = await q.claim(item.id, 10_500);
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.lastError).toBe('timeout');
    expect(reclaimed!.attempts).toBe(2);
  });
});
