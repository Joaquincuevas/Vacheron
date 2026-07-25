import './styles/app.css';
import { getState, resetEntry, setState, subscribe } from './state';
import { mountCategoryGrid } from './ui/categories';
import { mountKeypad } from './ui/keypad';
import { mountNote } from './ui/note';
import { mountConfirmation } from './ui/confirm';
import { mountToast } from './ui/toast';
import { toneOf, type Category } from './lib/categories';
import { recordUse } from './lib/frequency';
import { appendDigit, formatAmount, removeDigit } from './lib/money';
import { createExpense, archiveExpense, ApiError } from './lib/api';
import { enqueue, removeFromQueue } from './lib/queue';
import {
  configureSync,
  flushQueue,
  requestBackgroundSync,
  startForegroundSync,
} from './lib/sync';
import { mountPendingIndicator } from './ui/pending';
import { mountHistory } from './ui/history';
import {
  addEntry,
  listToday,
  removeEntry,
  todayTotal,
  updateByQueueId,
  type HistoryEntry,
} from './lib/history';
import { todayInSantiago } from './lib/date';
import { formatCLP } from './lib/money';
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
const dayTotal = el('day-total');

const grid = mountCategoryGrid(el('category-grid'), pickCategory);
const confirmation = mountConfirmation(el('overlay'));
const toast = mountToast(el('app'));
const note = mountNote(el('note'), (value) => setState({ note: value }));
const pending = mountPendingIndicator(el('pending-slot'));
const history = mountHistory(el('history'), undoExpense);

/** Refresca lo que depende del historial: la lista del día y el total. */
function refreshDay(): void {
  history.refresh();
  dayTotal.textContent = formatCLP(todayTotal());
}

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

  const trimmed = note.trim();
  const input: ExpenseInput = { amount, category, ...(trimmed ? { note: trimmed } : {}) };
  const base: Omit<HistoryEntry, 'status'> = {
    id: crypto.randomUUID(),
    amount,
    category,
    date: todayInSantiago(),
    createdAt: Date.now(),
    ...(trimmed ? { note: trimmed } : {}),
  };

  sending = true;
  setState({ status: 'sending', error: null });

  try {
    const pageId = await createExpense(input);
    addEntry({ ...base, status: 'synced', pageId });
    await finish('saved', amount, HAPTIC_SAVED);
  } catch (err) {
    // Falla recuperable (red, 429, 5xx): a la cola. Se reintenta solo al volver
    // la señal — es el caso de uso central, la calle con mala cobertura.
    if (err instanceof ApiError && err.retryable) {
      await enqueueExpense(input, base);
    } else {
      const message = err instanceof ApiError ? err.message : 'No se pudo guardar';
      vibrate(HAPTIC_ERROR);
      setState({ status: 'error', error: message });
    }
  } finally {
    sending = false;
  }
}

async function enqueueExpense(input: ExpenseInput, base: Omit<HistoryEntry, 'status'>): Promise<void> {
  try {
    const item = await enqueue(input);
    // La entrada del historial queda ligada al item de la cola por queueId; al
    // sincronizarse se actualiza a 'synced' con su pageId.
    addEntry({ ...base, status: 'pending', queueId: item.id });
    await pending.refresh();
    void requestBackgroundSync();
    await finish('queued', base.amount, HAPTIC_QUEUED);
  } catch {
    // Sin IndexedDB (modo privado, cuota) no hay dónde guardar: error honesto.
    vibrate(HAPTIC_ERROR);
    setState({ status: 'error', error: 'No se pudo guardar el gasto' });
  }
}

/**
 * Deshacer desde el historial (swipe). Un gasto sincronizado se archiva en
 * Notion; uno pendiente se saca de la cola antes de que se envíe. En ambos casos
 * la entrada local se elimina de inmediato — el swipe ya confirmó la intención.
 */
function undoExpense(entry: HistoryEntry): void {
  removeEntry(entry.id);
  refreshDay();

  if (entry.status === 'pending' && entry.queueId) {
    void removeFromQueue(entry.queueId).then(() => pending.refresh());
    return;
  }
  if (entry.pageId) {
    // Si el archivado falla (sin red), la fila ya no está local pero sigue en
    // Notion. Es un caso de borde aceptable para un "deshacer" inmediato.
    void archiveExpense(entry.pageId).catch((err) => console.warn('No se pudo archivar', err));
  }
}

/** Confirma, refresca grid e historial, y vuelve al inicio para el siguiente. */
async function finish(kind: 'saved' | 'queued', amount: number, haptic: number | number[]): Promise<void> {
  setState({ status: kind });
  vibrate(haptic);
  await confirmation.flash(kind, amount);
  note.reset();
  grid.refresh();
  refreshDay();
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

  // El error definitivo necesita palabras; el resto de los estados no. El monto
  // queda intacto en pantalla, así que tocar confirmar de nuevo reintenta.
  if (state.status === 'error' && state.status !== previous.status && state.error) {
    toast.show(state.error);
  } else if (state.status !== 'error' && previous.status === 'error') {
    toast.hide();
  }
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

// La cola se vacía sola: al recuperar red, al volver a la app y al abrirla.
// Al sincronizar, la entrada pendiente pasa a 'synced' y gana su pageId (con eso
// se puede deshacer); un fallo definitivo la marca 'failed' y deja de contar.
configureSync({
  onSynced: (item, pageId) => {
    updateByQueueId(item.id, { status: 'synced', pageId, queueId: undefined });
    refreshDay();
  },
  onFailed: (item, error) => {
    updateByQueueId(item.id, { status: 'failed', lastError: error });
    refreshDay();
  },
  onChange: () => void pending.refresh(),
});
startForegroundSync();

// Pinta el día al abrir: gastos de hoy que sobrevivieron en localStorage.
refreshDay();

export { getState, setState, subscribe, grid, flushQueue, listToday };
