import { z } from 'zod';

/**
 * Todo se registra en hora de Chile. Un gasto a las 21:00 en Santiago ya es del
 * día siguiente en UTC: usar la fecha del servidor lo dejaría mal fechado.
 */
export const TIMEZONE = 'America/Santiago';

/** Fecha de hoy en Santiago como `YYYY-MM-DD` (el locale `en-CA` da ese formato). */
export function todayInSantiago(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export const expenseSchema = z.strictObject({
  amount: z
    .number()
    .int('El monto debe ser entero: el peso chileno no usa decimales')
    .positive('El monto debe ser mayor que cero')
    .max(99_999_999, 'Monto fuera de rango'),
  category: z.string().trim().min(1, 'Falta la categoría').max(64, 'Categoría demasiado larga'),
  note: z.string().trim().max(200, 'La nota supera los 200 caracteres').optional(),
  // `z.iso.date` valida el calendario de verdad: 2026-02-31 se rechaza.
  date: z.iso.date('Formato de fecha esperado: YYYY-MM-DD').optional(),
});

export type ExpenseParsed = z.infer<typeof expenseSchema>;

/** IDs de página de Notion: UUID con o sin guiones. */
export const pageIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'ID de página inválido');

/** Aplana un ZodError a una sola línea legible para el cliente. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

/** Una nota vacía tras el trim no aporta nada: se descarta. */
export function normalizeExpense(parsed: ExpenseParsed): Required<Pick<ExpenseParsed, 'amount' | 'category' | 'date'>> & { note?: string } {
  const note = parsed.note && parsed.note.length > 0 ? parsed.note : undefined;
  return {
    amount: parsed.amount,
    category: parsed.category,
    date: parsed.date ?? todayInSantiago(),
    ...(note ? { note } : {}),
  };
}
