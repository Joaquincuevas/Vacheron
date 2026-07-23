/**
 * Contrato entre el cliente y el Worker. Única fuente de verdad: lo importan
 * ambos lados, así un cambio de forma rompe la compilación en vez de romper
 * en producción.
 */

export interface ExpenseInput {
  /** Entero en CLP. Sin decimales. */
  amount: number;
  /** Debe existir como opción del Select `Categoria` en Notion. */
  category: string;
  note?: string;
  /** `YYYY-MM-DD`. Si falta, el Worker usa hoy en America/Santiago. */
  date?: string;
}

export type ErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'rate_limited'
  | 'notion_error'
  | 'upstream_unavailable'
  | 'internal';

export interface ApiError {
  ok: false;
  error: { code: ErrorCode; message: string };
}

export interface ExpenseCreated {
  ok: true;
  pageId: string;
}

export interface ExpenseArchived {
  ok: true;
  pageId: string;
  archived: true;
}

export type ExpenseResponse = ExpenseCreated | ApiError;
export type ArchiveResponse = ExpenseArchived | ApiError;
