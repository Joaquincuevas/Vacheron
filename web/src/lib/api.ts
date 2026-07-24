import type {
  ApiError as ApiErrorBody,
  ArchiveResponse,
  ErrorCode,
  ExpenseInput,
  ExpenseResponse,
} from '../../../shared/types';

/** Vacío en desarrollo: Vite proxea /api al Worker en :8787. */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const APP_TOKEN = import.meta.env.VITE_APP_TOKEN ?? '';

/** Con mala señal, un fetch puede quedar colgado. Preferimos encolar y seguir. */
const TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  readonly code: ErrorCode | 'network';
  /** Si vale la pena reintentar más tarde desde la cola offline. */
  readonly retryable: boolean;

  constructor(code: ErrorCode | 'network', message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = isRetryable(code);
  }
}

/**
 * Reintentar un `invalid_request` o un `notion_error` no lo va a arreglar: el
 * problema es el payload o el esquema de la base. Un `unauthorized` tampoco.
 * El resto sí puede resolverse solo cuando vuelva la señal.
 */
export function isRetryable(code: ErrorCode | 'network'): boolean {
  return code === 'network' || code === 'rate_limited' || code === 'upstream_unavailable' || code === 'internal';
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-App-Token': APP_TOKEN, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'sin conexión';
    throw new ApiError('network', reason);
  }

  const body = (await response.json().catch(() => null)) as T | ApiErrorBody | null;

  if (!response.ok || !body || (body as ApiErrorBody).ok === false) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(error?.code ?? 'internal', error?.message ?? `HTTP ${response.status}`);
  }

  return body as T;
}

/** Devuelve el ID de la página creada en Notion. */
export async function createExpense(input: ExpenseInput): Promise<string> {
  const result = await call<Extract<ExpenseResponse, { ok: true }>>('/api/expense', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.pageId;
}

/** Manda la página a la papelera de Notion. Es el deshacer del historial. */
export async function archiveExpense(pageId: string): Promise<void> {
  await call<Extract<ArchiveResponse, { ok: true }>>(`/api/expense/${pageId}`, {
    method: 'DELETE',
  });
}
