import { CATEGORIES, iconSvg, toneOf, type Category } from '../lib/categories';
import { readUsage, sortByFrequency } from '../lib/frequency';

export interface CategoryGrid {
  /** Reordena según el uso acumulado. Se llama al volver al estado inicial. */
  refresh(): void;
}

export function mountCategoryGrid(
  container: HTMLElement,
  onPick: (category: Category) => void,
): CategoryGrid {
  function render(): void {
    const ordered = sortByFrequency(CATEGORIES, readUsage());

    container.replaceChildren(
      ...ordered.map((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cat pressable';
        button.style.setProperty('--cat-tone', toneOf(category));
        button.dataset['category'] = category.id;
        button.innerHTML = `
          <span class="cat__icon">${iconSvg(category)}</span>
          <span class="cat__label">${category.label}</span>
        `;
        button.addEventListener('click', () => onPick(category));
        return button;
      }),
    );
  }

  render();
  return { refresh: render };
}
