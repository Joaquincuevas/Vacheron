/**
 * Nota opcional, colapsada por defecto: es un afiladero, no un paso del flujo.
 * Cerrada es apenas un botón "+ Nota"; solo al tocarlo aparece el campo, y
 * nunca se interpone entre el monto y la confirmación.
 */
export interface NoteField {
  /** Vuelve al estado colapsado y vacío. Se llama al resetear el gasto. */
  reset(): void;
}

export function mountNote(
  container: HTMLElement,
  onInput: (value: string) => void,
): NoteField {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'note__toggle pressable';
  toggle.textContent = '+ Nota';
  toggle.setAttribute('aria-expanded', 'false');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'note__input';
  input.placeholder = 'Nota (opcional)';
  input.maxLength = 200;
  input.enterKeyHint = 'done';
  input.hidden = true;
  // El teclado del sistema aparece solo para la nota; el monto usa el propio.
  input.autocomplete = 'off';
  input.autocapitalize = 'sentences';

  function open(): void {
    container.dataset['open'] = 'true';
    toggle.hidden = true;
    input.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function reset(): void {
    input.value = '';
    input.hidden = true;
    toggle.hidden = false;
    toggle.setAttribute('aria-expanded', 'false');
    delete container.dataset['open'];
    onInput('');
  }

  toggle.addEventListener('click', open);
  input.addEventListener('input', () => onInput(input.value));
  // Enter en la nota confirma la nota, no el gasto: solo cierra el teclado.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });

  container.replaceChildren(toggle, input);
  return { reset };
}
