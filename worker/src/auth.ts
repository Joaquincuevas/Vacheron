import { createMiddleware } from 'hono/factory';
import { AppError } from './errors';
import type { Env } from './env';

export const APP_TOKEN_HEADER = 'X-App-Token';

/**
 * Compara en tiempo constante: siempre recorre la misma cantidad de posiciones
 * y no corta al primer byte distinto, para no filtrar el token por timing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Token compartido para que el endpoint no quede abierto a cualquiera que
 * descubra la URL.
 *
 * OJO: en una PWA sin login este token viaja en el bundle del cliente — es una
 * barrera contra escrituras al azar, no autenticación. Ver la nota de seguridad
 * en el README.
 */
export const requireAppToken = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const expected = c.env.APP_TOKEN;
  if (!expected) {
    throw new AppError('internal', 'APP_TOKEN no está configurado en el Worker');
  }

  const provided = c.req.header(APP_TOKEN_HEADER) ?? '';
  if (!timingSafeEqual(provided, expected)) {
    throw new AppError('unauthorized', 'Token de aplicación inválido o ausente');
  }

  await next();
});
