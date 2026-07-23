import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiError } from '../../shared/types';

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
