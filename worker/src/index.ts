import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiError, ExpenseArchived, ExpenseCreated } from '../../shared/types';
import { expenseSchema, formatIssues, normalizeExpense, pageIdSchema } from './schema';
import { NotionClient } from './notion';

export interface Env {
  NOTION_TOKEN: string;
  NOTION_DATA_SOURCE_ID: string;
  APP_TOKEN: string;
  /** Uno o varios orígenes separados por coma. */
  ALLOWED_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

/**
 * CORS con lista blanca explícita. El Worker es el único que puede hablar con
 * Notion (la API de Notion no manda cabeceras CORS), así que este es el punto
 * donde se decide quién puede escribir en la base.
 */
app.use('/api/*', (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-App-Token'],
    maxAge: 86_400,
  })(c, next);
});

app.get('/api/health', (c) => c.json({ ok: true, service: 'vacheron-api' }));

app.post('/api/expense', async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json<ApiError>(
      { ok: false, error: { code: 'invalid_request', message: 'Body JSON inválido' } },
      400,
    );
  }

  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json<ApiError>(
      { ok: false, error: { code: 'invalid_request', message: formatIssues(parsed.error) } },
      400,
    );
  }

  const expense = normalizeExpense(parsed.data);

  try {
    const pageId = await notionFor(c.env).createExpense(expense);
    return c.json<ExpenseCreated>({ ok: true, pageId });
  } catch (err) {
    console.error('createExpense', err);
    return c.json<ApiError>(
      { ok: false, error: { code: 'notion_error', message: messageOf(err) } },
      502,
    );
  }
});

app.delete('/api/expense/:pageId', async (c) => {
  const parsed = pageIdSchema.safeParse(c.req.param('pageId'));
  if (!parsed.success) {
    return c.json<ApiError>(
      { ok: false, error: { code: 'invalid_request', message: formatIssues(parsed.error) } },
      400,
    );
  }

  try {
    await notionFor(c.env).trashPage(parsed.data);
    return c.json<ExpenseArchived>({ ok: true, pageId: parsed.data, archived: true });
  } catch (err) {
    console.error('trashPage', err);
    return c.json<ApiError>(
      { ok: false, error: { code: 'notion_error', message: messageOf(err) } },
      502,
    );
  }
});

function notionFor(env: Env): NotionClient {
  return new NotionClient({ token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID });
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Error desconocido llamando a Notion';
}

app.notFound((c) =>
  c.json<ApiError>(
    { ok: false, error: { code: 'invalid_request', message: 'Ruta no encontrada' } },
    404,
  ),
);

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json<ApiError>(
    { ok: false, error: { code: 'internal', message: 'Error interno' } },
    500,
  );
});

export default app;
