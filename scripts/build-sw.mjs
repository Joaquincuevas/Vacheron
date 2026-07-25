/*
 * Post-build: inyecta en el service worker la lista real de assets a precachear
 * y una versión de cache derivada de su contenido. Vite copia sw.js tal cual
 * desde public/; este script lo reescribe en dist/ con los nombres hasheados.
 *
 * Correr después de `vite build`. Ver el script "build" en package.json.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

/** Rutas absolutas de todo lo que hay en dist/, recursivo. */
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
    }),
  );
  return files.flat();
}

const all = await walk(DIST);

// El shell: lo mínimo para abrir sin red. Los íconos no bloquean el arranque,
// así que quedan fuera del precache (los toma el runtime cache al usarse).
const precache = new Set(['/', '/index.html']);
for (const file of all) {
  const url = '/' + relative(DIST, file).split(/[\\/]/).join('/');
  if (/\/assets\/.+\.(js|css)$/.test(url)) precache.add(url);
  if (url === '/manifest.webmanifest') precache.add(url);
}

// Versión = hash del contenido precacheado. Cambia solo si cambió el shell, y
// al cambiar dispara la limpieza de caches viejos en el evento activate.
const hash = createHash('sha256');
for (const url of [...precache].sort()) {
  if (url === '/') continue;
  try {
    hash.update(await readFile(join(DIST, url.slice(1))));
  } catch {
    /* '/index.html' cubre '/'; rutas virtuales no existen en disco */
  }
}
const version = hash.digest('hex').slice(0, 12);

const swPath = join(DIST, 'sw.js');
await stat(swPath); // falla ruidosamente si Vite no copió el sw
let sw = await readFile(swPath, 'utf8');
sw = sw
  .replace('self.__PRECACHE__', JSON.stringify([...precache].sort()))
  .replace('self.__SW_VERSION__', JSON.stringify(version));
await writeFile(swPath, sw);

console.log(`sw.js listo — versión ${version}, ${precache.size} assets en el shell`);
