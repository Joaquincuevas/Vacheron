/**
 * Store mínimo: un objeto y un set de suscriptores. No hace falta más — la app
 * tiene una pantalla y media, y cualquier framework acá sería peso muerto en el
 * arranque.
 */

export type View = 'pick' | 'amount';

/** `queued` = quedó en la cola offline; no es un error, es un estado válido. */
export type Status = 'idle' | 'sending' | 'saved' | 'queued' | 'error';

export interface AppState {
  view: View;
  category: string | null;
  /** Monto en pesos enteros. CLP no tiene decimales. */
  amount: number;
  note: string;
  noteOpen: boolean;
  status: Status;
  error: string | null;
}

const initialState: AppState = {
  view: 'pick',
  category: null,
  amount: 0,
  note: '',
  noteOpen: false,
  status: 'idle',
  error: null,
};

type Listener = (state: AppState, previous: AppState) => void;

let state: AppState = initialState;
const listeners = new Set<Listener>();

export function getState(): Readonly<AppState> {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  const previous = state;
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state, previous);
}

/** Llama al listener de inmediato con el estado actual. Devuelve el unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(state, state);
  return () => listeners.delete(listener);
}

/** Vuelve al punto de partida, listo para el gasto siguiente. */
export function resetEntry(): void {
  setState({
    view: 'pick',
    category: null,
    amount: 0,
    note: '',
    noteOpen: false,
    status: 'idle',
    error: null,
  });
}
