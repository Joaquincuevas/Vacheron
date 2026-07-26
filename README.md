# Gasto — registro ultrarrápido a Notion

[![CI](https://github.com/Joaquincuevas/Vacheron/actions/workflows/ci.yml/badge.svg)](https://github.com/Joaquincuevas/Vacheron/actions/workflows/ci.yml)

PWA para anotar un gasto en menos de 3 segundos desde la pantalla de inicio del
iPhone: abrir → tocar categoría → tipear monto → listo. Sin scroll, sin login.
Escribe directo a una base de datos de Notion a través de un Cloudflare Worker.

- **Front**: Vite + TypeScript vanilla (sin framework). Bundle mínimo, arranque
  instantáneo, offline-first.
- **API**: Cloudflare Worker (Hono) como proxy hacia Notion.
- **Deploy**: Cloudflare Pages (front) + Workers (API).

```
┌──────────────┐   POST /api/expense    ┌───────────────┐   POST /v1/pages    ┌────────┐
│  PWA (Pages) │ ─── X-App-Token ─────▶ │ Worker (Hono) │ ── Bearer token ──▶ │ Notion │
└──────────────┘                        └───────────────┘  Notion-Version     └────────┘
      │  sin red → cola en IndexedDB, reintenta al volver la señal
```

> **Por qué el Worker.** La API de Notion no envía cabeceras CORS: el navegador
> no puede llamarla directo. Todo pasa por el Worker, que además es el único
> lugar donde vive el token de Notion.

---

## 1. Crear la base en Notion

La base necesita **exactamente** estas propiedades. Los nombres son sensibles a
mayúsculas y acentos — `Categoria` va **sin tilde**. Si no calzan, Notion
responde `validation_error`.

| Propiedad   | Tipo   | Notas                                             |
|-------------|--------|---------------------------------------------------|
| `Gasto`     | Title  | Título de la fila (la nota, o el nombre de la categoría) |
| `Monto`     | Number | Entero en CLP, sin decimales                      |
| `Categoria` | Select | Debe contener las 8 opciones de abajo             |
| `Fecha`     | Date   | `YYYY-MM-DD`                                       |

Opciones del Select **`Categoria`** (crealas tal cual, con tilde donde va):

```
Comida   Transporte   Supermercado   Café   Salud   Hogar   Ocio   Otros
```

> Si Notion no reconoce una opción del Select al crear la página, la escritura
> falla. Para agregar o renombrar categorías, editá `web/src/lib/categories.ts`
> **y** el Select en Notion, manteniéndolos idénticos.

## 2. Crear la integración y conectarla

1. https://www.notion.so/my-integrations → **New integration** (tipo *Internal*).
2. Copiá el **Internal Integration Secret** (empieza con `ntn_`). Es tu
   `NOTION_TOKEN`.
3. Abrí la base en Notion → menú `⋯` (arriba a la derecha) → **Connections** /
   **Conexiones** → conectá tu integración. Sin este paso el token da `401`
   aunque sea válido.

## 3. Obtener el `data_source_id`

Con la API `2025-09-03`, el `parent` de una página es el **origen de datos**, no
la base. Son IDs distintos; usar el de la base tira `validation_error`.

1. Abrí la base **como página completa** (no como vista embebida).
2. Menú `⋯` → **Configuración** / **Settings**.
3. **Administrar orígenes de datos** / **Manage data sources**.
4. En el origen, menú `⋯` → **Copiar ID** / **Copy data source ID**.

Ese valor es `NOTION_DATA_SOURCE_ID`.

---

## 4. Desarrollo local

Requiere Node 20+.

```bash
npm install
```

**Secretos del Worker** — copiá el ejemplo y completá:

```bash
cp .dev.vars.example .dev.vars
```

```ini
# .dev.vars
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATA_SOURCE_ID=00000000-0000-0000-0000-000000000000
APP_TOKEN=<generá uno: openssl rand -hex 32>
ALLOWED_ORIGIN=http://localhost:5173
```

**Variables del front** — copiá el ejemplo y usá el mismo `APP_TOKEN`:

```bash
cp .env.example .env
```

```ini
# .env
VITE_API_BASE=            # vacío en dev: Vite proxea /api al Worker
VITE_APP_TOKEN=<el mismo APP_TOKEN del Worker>
```

Levantá los dos procesos en terminales separadas:

```bash
npm run dev:api      # Worker en http://127.0.0.1:8787
```

```bash
npm run dev          # Front en http://localhost:5173 (proxea /api al Worker)
```

Registrá un gasto y confirmá que aparece la fila en tu base de Notion.

### Comandos

| Comando            | Qué hace                                             |
|--------------------|------------------------------------------------------|
| `npm run dev`      | Front con HMR (proxy `/api` → `:8787`)               |
| `npm run dev:api`  | Worker local (`wrangler dev`, lee `.dev.vars`)       |
| `npm run build`    | Build del front a `dist/` + inyección del SW         |
| `npm test`         | Tests (Vitest)                                       |
| `npm run typecheck`| TS del front, del Worker y de los tests              |

---

## 5. Deploy

Front y API se despliegan por separado y se conectan por URL + CORS.

### 5.1 Worker (API)

```bash
# Secretos en producción (NO usan .dev.vars):
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put NOTION_DATA_SOURCE_ID
npx wrangler secret put APP_TOKEN

npm run deploy:api
```

Anotá la URL resultante (ej. `https://vacheron-api.<subdominio>.workers.dev`).

`ALLOWED_ORIGIN` es una var pública en `wrangler.toml`: apuntala a la URL final
del front (paso 5.2). Acepta varios orígenes separados por coma.

### 5.2 Front (Pages)

En Cloudflare Pages, conectá el repo con:

- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Variables de entorno** (build):
  - `VITE_API_BASE` = URL del Worker del paso 5.1
  - `VITE_APP_TOKEN` = el mismo `APP_TOKEN` que pusiste como secret del Worker

Tras el primer deploy, poné la URL de Pages (ej. `https://gasto.pages.dev`) en
`ALLOWED_ORIGIN` del `wrangler.toml` y volvé a correr `npm run deploy:api`.

### 5.3 Instalar en el iPhone

Abrí la URL de Pages en Safari → Compartir → **Agregar a pantalla de inicio**.
Se abre en pantalla completa, con ícono propio, y funciona sin red.

---

## 6. Decisiones con trade-off

1. **El `X-App-Token` viaja en el bundle del cliente.** Una PWA sin login no
   tiene dónde esconder un secreto: cualquiera con devtools lo lee. Cumple lo
   pedido —que el endpoint no quede abierto a escrituras al azar— pero es una
   barrera, no autenticación. Se refuerza con CORS restringido por
   `ALLOWED_ORIGIN`. Para auth de verdad: Cloudflare Access o un login mínimo.

2. **Background Sync no existe en iOS Safari** (el target). Se implementa como
   mejora progresiva para Android/Chrome, pero el mecanismo que realmente corre
   en el iPhone es el **flush en primer plano**: la cola se vacía al recuperar
   red, al volver a la app y al abrirla.

3. **Sin deduplicación server-side.** Un reintento tras un timeout podría
   duplicar un gasto. Deduplicar de verdad exigiría una propiedad extra en Notion
   y un query antes de cada escritura —una request más por gasto, en contra del
   objetivo de 3 s—. Se mitiga en el cliente con un *lease* atómico y borrando de
   la cola solo tras confirmación 2xx.

4. **Fecha en `America/Santiago`, no UTC.** Un gasto a las 21:00 en Chile ya es
   del día siguiente en UTC; fecharlo en UTC lo dejaría mal.

5. **Service worker a mano, sin Workbox**, y **sin fuente web** (stack del
   sistema): menos peso, arranque instantáneo, y en iOS se siente nativo.

6. **El historial vive en localStorage.** Es una vista de conveniencia del día;
   la fuente de verdad es Notion. El swipe-to-undo de un gasto ya sincronizado
   lo **archiva** en Notion (`in_trash`), no lo borra para siempre. Un gasto
   encolado que Notion rechaza en definitiva queda visible como "no se pudo
   enviar" (no se pierde en silencio) y se descarta con swipe.

---

## 7. Estructura

```
shared/types.ts     Contrato cliente ↔ worker
worker/src/         Hono + Zod + cliente Notion + retry + auth
web/src/            App vanilla: estado, UI, cola offline, PWA
web/public/         manifest, service worker, íconos
tests/              Vitest: notion, retry, schema, cola, formato
```

## 8. Tests

```bash
npm test
```

Cubren el cliente de Notion (fetch mockeado: versión, `data_source_id`, forma
del payload, traducción de errores, reintento ante 429) y la cola offline
(`fake-indexeddb`: encolado, orden, y el lease que evita el doble envío), además
de retry, validación Zod y formato CLP.
