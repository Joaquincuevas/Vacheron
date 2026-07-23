import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError, ExpenseArchived, ExpenseCreated } from '../../shared/types';
import { expenseSchema, formatIssues, normalizeExpense, pageIdSchema } from './schema';
import { NotionClient } from './notion';
import { toAppError } from './errors';
import { requireAppToken } from './auth';
import type { Env } from './env';

export type { Env };

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

// `/api/health` queda sin auth a propósito: sirve para verificar el deploy.
// Todo lo que escribe en Notion exige el token compartido.
app.use('/api/expense', requireAppToken);
app.use('/api/expense/*', requireAppToken);

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
    return fail(c, err, 'createExpense');
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
    return fail(c, err, 'trashPage');
  }
});

function notionFor(env: Env): NotionClient {
  return new NotionClient({ token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID });
}

/** Único punto donde un throw se convierte en respuesta. */
function fail(c: Context<{ Bindings: Env }>, err: unknown, where: string) {
  const appError = toAppError(err);
  console.error(where, appError.code, appError.message, appError.cause ?? '');
  return c.json(appError.toResponseBody(), appError.status as ContentfulStatusCode);
}

app.notFound((c) =>
  c.json<ApiError>(
    { ok: false, error: { code: 'invalid_request', message: 'Ruta no encontrada' } },
    404,
  ),
);

app.onError((err, c) => fail(c, err, 'unhandled'));

export default app;
