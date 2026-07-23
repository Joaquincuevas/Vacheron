import type { Category } from './categories';

const STORAGE_KEY = 'qe:freq:v1';

export interface Usage {
  count: number;
  lastUsed: number;
}

export type UsageMap = Record<string, Usage>;

/**
 * localStorage tira excepción en modo privado y cuando el usuario bloquea el
 * almacenamiento. El orden de las categorías no vale una pantalla rota: si
 * falla, se sigue con lo que haya en memoria.
 */
let memoryFallback: UsageMap = {};

export function readUsage(): UsageMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...memoryFallback };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { ...memoryFallback };
    return parsed as UsageMap;
  } catch {
    return { ...memoryFallback };
  }
}

function writeUsage(usage: UsageMap): void {
  memoryFallback = usage;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    /* sin persistencia: el orden dura lo que dure la sesión */
  }
}

export function recordUse(categoryId: string, now: number = Date.now()): UsageMap {
  const usage = readUsage();
  const previous = usage[categoryId];
  usage[categoryId] = { count: (previous?.count ?? 0) + 1, lastUsed: now };
  writeUsage(usage);
  return usage;
}

/**
 * Más usadas primero; a igual uso, la más reciente. El desempate final es el
 * orden del catálogo, que en una instalación nueva es más útil que el
 * alfabético.
 */
export function sortByFrequency(categories: Category[], usage: UsageMap): Category[] {
  return categories
    .map((category, index) => ({ category, index }))
    .sort((a, b) => {
      const ua = usage[a.category.id];
      const ub = usage[b.category.id];
      const byCount = (ub?.count ?? 0) - (ua?.count ?? 0);
      if (byCount !== 0) return byCount;
      const byRecency = (ub?.lastUsed ?? 0) - (ua?.lastUsed ?? 0);
      if (byRecency !== 0) return byRecency;
      return a.index - b.index;
    })
    .map((entry) => entry.category);
}
