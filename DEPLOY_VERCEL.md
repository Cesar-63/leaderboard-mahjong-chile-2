# Deploy en Vercel

El sitio es 100 % estático y no tiene backend: Vercel sólo sirve archivos. Los
datos no se piden desde el navegador, viajan dentro del repo (ver *Cómo llegan
los datos*), así que **no hay nada que conectar ni ninguna variable de entorno
que configurar en Vercel**.

## 1. Importar el repositorio

En <https://vercel.com/new>, importar `Cesar-63/leaderboard-mahjong-chile-2`.

`vercel.json` ya trae la configuración y **le gana a lo que se ponga en la UI**:
el framework (`Other`), el comando de build y el directorio de salida salen de
ahí. La tabla es para verificar que lo que muestra la pantalla coincide, no algo
que haya que escribir.

| Campo | Valor |
| --- | --- |
| Framework Preset | Other |
| Build Command | `node scripts/build_site.mjs` |
| Output Directory | `dist-site` |
| Install Command | vacío (no hay `package.json` en la raíz) |
| Root Directory | `./` |
| Production Branch | `main` |

Deploy. Queda en `<proyecto>.vercel.app`; el dominio propio se agrega después en
*Settings → Domains*.

### Si el build falla con "No python entrypoint found"

Es que Vercel está construyendo un commit **sin `vercel.json`** (típicamente
`main` antes de mezclar esta configuración). Sin instrucciones, Vercel autodetecta
el tipo de proyecto, ve el `requirements.txt` del pipeline de datos en la raíz,
concluye que es una app de Python y se va a buscar un `app.py` que no existe. Ni
llega a mirar el HTML.

Se arregla desplegando un commit que sí traiga `vercel.json` y `package.json`.
Ese `package.json` no declara dependencias ni bundler: está para que la
detección apunte a Node y no a Python, incluso si algún día alguien borra o
mueve el `vercel.json`.

## 2. Cómo llegan los datos

No hay que hacer nada: la cadena ya está montada y termina en un push a `main`.

```
Google Sheets  ─┐
                ├─ .github/workflows/sync-data.yml (cron cada 15 min)
Paipus Majsoul ─┘        │
                         └─ scripts/sync.py → commit de data/generated.js a main
                                        │
                                        └─ Vercel ve el push y redespliega solo
```

- **Los secretos se quedan en GitHub.** `MAJSOUL_UID`, `MAJSOUL_TOKEN` y el
  resto viven en *GitHub → Settings → Secrets*. Vercel no necesita ninguno, y el
  navegador nunca habla con Google ni con Mahjong Soul: lo que carga es
  `data/generated.js`, que define `window.MJC_DATA`.
- **Cadencia:** el cron corre cada 15 minutos pero sólo commitea cuando hay
  cambios reales (~7 commits al día). El plan Hobby permite 100 deploys diarios,
  así que hay holgura. Si algún día aprieta, se sube el intervalo del cron en
  `sync-data.yml` o se pone un *Ignored Build Step* en Vercel.
- Un resultado nuevo en la planilla aparece en el sitio a los ~15-20 minutos.

## 3. Qué hace el build

`scripts/build_site.mjs` emite `dist-site/` y es lo único que se publica:

- **Transpila el JSX en el build.** En producción el navegador ya no descarga
  `@babel/standalone` (3 MB) ni transpila 8 archivos en cada carga.
- **React en build de producción y desde el propio dominio.** El runtime pasa de
  ~4,2 MB (react + react-dom de desarrollo + Babel, desde unpkg) a 139 KB
  servidos por Vercel. De paso desaparece la dependencia de un CDN de terceros y
  los `integrity` que había que recalcular a mano.
- **Cache por contenido.** Cada `.js`/`.css` sale como
  `/static/<nombre>.<hash>.<ext>` con cache inmutable de un año; el HTML no
  lleva hash y se revalida siempre, así que el commit de datos del bot se ve al
  instante sin que nadie tenga que forzar recarga.
- **Sólo se publica lo que el navegador pide.** Ni `scripts/`, ni `tests/`, ni
  los paipus crudos, ni planillas.

Correrlo local para ver exactamente lo que va a servir Vercel:

```bash
node scripts/build_site.mjs
cd dist-site && python3 -m http.server 8000
```

(Esto es distinto de `scripts/build_preview.mjs`, que empaqueta todo en un solo
HTML autocontenido para compartir una rama sin desplegarla.)

## 4. Escritorio y móvil

Hay dos entradas, `index.html` y `Mobile.html`, y las dos se publican.

- Un teléfono que abre `/` cae automáticamente en `/Mobile.html`. La condición
  es `(max-width: 820px) and (pointer: coarse)`, o sea pantalla chica **y**
  dedo: una ventana angosta en un notebook no redirige.
- `/index.html?desktop=1` fuerza la vista de escritorio y la deja fijada para
  esa pestaña (`sessionStorage`).
- `Mobile.html` nunca redirige de vuelta.
- `/mobile` y `/movil` son atajos a `/Mobile.html`.

Para apagar la redirección, construir con `MJC_MOBILE_REDIRECT=0` (en Vercel:
*Settings → Environment Variables*).

## 5. Detalles que conviene saber

- **`uploads/mahjong_chile_logo_transp - copia.png`** es un duplicado exacto de
  `assets/logo.png`. No se despliega (`.vercelignore`), pero sigue en el repo.
- **Las fuentes siguen viniendo de Google Fonts.** Es el único recurso externo
  que queda en producción.
- **Previews por rama:** Vercel despliega cada push de cualquier rama en una URL
  propia. Sirve para revisar un cambio antes de mezclarlo a `main`.
- **`vercel.json` manda sobre la UI** para build, output, headers y redirects:
  cambiar esos campos en el dashboard no tiene efecto mientras el archivo los
  declare. Se editan en el repo.
