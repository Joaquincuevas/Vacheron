/**
 * Registro del service worker. Solo en producción: en dev el SW cachearía los
 * módulos y pelearía con el HMR de Vite. El archivo vive en public/sw.js y lo
 * reescribe scripts/build-sw.mjs con la lista de precache.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Sin SW la app sigue funcionando online; solo pierde el arranque offline.
      console.warn('No se pudo registrar el service worker', err);
    });
  });
}
