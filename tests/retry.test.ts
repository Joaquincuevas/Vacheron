import { describe, it, expect, vi } from 'vitest';
import { withRetry, retryDelayMs, isRetryableStatus } from '../worker/src/retry';
import { AppError } from '../worker/src/errors';

const ok = () => new Response('{}', { status: 200 });
const status = (code: number, headers?: Record<string, string>) =>
  new Response('{}', { status: code, headers });

describe('isRetryableStatus', () => {
  it('reintenta 429, 409 y 5xx; no reintenta 4xx comunes', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(409)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('respeta Retry-After por sobre el backoff', () => {
    const delay = retryDelayMs(0, '2', { baseDelayMs: 300, maxDelayMs: 10_000 });
    expect(delay).toBe(2000);
  });

  it('crece de forma exponencial sin Retry-After', () => {
    const opts = { baseDelayMs: 100, maxDelayMs: 100_000, random: () => 0 };
    expect(retryDelayMs(0, null, opts)).toBe(100);
    expect(retryDelayMs(1, null, opts)).toBe(200);
    expect(retryDelayMs(2, null, opts)).toBe(400);
  });

  it('nunca supera maxDelayMs', () => {
    expect(retryDelayMs(10, null, { baseDelayMs: 300, maxDelayMs: 4000, random: () => 1 })).toBeLessThanOrEqual(
      4000,
    );
    expect(retryDelayMs(0, '999', { baseDelayMs: 300, maxDelayMs: 4000 })).toBe(4000);
  });
});

describe('withRetry', () => {
  const noSleep = { sleep: () => Promise.resolve(), baseDelayMs: 0, maxDelayMs: 0 };

  it('devuelve de inmediato ante un 2xx', async () => {
    const perform = vi.fn(async () => ok());
    const res = await withRetry(perform, noSleep);
    expect(res.status).toBe(200);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('reintenta ante 429 hasta el tope de intentos', async () => {
    const perform = vi.fn(async () => status(429));
    const res = await withRetry(perform, { ...noSleep, attempts: 4 });
    expect(res.status).toBe(429);
    expect(perform).toHaveBeenCalledTimes(4);
  });

  it('no reintenta ante un 400', async () => {
    const perform = vi.fn(async () => status(400));
    const res = await withRetry(perform, { ...noSleep, attempts: 4 });
    expect(res.status).toBe(400);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('convierte una falla de red persistente en upstream_unavailable', async () => {
    const perform = vi.fn(async () => {
      throw new TypeError('network down');
    });
    const error = await withRetry(perform, { ...noSleep, attempts: 3 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('upstream_unavailable');
    expect(perform).toHaveBeenCalledTimes(3);
  });

  it('se recupera si un intento tardío tiene éxito', async () => {
    const seq = [status(500), status(429), ok()];
    let i = 0;
    const perform = vi.fn(async () => seq[i++]!);
    const res = await withRetry(perform, { ...noSleep, attempts: 4 });
    expect(res.status).toBe(200);
    expect(perform).toHaveBeenCalledTimes(3);
  });
});
