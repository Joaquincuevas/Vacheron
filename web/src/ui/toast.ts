/**
 * Aviso breve para lo que sí necesita palabras: un error que no se pudo
 * encolar ni reintentar. El camino feliz usa el tilde efímero, no esto.
 */
export interface Toast {
  show(message: string): void;
  hide(): void;
}

const AUTO_HIDE_MS = 4200;

export function mountToast(host: HTMLElement): Toast {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.hidden = true;
  host.append(toast);

  let hideTimer: number | undefined;

  function hide(): void {
    toast.classList.remove('is-on');
    if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }

  return {
    show(message) {
      toast.textContent = message;
      toast.hidden = false;
      // Reinicia la animación aunque ya hubiera un aviso arriba.
      toast.classList.remove('is-on');
      void toast.offsetWidth;
      toast.classList.add('is-on');

      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hide, AUTO_HIDE_MS);
    },
    hide,
  };
}
