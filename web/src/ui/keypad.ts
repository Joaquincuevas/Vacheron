export interface KeypadHandlers {
  onDigit(digit: number): void;
  onBackspace(): void;
  /** Mantener presionado el borrar limpia todo. */
  onClear(): void;
  onConfirm(): void;
}

export interface Keypad {
  /** Habilita o deshabilita la confirmación según haya monto. */
  setConfirmEnabled(enabled: boolean): void;
}

const BACKSPACE_ICON =
  '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7Z"/><path d="M15.5 9.5 11 14M11 9.5l4.5 4.5"/></svg>';

const CONFIRM_ICON =
  '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11"/></svg>';

const HOLD_TO_CLEAR_MS = 450;

export function mountKeypad(container: HTMLElement, handlers: KeypadHandlers): Keypad {
  const keys: HTMLButtonElement[] = [];

  for (const digit of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    keys.push(digitKey(digit, handlers));
  }

  keys.push(backspaceKey(handlers));
  keys.push(digitKey(0, handlers));

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'key key--confirm pressable';
  confirm.innerHTML = CONFIRM_ICON;
  confirm.setAttribute('aria-label', 'Guardar gasto');
  confirm.disabled = true;
  confirm.addEventListener('click', () => handlers.onConfirm());
  keys.push(confirm);

  container.replaceChildren(...keys);

  return {
    setConfirmEnabled(enabled) {
      confirm.disabled = !enabled;
    },
  };
}

function digitKey(digit: number, handlers: KeypadHandlers): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'key pressable';
  button.textContent = String(digit);
  button.addEventListener('click', () => handlers.onDigit(digit));
  return button;
}

function backspaceKey(handlers: KeypadHandlers): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'key key--ghost pressable';
  button.innerHTML = BACKSPACE_ICON;
  button.setAttribute('aria-label', 'Borrar dígito');

  let holdTimer: number | undefined;
  let cleared = false;

  const startHold = (): void => {
    cleared = false;
    holdTimer = window.setTimeout(() => {
      cleared = true;
      handlers.onClear();
    }, HOLD_TO_CLEAR_MS);
  };

  const endHold = (): void => {
    if (holdTimer !== undefined) window.clearTimeout(holdTimer);
    holdTimer = undefined;
  };

  button.addEventListener('pointerdown', startHold);
  button.addEventListener('pointerup', endHold);
  button.addEventListener('pointercancel', endHold);
  button.addEventListener('pointerleave', endHold);

  // Si el hold ya limpió todo, el click que viene después no debe borrar de más.
  button.addEventListener('click', () => {
    if (cleared) {
      cleared = false;
      return;
    }
    handlers.onBackspace();
  });

  return button;
}
