/**
 * Cliente mínimo de la API de Notion.
 *
 * Dos cosas que la versión 2025-09-03 cambia y que rompen si se ignoran:
 *  - El `parent` al crear una página es `{ data_source_id }`. Pasar el ID de la
 *    base devuelve `validation_error`.
 *  - La cabecera `Notion-Version` es obligatoria en toda request.
 */

import { AppError } from './errors';
import { withRetry, type RetryOptions } from './retry';

export const NOTION_VERSION = '2025-09-03';
export const NOTION_API_BASE = 'https://api.notion.com/v1';

export interface NormalizedExpense {
  amount: number;
  category: string;
  /** `YYYY-MM-DD` */
  date: string;
  note?: string;
}

/** `fetch` inyectable para poder mockearlo en los tests. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface NotionClientOptions {
  token: string;
  dataSourceId: string;
  fetchImpl?: FetchLike;
  retry?: RetryOptions;
}

/** Cuerpo de error de Notion: `{ object: 'error', status, code, message }`. */
export interface NotionErrorBody {
  object?: string;
  status?: number;
  code?: string;
  message?: string;
}

/**
 * El título de la página es la nota si existe; si no, el nombre de la
 * categoría, para que la fila nunca quede sin nombre en Notion.
 */
export function buildCreatePageBody(expense: NormalizedExpense, dataSourceId: string) {
  return {
    parent: { data_source_id: dataSourceId },
    properties: {
      Gasto: { title: [{ text: { content: expense.note || expense.category } }] },
      Monto: { number: expense.amount },
      Categoria: { select: { name: expense.category } },
      Fecha: { date: { start: expense.date } },
    },
  };
}

export class NotionClient {
  private readonly token: string;
  private readonly dataSourceId: string;
  private readonly fetchImpl: FetchLike;
  private readonly retry: RetryOptions;

  constructor(options: NotionClientOptions) {
    this.token = options.token;
    this.dataSourceId = options.dataSourceId;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.retry = options.retry ?? {};
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };
  }

  /** Reintenta ante 429/5xx antes de devolver la última respuesta. */
  private send(path: string, method: string, body: unknown): Promise<Response> {
    return withRetry(
      () =>
        this.fetchImpl(`${NOTION_API_BASE}${path}`, {
          method,
          headers: this.headers(),
          body: JSON.stringify(body),
        }),
      this.retry,
    );
  }

  /** Crea la página del gasto y devuelve su ID. */
  async createExpense(expense: NormalizedExpense): Promise<string> {
    const res = await this.send('/pages', 'POST', buildCreatePageBody(expense, this.dataSourceId));
    const page = await readJson<{ id?: string }>(res);

    if (!res.ok) throw notionError(res, page as NotionErrorBody | null);
    if (!page?.id) {
      throw new AppError('notion_error', 'Notion respondió 2xx pero sin ID de página');
    }
    return page.id;
  }

  /** Manda la página a la papelera. Es el "deshacer" del historial. */
  async trashPage(pageId: string): Promise<void> {
    const res = await this.send(`/pages/${pageId}`, 'PATCH', { in_trash: true });
    if (!res.ok) throw notionError(res, await readJson<NotionErrorBody>(res));
  }
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.clone().json()) as T;
  } catch {
    return null;
  }
}

/**
 * Traduce el error de Notion a uno de dominio. La distinción que importa: qué
 * es culpa de la configuración (token, esquema) y qué es transitorio y vale la
 * pena reintentar desde el cliente.
 */
export function notionError(res: Response, body: NotionErrorBody | null): AppError {
  const code = body?.code ?? 'unknown_error';
  const detail = body?.message ?? `HTTP ${res.status}`;

  if (res.status === 401 || res.status === 403) {
    return new AppError(
      'internal',
      `Notion rechazó las credenciales (${code}). Revisa NOTION_TOKEN y que la integración esté conectada a la base.`,
    );
  }
  if (res.status === 404) {
    return new AppError(
      'notion_error',
      `Notion no encuentra el recurso (${code}). Revisa NOTION_DATA_SOURCE_ID: debe ser el ID del origen de datos, no el de la base.`,
    );
  }
  if (res.status === 429) {
    return new AppError('rate_limited', 'Notion está limitando las peticiones. Reintenta en unos segundos.');
  }
  if (res.status >= 500) {
    return new AppError('upstream_unavailable', `Notion no está disponible (${res.status}).`);
  }
  return new AppError('notion_error', `Notion ${res.status} ${code}: ${detail}`);
}
