import { listToday, type HistoryEntry } from '../lib/history';
import { categoryByLabel, toneOf } from '../lib/categories';
import { formatCLP } from '../lib/money';

export interface HistoryView {
  refresh(): void;
}

/** Distancia mínima del swipe para que cuente como "deshacer". */
const UNDO_THRESHOLD = 96;

export function mountHistory(
  container: HTMLElement,
  onUndo: (entry: HistoryEntry) => void,
): HistoryView {
  function render(): void {
    const entries = listToday();

    if (entries.length === 0) {
      container.replaceChildren();
      return;
    }

    const header = document.createElement('p');
    header.className = 'history__title';
    header.textContent = 'Hoy';

    const list = document.createElement('ul');
    list.className = 'history__list';
    list.append(...entries.map((entry) => renderRow(entry, onUndo, render)));

    container.replaceChildren(header, list);
  }

  render();
  return { refresh: render };
}

function renderRow(
  entry: HistoryEntry,
  onUndo: (entry: HistoryEntry) => void,
  rerender: () => void,
): HTMLLIElement {
  const category = categoryByLabel(entry.category);

  const row = document.createElement('li');
  row.className = 'hrow';

  const action = document.createElement('div');
  action.className = 'hrow__action';
  // Un gasto fallido no está en Notion: no hay nada que "deshacer", se descarta.
  action.textContent = entry.status === 'failed' ? 'Descartar' : 'Deshacer';

  const surface = document.createElement('div');
  surface.className = 'hrow__surface';
  surface.dataset['status'] = entry.status;
  surface.style.setProperty('--row-tone', category ? toneOf(category) : 'var(--text-faint)');
  surface.innerHTML = `
    <span class="hrow__dot"></span>
    <span class="hrow__text">
      <span class="hrow__label">${escapeHtml(entry.note || entry.category)}</span>
      <span class="hrow__cat">${escapeHtml(entry.category)}${statusSuffix(entry.status)}</span>
    </span>
    <span class="hrow__amount">${formatCLP(entry.amount)}</span>
  `;

  row.append(action, surface);
  attachSwipe(surface, () => commitUndo(row, surface, entry, onUndo, rerender));
  return row;
}

/** Sufijo de estado en la línea de categoría. Lo sincronizado no lleva nada. */
function statusSuffix(status: HistoryEntry['status']): string {
  if (status === 'pending') return ' · pendiente';
  if (status === 'failed') return ' · no se pudo enviar';
  return '';
}

/** Anima la fila hacia afuera y dispara el deshacer. */
function commitUndo(
  row: HTMLElement,
  surface: HTMLElement,
  entry: HistoryEntry,
  onUndo: (entry: HistoryEntry) => void,
  rerender: () => void,
): void {
  surface.style.transition = 'transform 180ms ease-out';
  surface.style.transform = `translateX(-100%)`;
  row.style.maxHeight = `${row.offsetHeight}px`;
  requestAnimationFrame(() => {
    row.style.transition = 'max-height 200ms ease-out, opacity 160ms ease-out';
    row.style.maxHeight = '0';
    row.style.opacity = '0';
  });
  onUndo(entry);
  // Re-render tras la animación reconcilia total e indicadores.
  window.setTimeout(rerender, 220);
}

/**
 * Swipe horizontal para deshacer. Solo cuenta el arrastre hacia la izquierda; si
 * el gesto es más vertical, se deja pasar para no pelear con el scroll.
 */
function attachSwipe(surface: HTMLElement, onCommit: () => void): void {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;
  let decided = false;

  surface.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dragging = true;
    decided = false;
    surface.style.transition = 'none';
  });

  surface.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const totalX = e.clientX - startX;
    const totalY = e.clientY - startY;

    // Decidir eje una sola vez: si es vertical, soltar el gesto al scroll.
    if (!decided && (Math.abs(totalX) > 8 || Math.abs(totalY) > 8)) {
      decided = true;
      if (Math.abs(totalY) > Math.abs(totalX)) {
        dragging = false;
        return;
      }
      surface.setPointerCapture(e.pointerId);
    }

    if (!decided) return;
    dx = Math.min(0, totalX); // solo hacia la izquierda
    surface.style.transform = `translateX(${dx}px)`;
    surface.parentElement?.classList.toggle('is-armed', Math.abs(dx) >= UNDO_THRESHOLD);
  });

  const end = (): void => {
    if (!dragging) {
      surface.style.transition = 'transform 160ms ease-out';
      surface.style.transform = '';
      surface.parentElement?.classList.remove('is-armed');
      return;
    }
    dragging = false;
    surface.style.transition = 'transform 160ms ease-out';

    if (Math.abs(dx) >= UNDO_THRESHOLD) {
      onCommit();
    } else {
      surface.style.transform = '';
      surface.parentElement?.classList.remove('is-armed');
    }
  };

  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
