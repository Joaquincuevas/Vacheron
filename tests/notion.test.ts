import { describe, it, expect, vi } from 'vitest';
import {
  NotionClient,
  buildCreatePageBody,
  NOTION_VERSION,
  type FetchLike,
} from '../worker/src/notion';
import { AppError } from '../worker/src/errors';

const DATA_SOURCE = '11112222-3333-4444-5555-666677778888';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Un fetch mockeado que registra la última llamada. */
function mockFetch(response: Response): { fetch: FetchLike; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(response);
  };
  return { fetch, calls };
}

describe('buildCreatePageBody', () => {
  it('usa data_source_id como parent, no database_id', () => {
    const body = buildCreatePageBody(
      { amount: 8500, category: 'Comida', date: '2026-07-23' },
      DATA_SOURCE,
    );
    expect(body.parent).toEqual({ data_source_id: DATA_SOURCE });
    expect(body.parent).not.toHaveProperty('database_id');
  });

  it('arma las cuatro propiedades con la forma exacta de Notion', () => {
    const body = buildCreatePageBody(
      { amount: 8500, category: 'Comida', date: '2026-07-23', note: 'Almuerzo' },
      DATA_SOURCE,
    );
    expect(body.properties).toEqual({
      Gasto: { title: [{ text: { content: 'Almuerzo' } }] },
      Monto: { number: 8500 },
      Categoria: { select: { name: 'Comida' } },
      Fecha: { date: { start: '2026-07-23' } },
    });
  });

  it('cae al nombre de la categoría cuando no hay nota', () => {
    const body = buildCreatePageBody({ amount: 100, category: 'Café', date: '2026-07-23' }, DATA_SOURCE);
    expect(body.properties.Gasto.title[0]!.text.content).toBe('Café');
  });
});

describe('NotionClient.createExpense', () => {
  it('manda Notion-Version 2025-09-03 y el bearer token', async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ id: 'page-1' }, 200));
    const client = new NotionClient({ token: 'ntn_secret', dataSourceId: DATA_SOURCE, fetchImpl: fetch });

    await client.createExpense({ amount: 8500, category: 'Comida', date: '2026-07-23' });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Notion-Version']).toBe(NOTION_VERSION);
    expect(NOTION_VERSION).toBe('2025-09-03');
    expect(headers['Authorization']).toBe('Bearer ntn_secret');
    expect(calls[0]!.url).toBe('https://api.notion.com/v1/pages');
  });

  it('devuelve el id de la página creada', async () => {
    const { fetch } = mockFetch(jsonResponse({ id: 'page-xyz' }, 200));
    const client = new NotionClient({ token: 't', dataSourceId: DATA_SOURCE, fetchImpl: fetch });
    await expect(client.createExpense({ amount: 1, category: 'Otros', date: '2026-07-23' })).resolves.toBe(
      'page-xyz',
    );
  });

  it('traduce un 401 a error de credenciales que apunta al token', async () => {
    const { fetch } = mockFetch(jsonResponse({ code: 'unauthorized', message: 'invalid token' }, 401));
    const client = new NotionClient({ token: 'bad', dataSourceId: DATA_SOURCE, fetchImpl: fetch });
    await expect(client.createExpense({ amount: 1, category: 'Otros', date: '2026-07-23' })).rejects.toMatchObject(
      { code: 'internal' },
    );
  });

  it('un 404 sugiere revisar el data_source_id', async () => {
    const { fetch } = mockFetch(jsonResponse({ code: 'object_not_found', message: 'not found' }, 404));
    const client = new NotionClient({ token: 't', dataSourceId: DATA_SOURCE, fetchImpl: fetch });
    const error = await client
      .createExpense({ amount: 1, category: 'Otros', date: '2026-07-23' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('notion_error');
    expect((error as AppError).message).toMatch(/data_source_id|origen de datos/i);
  });

  it('lanza si Notion responde 2xx sin id', async () => {
    const { fetch } = mockFetch(jsonResponse({}, 200));
    const client = new NotionClient({ token: 't', dataSourceId: DATA_SOURCE, fetchImpl: fetch });
    await expect(client.createExpense({ amount: 1, category: 'Otros', date: '2026-07-23' })).rejects.toThrow();
  });
});

describe('NotionClient.trashPage', () => {
  it('hace PATCH con in_trash true a la página', async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ id: 'page-1', in_trash: true }, 200));
    const client = new NotionClient({ token: 't', dataSourceId: DATA_SOURCE, fetchImpl: fetch });

    await client.trashPage('page-1');

    expect(calls[0]!.url).toBe('https://api.notion.com/v1/pages/page-1');
    expect(calls[0]!.init.method).toBe('PATCH');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ in_trash: true });
  });
});

describe('reintentos ante 429', () => {
  it('reintenta un 429 y luego tiene éxito', async () => {
    const responses = [jsonResponse({ code: 'rate_limited' }, 429), jsonResponse({ id: 'page-ok' }, 200)];
    let i = 0;
    const fetch: FetchLike = () => Promise.resolve(responses[i++]!);
    const client = new NotionClient({
      token: 't',
      dataSourceId: DATA_SOURCE,
      fetchImpl: fetch,
      retry: { baseDelayMs: 0, maxDelayMs: 0, sleep: () => Promise.resolve() },
    });

    await expect(client.createExpense({ amount: 1, category: 'Otros', date: '2026-07-23' })).resolves.toBe(
      'page-ok',
    );
    expect(i).toBe(2);
  });

  it('no reintenta un 400', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse({ code: 'validation_error' }, 400)));
    const client = new NotionClient({
      token: 't',
      dataSourceId: DATA_SOURCE,
      fetchImpl: fetch,
      retry: { baseDelayMs: 0, sleep: () => Promise.resolve() },
    });

    await client.createExpense({ amount: 1, category: 'Otros', date: '2026-07-23' }).catch(() => {});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
