import './styles/app.css';
import { getState, resetEntry, setState, subscribe } from './state';
import { mountCategoryGrid } from './ui/categories';
import { mountKeypad } from './ui/keypad';
import { mountNote } from './ui/note';
import { mountConfirmation } from './ui/confirm';
import { toneOf, type Category } from './lib/categories';
import { recordUse } from './lib/frequency';
import { appendDigit, formatAmount, removeDigit } from './lib/money';
import { createExpense, ApiError } from './lib/api';
import { vibrate, HAPTIC_SAVED, HAPTIC_QUEUED, HAPTIC_ERROR } from './lib/haptics';
import { registerServiceWorker } from './lib/pwa';
import type { ExpenseInput } from '../../shared/types';

/** Query obligatorio: si el shell no trae el nodo, es un bug de build, no un caso a manejar. */
export function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Falta el nodo #${id} en el shell`);
  return node as T;
}

const app = el('app');
const chipCategory = el<HTMLButtonElement>('chip-category');
const chipLabel = el('chip-label');
const amountBox = el('amount');
const amountValue = el('amount-value');

const grid = mountCategoryGrid(el('category-grid'), pickCategory);
const confirmation = mountConfirmation(el('overlay'));
const note = mountNote(el('note'), (value) => setState({ note: value }));

const keypad = mountKeypad(el('keypad'), {
  onDigit: (digit) => setState({ amount: appendDigit(getState().amount, digit) }),
  onBackspace: () => setState({ amount: removeDigit(getState().amount) }),
  onClear: () => setState({ amount: 0 }),
  onConfirm: () => void submit(),
});

function pickCategory(category: Category): void {
  // El conteo se anota al elegir, no al guardar: así el orden también refleja
  // los gastos que quedaron en la cola offline, sin plomería extra.
  recordUse(category.id);
  chipLabel.textContent = category.label;
  chipCategory.style.setProperty('--chip-tone', toneOf(category));
  setState({ category: category.label, view: 'amount' });
}

/** Reintentar el mismo gasto por doble toque duplica la fila. Un envío a la vez. */
let sending = false;

async function submit(): Promise<void> {
  const { category, amount, note, status } = getState();
  if (sending || status === 'sending' || !category || amount <= 0) return;

  const input: ExpenseInput = { amount, category, ...(note.trim() ? { note: note.trim() } : {}) };

  sending = true;
  setState({ status: 'sending', error: null });

  try {
    await createExpense(input);
    await finish('saved', amount, HAPTIC_SAVED);
  } catch (err) {
    // La cola offline entra en el commit 12. Hasta entonces, una falla de red
    // recuperable se trata como "quedó pendiente"; el resto es error visible.
    if (err instanceof ApiError && err.retryable) {
      await finish('queued', amount, HAPTIC_QUEUED);
    } else {
      const message = err instanceof ApiError ? err.message : 'No se pudo guardar';
      vibrate(HAPTIC_ERROR);
      setState({ status: 'error', error: message });
    }
  } finally {
    sending = false;
  }
}

/** Confirma, refresca el orden del grid y vuelve al inicio para el siguiente. */
async function finish(kind: 'saved' | 'queued', amount: number, haptic: number | number[]): Promise<void> {
  setState({ status: kind });
  vibrate(haptic);
  await confirmation.flash(kind, amount);
  note.reset();
  grid.refresh();
  resetEntry();
}

subscribe((state, previous) => {
  if (state.view !== previous.view || app.dataset['view'] !== state.view) {
    app.dataset['view'] = state.view;
  }

  if (state.amount !== previous.amount || amountValue.textContent === '') {
    amountValue.textContent = formatAmount(state.amount);
    amountBox.dataset['empty'] = String(state.amount === 0);
  }

  // La confirmación se deshabilita mientras se envía para no disparar dos veces.
  keypad.setConfirmEnabled(state.amount > 0 && state.status !== 'sending');
});

// Tocar el chip vuelve a elegir categoría sin perder lo tipeado.
chipCategory.addEventListener('click', () => {
  setState({ view: 'pick' });
});

// Teclado físico: no es el caso de uso, pero hace la app usable en escritorio
// y hace posible probarla sin tocar la pantalla.
window.addEventListener('keydown', (event) => {
  if (getState().view !== 'amount') return;
  // Con la nota enfocada, el teclado físico escribe en la nota, no en el monto.
  if (event.target instanceof HTMLInputElement) return;

  if (event.key >= '0' && event.key <= '9') {
    setState({ amount: appendDigit(getState().amount, Number(event.key)) });
  } else if (event.key === 'Backspace') {
    setState({ amount: removeDigit(getState().amount) });
  } else if (event.key === 'Enter') {
    void submit();
  } else if (event.key === 'Escape') {
    setState({ view: 'pick' });
  }
});

registerServiceWorker();

export { getState, setState, subscribe, grid };
