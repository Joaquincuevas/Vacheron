import type { ApiError, ErrorCode } from '../../shared/types';

/** Status HTTP por defecto de cada código de error. */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  invalid_request: 400,
  rate_limited: 429,
  notion_error: 422,
  upstream_unavailable: 502,
  internal: 500,
};

/**
 * Error con código de dominio. Todo lo que salga del Worker pasa por acá, así
 * el cliente siempre recibe la misma forma y puede decidir si reintentar.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code];
  }

  toResponseBody(): ApiError {
    return { ok: false, error: { code: this.code, message: this.message } };
  }
}

/** Normaliza cualquier throw a un AppError presentable. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : 'Error interno';
  return new AppError('internal', message, { cause: err });
}
