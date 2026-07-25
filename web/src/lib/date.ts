/**
 * "Hoy" en horario de Chile, del lado del cliente. El Worker fecha los gastos
 * en America/Santiago; el historial usa el mismo criterio para que "los gastos
 * de hoy" calcen con lo que se guardó, sin importar la zona del dispositivo.
 */
export const TIMEZONE = 'America/Santiago';

export function todayInSantiago(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
