/**
 * Cliente mínimo de la API de Notion.
 *
 * Dos cosas que la versión 2025-09-03 cambia y que rompen si se ignoran:
 *  - El `parent` al crear una página es `{ data_source_id }`. Pasar el ID de la
 *    base devuelve `validation_error`.
 *  - La cabecera `Notion-Version` es obligatoria en toda request.
 */

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

  constructor(options: NotionClientOptions) {
    this.token = options.token;
    this.dataSourceId = options.dataSourceId;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };
  }

  private request(path: string, init: { method: string; body: unknown }): Promise<Response> {
    return this.fetchImpl(`${NOTION_API_BASE}${path}`, {
      method: init.method,
      headers: this.headers(),
      body: JSON.stringify(init.body),
    });
  }

  /** Crea la página del gasto y devuelve su ID. */
  async createExpense(expense: NormalizedExpense): Promise<string> {
    const res = await this.request('/pages', {
      method: 'POST',
      body: buildCreatePageBody(expense, this.dataSourceId),
    });
    const page = await readJson<{ id?: string }>(res);

    if (!res.ok) throw await notionFailure(res, page as NotionErrorBody);
    if (!page?.id) throw new Error('Notion respondió 2xx pero sin ID de página');
    return page.id;
  }

  /** Manda la página a la papelera. Es el "deshacer" del historial. */
  async trashPage(pageId: string): Promise<void> {
    const res = await this.request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: { in_trash: true },
    });
    if (!res.ok) throw await notionFailure(res, await readJson<NotionErrorBody>(res));
  }
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.clone().json()) as T;
  } catch {
    return null;
  }
}

async function notionFailure(res: Response, body: NotionErrorBody | null): Promise<Error> {
  const code = body?.code ?? 'unknown_error';
  const message = body?.message ?? (await res.clone().text().catch(() => '')) ?? '';
  return new Error(`Notion ${res.status} ${code}: ${message}`);
}
