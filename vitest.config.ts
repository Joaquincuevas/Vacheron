import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node alcanza para todo: la lógica del Worker usa fetch/Response/Headers
    // globales y la cola usa IndexedDB, que fake-indexeddb polirellena en setup.
    // La UI se verifica en un navegador real, no en jsdom.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
