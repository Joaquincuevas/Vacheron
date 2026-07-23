/**
 * El peso chileno no tiene decimales, así que el monto es siempre un entero y
 * el teclado trabaja empujando dígitos por la derecha. No hay punto decimal
 * porque no hay nada que separar.
 */

export const MAX_AMOUNT = 99_999_999;

const groupFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

/** `8500` → `"8.500"`. Sin símbolo: el `$` se maquetea aparte para poder atenuarlo. */
export function formatAmount(amount: number): string {
  return groupFormatter.format(Math.trunc(amount));
}

/** `8500` → `"$8.500"`. Para totales e historial. */
export function formatCLP(amount: number): string {
  return `$${formatAmount(amount)}`;
}

/** Ignora el dígito si se pasa del tope, en vez de truncar en silencio. */
export function appendDigit(current: number, digit: number): number {
  const next = current * 10 + digit;
  return next > MAX_AMOUNT ? current : next;
}

export function removeDigit(current: number): number {
  return Math.floor(current / 10);
}
