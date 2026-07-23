/**
 * Catálogo de categorías.
 *
 * `label` es literalmente el valor que se manda a Notion: tiene que existir como
 * opción del Select `Categoria` o la API responde validation_error. Si acá se
 * agrega una, hay que agregarla también en la base.
 *
 * Los tonos comparten luminancia y croma; solo cambia el matiz. Así el grid se
 * lee como un sistema y no como una bolsa de colores. `Otros` va casi neutro a
 * propósito: es la categoría sin identidad.
 */

export interface Category {
  /** Estable: es la clave del conteo en localStorage. Nunca cambiarlo. */
  id: string;
  /** Debe calzar exacto con la opción del Select en Notion. */
  label: string;
  /** Matiz OKLCH en grados. */
  hue: number;
  chroma?: number;
  icon: string;
}

const ICON_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

export const CATEGORIES: Category[] = [
  {
    id: 'comida',
    label: 'Comida',
    hue: 55,
    icon: '<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 11v10"/><path d="M17.5 3C16 4.6 15.4 7 15.4 9c0 1.6.8 2.6 2.1 2.6V21"/>',
  },
  {
    id: 'transporte',
    label: 'Transporte',
    hue: 245,
    icon: '<rect x="4" y="4" width="16" height="13" rx="2.5"/><path d="M4 11h16"/><path d="M7.5 20v-3M16.5 20v-3"/>',
  },
  {
    id: 'supermercado',
    label: 'Supermercado',
    hue: 155,
    icon: '<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 7.5H6.2"/><circle cx="9.5" cy="19.3" r="1.2"/><circle cx="17" cy="19.3" r="1.2"/>',
  },
  {
    id: 'cafe',
    label: 'Café',
    hue: 25,
    icon: '<path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z"/><path d="M16 9.5h1.4a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3v2M12 3v2"/>',
  },
  {
    id: 'salud',
    label: 'Salud',
    hue: 350,
    icon: '<path d="M12 20s-7-4.4-7-9.1A3.9 3.9 0 0 1 12 8.2a3.9 3.9 0 0 1 7 2.7C19 15.6 12 20 12 20Z"/>',
  },
  {
    id: 'hogar',
    label: 'Hogar',
    hue: 200,
    icon: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8"/><path d="M10 20v-5h4v5"/>',
  },
  {
    id: 'ocio',
    label: 'Ocio',
    hue: 300,
    icon: '<path d="M4 9V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6Z"/><path d="M13 5.5v2M13 11v2M13 16.5v2"/>',
  },
  {
    id: 'otros',
    label: 'Otros',
    hue: 85,
    chroma: 0.008,
    icon: '<circle cx="5.6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.4" cy="12" r="1.3"/>',
  },
];

/** Luminancia y croma fijos: las categorías se distinguen por matiz, no por saturación. */
export function toneOf(category: Category): string {
  return `oklch(0.755 ${category.chroma ?? 0.062} ${category.hue})`;
}

export function iconSvg(category: Category): string {
  return `<svg ${ICON_ATTRS} width="26" height="26" aria-hidden="true">${category.icon}</svg>`;
}

export function categoryByLabel(label: string): Category | undefined {
  return CATEGORIES.find((c) => c.label === label);
}
