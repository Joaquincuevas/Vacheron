import './styles/app.css';
import { getState, setState, subscribe } from './state';
import { mountCategoryGrid } from './ui/categories';
import { mountKeypad } from './ui/keypad';
import { toneOf, type Category } from './lib/categories';
import { recordUse } from './lib/frequency';
import { appendDigit, formatAmount, removeDigit } from './lib/money';

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

const keypad = mountKeypad(el('keypad'), {
  onDigit: (digit) => setState({ amount: appendDigit(getState().amount, digit) }),
  onBackspace: () => setState({ amount: removeDigit(getState().amount) }),
  onClear: () => setState({ amount: 0 }),
  onConfirm: () => submit(),
});

function pickCategory(category: Category): void {
  // El conteo se anota al elegir, no al guardar: así el orden también refleja
  // los gastos que quedaron en la cola offline, sin plomería extra.
  recordUse(category.id);
  chipLabel.textContent = category.label;
  chipCategory.style.setProperty('--chip-tone', toneOf(category));
  setState({ category: category.label, view: 'amount' });
}

function submit(): void {
  // El envío real entra en el commit siguiente.
  console.log('submit', getState());
}

subscribe((state, previous) => {
  if (state.view !== previous.view || app.dataset['view'] !== state.view) {
    app.dataset['view'] = state.view;
  }

  if (state.amount !== previous.amount || amountValue.textContent === '') {
    amountValue.textContent = formatAmount(state.amount);
    amountBox.dataset['empty'] = String(state.amount === 0);
    keypad.setConfirmEnabled(state.amount > 0);
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

  if (event.key >= '0' && event.key <= '9') {
    setState({ amount: appendDigit(getState().amount, Number(event.key)) });
  } else if (event.key === 'Backspace') {
    setState({ amount: removeDigit(getState().amount) });
  } else if (event.key === 'Enter') {
    if (getState().amount > 0) submit();
  } else if (event.key === 'Escape') {
    setState({ view: 'pick' });
  }
});

export { getState, setState, subscribe, grid };
