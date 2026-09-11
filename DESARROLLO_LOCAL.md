# Levantar el front en local

El sitio es **100 % estático**: no hay backend, no hay bundler y no hay que
instalar nada. React, ReactDOM y Babel se cargan desde CDN, el JSX se transpila
en el navegador y los datos viajan dentro del repo. Levantarlo son dos comandos.

## Requisitos

| Para | Necesitás |
| --- | --- |
| Ver el sitio (lo normal) | Python 3 —o cualquier servidor estático— y conexión a internet |
| Bundle de un archivo / build de producción (opcional) | Node ≥ 20 |

**No** hace falta: `npm install`, la planilla `.xlsx`, ni credenciales de Google,
Mahjong Soul o Discord. Eso es todo del pipeline de datos, no del front.

La conexión a internet es porque `index.html` pide React y Babel a unpkg y las
tipografías a Google Fonts. Si necesitás trabajar sin red, mirá
*Bundle de un solo archivo* más abajo.

## Levantarlo

```bash
git clone https://github.com/Cesar-63/leaderboard-mahjong-chile-2.git
cd leaderboard-mahjong-chile-2
python3 -m http.server 8000
```

Abrir <http://localhost:8000/index.html>.

Eso es todo. No hay paso de build, no hay `.env`, no hay que generar datos.

> **Abrir `index.html` con doble clic NO funciona.** Bajo `file://` el navegador
> bloquea la lectura de los `.jsx` (Babel los pide por XHR) y la página queda en
> blanco. Tiene que ir por HTTP, aunque sea el `http.server` de arriba.

Cualquier otro servidor estático sirve igual, mientras corra desde la raíz del
repo:

```bash
npx serve .          # Node
php -S localhost:8000  # PHP
```

o la extensión **Live Server** de VS Code (botón *Go Live*).

## Ciclo de trabajo

Editar un `.jsx`, `.js` o `.css` y **recargar la pestaña**. No hay watcher ni
hot reload porque no hay build.

Los `<script>` de `index.html` llevan un `?v=cc` para romper caché. Si tocaste un
archivo y no ves el cambio, hacé un **hard reload** (`Ctrl/Cmd + Shift + R`) o
dejá abierto el DevTools con *Disable cache* marcado.

Dos cosas que sorprenden la primera vez:

- **La primera carga tarda un par de segundos.** Babel está transpilando ~200 KB
  de JSX en el navegador. Es normal y sólo pasa en desarrollo.
- **Los errores de JSX salen en la consola del navegador**, no en la terminal. Un
  error de sintaxis en cualquier `.jsx` deja la página en blanco: mirá la consola.

## Qué hay en la raíz

Todo el front vive en la raíz del repo, sin carpeta `src/`:

| Archivo | Qué es |
| --- | --- |
| `index.html` | La entrada. Declara el orden de carga de todo lo demás. |
| `app.jsx` | Router de vistas y estado global. |
| `components-standings.jsx` | Tabla de clasificación y rail lateral. |
| `components-detail.jsx` | Perfil de jugador, comparador, historial, calendario, récords. |
| `charts.jsx` | Sparklines, radar, curvas. |
| `tiles.jsx` + `tile-art.js` | Dibujo de fichas (las 37 caras en SVG). |
| `flags.jsx` | Banderas de nacionalidad. |
| `stat-tips.jsx` | Fuente única de rótulos, fórmulas y tooltips de cada métrica. |
| `tweaks-panel.jsx` | Panel de ajustes visuales. |
| `i18n.js` | Textos ES/EN y helpers. JS plano, no JSX. |
| `styles.css` | Todos los estilos y los tokens de tema. |
| `data/generated.js` | **Los datos**, ya generados y versionados. |
| `assets/` | Logo e imágenes. |

**Si agregás un `.jsx` o un `.css` nuevo, hay que declararlo en `index.html`**
—en el `<script>`/`<link>` correspondiente y en el orden correcto—. No hay lista
aparte ni autodescubrimiento: el build de producción recorre el HTML.

Ojo con el orden: los `.jsx` se cargan en secuencia y cada uno define globales
que usa el siguiente. `app.jsx` va último.

## Los datos

`data/generated.js` está **versionado en el repo** y define un único global:

```js
window.MJC_DATA = { divisions: { A: {...}, B: {...} }, ... }
```

Lo genera `scripts/sync.py` desde la planilla y los paipus, y un workflow lo
commitea a `main` solo. **Para trabajar en el front no hace falta correr nada de
eso**: clonás y ya tenés los datos reales de la liga.

Para probar estados raros (jugador con 0 hanchan, sesión pendiente, penalización
por ausencia) editá una copia del archivo a mano; no lo commitees.

## Bundle de un solo archivo (opcional)

Para compartir una rama sin desplegarla, o para trabajar sin internet:

```bash
node scripts/build_preview.mjs
```

Emite `dist/preview.html`: CSS, datos, logo, React y el JSX ya transpilado, todo
inlineado. Se abre con doble clic, no pide red ni servidor. El gemelo
`dist/preview.artifact.html` es el mismo contenido sin `<html>/<head>/<body>`.

La primera corrida instala sus dependencias en `.vendor/` (tarda unos segundos).
`.vendor/` y `dist/` no se versionan.

## Build de producción (opcional)

Es lo que corre Vercel; **no es para desarrollar**:

```bash
node scripts/build_site.mjs   # -> dist-site/
```

Transpila el JSX, cambia el React de desarrollo de unpkg por el de producción
servido desde el propio dominio y publica cada `.js`/`.css` con hash en el
nombre. Detalle completo en `DEPLOY_VERCEL.md`.

Para desarrollar, siempre `python3 -m http.server` sobre la raíz.

## Tests

El front no tiene tests propios. Lo que hay:

```bash
node --test tests/test_discord_bot.mjs   # bot de Discord, red simulada
```

Los tests de Python cubren el pipeline de datos y necesitan sus dependencias:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m unittest discover -s tests -t .
```

Nada de eso hace falta para tocar la UI.

## Si algo falla

| Síntoma | Causa |
| --- | --- |
| Página en blanco, consola con errores de CORS | Abriste el archivo con `file://`. Usá el servidor. |
| Página en blanco, consola con un `SyntaxError` | Error de JSX. El mensaje dice el archivo y la línea. |
| `MJC_DATA is not defined` | No estás sirviendo desde la raíz del repo: `data/generated.js` no se encontró. |
| Se ve sin estilos, o React no carga | Sin internet. Usá `dist/preview.html`. |
| Tu cambio no aparece | Caché. Hard reload. |
| `Address already in use` | Otro proceso en el 8000: `python3 -m http.server 8001`. |
