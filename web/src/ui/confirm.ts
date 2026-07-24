import { formatCLP } from '../lib/money';

export type ConfirmKind = 'saved' | 'queued';

/**
 * Un tilde efímero que confirma sin cortar el ritmo. `saved` = llegó a Notion;
 * `queued` = quedó en la cola offline, distinto matiz para que el usuario sepa
 * que salió pero todavía no aterriza.
 */
export function mountConfirmation(host: HTMLElement) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="confirm__mark" aria-hidden="true">
      <svg viewBox="0 0 52 52" width="72" height="72" fill="none" stroke="currentColor"
           stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path class="confirm__tick" d="M14 27l8 8 16-18"/>
      </svg>
    </div>
    <p class="confirm__amount"></p>
    <p class="confirm__note"></p>
  `;
  host.append(overlay);

  const amountEl = overlay.querySelector<HTMLElement>('.confirm__amount')!;
  const noteEl = overlay.querySelector<HTMLElement>('.confirm__note')!;

  let hideTimer: number | undefined;

  return {
    /** Muestra la marca ~900ms y resuelve al terminar, para reset ordenado. */
    flash(kind: ConfirmKind, amount: number): Promise<void> {
      overlay.dataset['kind'] = kind;
      amountEl.textContent = formatCLP(amount);
      noteEl.textContent = kind === 'saved' ? 'Registrado' : 'Guardado — se enviará solo';

      // Reinicia la animación aunque haya un flash en curso.
      overlay.classList.remove('is-on');
      void overlay.offsetWidth;
      overlay.classList.add('is-on');

      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      return new Promise((resolve) => {
        hideTimer = window.setTimeout(() => {
          overlay.classList.remove('is-on');
          resolve();
        }, 900);
      });
    },
  };
}

export type Confirmation = ReturnType<typeof mountConfirmation>;
