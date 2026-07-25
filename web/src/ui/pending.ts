import { countQueue } from '../lib/queue';

/**
 * Indicador de gastos en cola. Vive en la barra superior y solo aparece cuando
 * hay pendientes — con señal buena, la cola está vacía y no se ve nada.
 */
export interface PendingIndicator {
  refresh(): Promise<void>;
}

export function mountPendingIndicator(container: HTMLElement): PendingIndicator {
  const badge = document.createElement('span');
  badge.className = 'pending';
  badge.hidden = true;
  badge.innerHTML = `<span class="pending__dot"></span><span class="pending__count"></span>`;
  container.append(badge);

  const countEl = badge.querySelector<HTMLElement>('.pending__count')!;

  async function refresh(): Promise<void> {
    let count = 0;
    try {
      count = await countQueue();
    } catch {
      count = 0; // sin IndexedDB el indicador simplemente no se muestra
    }
    badge.hidden = count === 0;
    countEl.textContent = count === 1 ? '1 pendiente' : `${count} pendientes`;
  }

  void refresh();
  return { refresh };
}
