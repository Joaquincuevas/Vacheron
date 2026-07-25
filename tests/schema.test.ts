import { describe, it, expect } from 'vitest';
import { expenseSchema, normalizeExpense, todayInSantiago, pageIdSchema } from '../worker/src/schema';

describe('expenseSchema', () => {
  it('acepta un gasto válido', () => {
    const result = expenseSchema.safeParse({ amount: 8500, category: 'Comida' });
    expect(result.success).toBe(true);
  });

  it('rechaza montos con decimales: el CLP es entero', () => {
    expect(expenseSchema.safeParse({ amount: 85.5, category: 'Comida' }).success).toBe(false);
  });

  it('rechaza monto cero o negativo', () => {
    expect(expenseSchema.safeParse({ amount: 0, category: 'Comida' }).success).toBe(false);
    expect(expenseSchema.safeParse({ amount: -100, category: 'Comida' }).success).toBe(false);
  });

  it('rechaza claves desconocidas', () => {
    expect(expenseSchema.safeParse({ amount: 100, category: 'Comida', hack: 1 }).success).toBe(false);
  });

  it('rechaza fechas imposibles', () => {
    expect(expenseSchema.safeParse({ amount: 100, category: 'Comida', date: '2026-02-31' }).success).toBe(
      false,
    );
    expect(expenseSchema.safeParse({ amount: 100, category: 'Comida', date: '23-07-2026' }).success).toBe(
      false,
    );
  });

  it('recorta espacios en categoría y nota', () => {
    const result = expenseSchema.safeParse({ amount: 100, category: '  Comida  ', note: '  hola  ' });
    expect(result.success && result.data.category).toBe('Comida');
    expect(result.success && result.data.note).toBe('hola');
  });
});

describe('normalizeExpense', () => {
  it('pone la fecha de hoy en Santiago cuando falta', () => {
    const parsed = expenseSchema.parse({ amount: 100, category: 'Comida' });
    const normalized = normalizeExpense(parsed);
    expect(normalized.date).toBe(todayInSantiago());
  });

  it('descarta una nota vacía tras el trim', () => {
    const parsed = expenseSchema.parse({ amount: 100, category: 'Comida', note: '   ' });
    expect(normalizeExpense(parsed).note).toBeUndefined();
  });

  it('respeta una fecha explícita', () => {
    const parsed = expenseSchema.parse({ amount: 100, category: 'Comida', date: '2026-01-15' });
    expect(normalizeExpense(parsed).date).toBe('2026-01-15');
  });
});

describe('todayInSantiago', () => {
  it('formatea como YYYY-MM-DD', () => {
    expect(todayInSantiago()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('un gasto de las 23:00 UTC ya es del día siguiente en Santiago... no', () => {
    // 2026-07-23 02:00 UTC = 2026-07-22 22:00 en Santiago (UTC-4): sigue siendo el 22.
    const d = new Date('2026-07-23T02:00:00Z');
    expect(todayInSantiago(d)).toBe('2026-07-22');
  });
});

describe('pageIdSchema', () => {
  it('acepta UUID con y sin guiones', () => {
    expect(pageIdSchema.safeParse('2f1a4b6c8d9e40a1b2c3d4e5f6a7b8c9').success).toBe(true);
    expect(pageIdSchema.safeParse('2f1a4b6c-8d9e-40a1-b2c3-d4e5f6a7b8c9').success).toBe(true);
  });

  it('rechaza basura', () => {
    expect(pageIdSchema.safeParse('no-es-uuid').success).toBe(false);
    expect(pageIdSchema.safeParse('../pages/evil').success).toBe(false);
  });
});
