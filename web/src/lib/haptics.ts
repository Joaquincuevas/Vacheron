/**
 * Safari en iOS no implementa navigator.vibrate, así que en el iPhone esto no
 * hace nada. Se deja igual porque en Android sí responde y el costo es cero.
 */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* algunos navegadores lo exponen y lo bloquean por política */
  }
}

export const HAPTIC_SAVED = 18;
export const HAPTIC_QUEUED = [12, 60, 12];
export const HAPTIC_ERROR = [40, 70, 40];
