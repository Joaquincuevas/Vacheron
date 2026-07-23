import './styles/app.css';
import { getState, setState, subscribe } from './state';

/** Query obligatorio: si el shell no trae el nodo, es un bug de build, no un caso a manejar. */
export function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Falta el nodo #${id} en el shell`);
  return node as T;
}

const app = el('app');
const chipCategory = el<HTMLButtonElement>('chip-category');

// El atributo manda la transición entre vistas; el CSS hace el resto.
subscribe((state, previous) => {
  if (state.view !== previous.view || app.dataset['view'] !== state.view) {
    app.dataset['view'] = state.view;
  }
});

// Tocar el chip vuelve a elegir categoría sin perder lo tipeado.
chipCategory.addEventListener('click', () => {
  setState({ view: 'pick' });
});

export { getState, setState, subscribe };
