import { AppError } from './errors';

export interface RetryOptions {
  /** Intentos totales, incluido el primero. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Inyectables para que los tests no esperen de verdad. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface ResolvedRetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

function resolve(options: RetryOptions): ResolvedRetryOptions {
  return {
    attempts: options.attempts ?? 4,
    baseDelayMs: options.baseDelayMs ?? 300,
    maxDelayMs: options.maxDelayMs ?? 4_000,
    sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    random: options.random ?? Math.random,
  };
}

/**
 * 429 es el rate limit de Notion (~3 req/s). 409 es un conflicto transitorio y
 * los 5xx son fallas del otro lado: todos se reintentan. El resto de los 4xx es
 * culpa nuestra y reintentar solo gasta tiempo.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 409 || status >= 500;
}

/**
 * Cuánto esperar antes del siguiente intento. Si Notion manda `Retry-After`,
 * manda Notion: sabe mejor que nosotros cuándo se libera la cuota.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter: string | null,
  options: RetryOptions = {},
): number {
  const { baseDelayMs, maxDelayMs, random } = resolve(options);

  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, maxDelayMs);
    }
  }

  const backoff = baseDelayMs * 2 ** attempt;
  // Jitter para que varios gastos encolados no reintenten todos en el mismo ms.
  const jitter = backoff * 0.25 * random();
  return Math.min(backoff + jitter, maxDelayMs);
}

/**
 * Ejecuta `perform` reintentando ante status recuperables y ante fallas de red.
 * Devuelve la última Response — mapear su status a un error es del que llama.
 */
export async function withRetry(
  perform: () => Promise<Response>,
  options: RetryOptions = {},
): Promise<Response> {
  const opts = resolve(options);
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    const isLast = attempt === opts.attempts - 1;

    let res: Response;
    try {
      res = await perform();
    } catch (err) {
      lastNetworkError = err;
      if (isLast) break;
      await opts.sleep(retryDelayMs(attempt, null, opts));
      continue;
    }

    if (isLast || !isRetryableStatus(res.status)) return res;
    await opts.sleep(retryDelayMs(attempt, res.headers.get('Retry-After'), opts));
  }

  const detail = lastNetworkError instanceof Error ? lastNetworkError.message : 'red no disponible';
  throw new AppError('upstream_unavailable', `No se pudo contactar a Notion: ${detail}`, {
    cause: lastNetworkError,
  });
}
