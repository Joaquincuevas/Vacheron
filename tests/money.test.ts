import { describe, it, expect } from 'vitest';
import { formatAmount, formatCLP, appendDigit, removeDigit, MAX_AMOUNT } from '../web/src/lib/money';

describe('formato CLP', () => {
  it('agrupa los miles con punto y sin decimales', () => {
    expect(formatAmount(8500)).toBe('8.500');
    expect(formatAmount(1234567)).toBe('1.234.567');
    expect(formatAmount(0)).toBe('0');
  });

  it('formatCLP antepone el símbolo', () => {
    expect(formatCLP(8500)).toBe('$8.500');
    expect(formatCLP(0)).toBe('$0');
  });
});

describe('appendDigit', () => {
  it('empuja dígitos por la derecha', () => {
    let n = 0;
    for (const d of [8, 5, 0, 0]) n = appendDigit(n, d);
    expect(n).toBe(8500);
  });

  it('ignora el dígito si se pasa del tope', () => {
    expect(appendDigit(MAX_AMOUNT, 9)).toBe(MAX_AMOUNT);
    expect(appendDigit(9_999_999, 9)).toBe(99_999_999);
    expect(appendDigit(99_999_999, 0)).toBe(99_999_999);
  });
});

describe('removeDigit', () => {
  it('borra el último dígito', () => {
    expect(removeDigit(8500)).toBe(850);
    expect(removeDigit(5)).toBe(0);
    expect(removeDigit(0)).toBe(0);
  });
});
