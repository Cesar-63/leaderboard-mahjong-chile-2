# Integración Google Sheets → Liga Mahjong Chile

La planilla configurada en `sync-config.json` es el panel administrativo. Los
enlaces de repetición van en la hoja **Calendario**, en la celda vacía ubicada a
la derecha de `Paipu G1` o `Paipu G2`. Los pega un organizador a mano o los
completa `scripts/fill_calendar_paipus.py --write` desde las salas de torneo.

## Ejecutar localmente

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/sync.py
```

Para probar con una copia local de la planilla:

```bash
python scripts/sync.py --xlsx planilla.xlsx --offline
```

El modo `--offline` no realiza descargas. Los logs previamente descargados se
leen desde `data/raw-paipu/`.

**Los paipus descargados se versionan.** Antes no se hacía y cada corrida volvía
a pedirle los 24 registros a Mahjong Soul; ese ritmo hizo que la API respondiera
540 a todo y terminó bloqueando la cuenta técnica. Al versionarlos, cada paipu se
pide una sola vez en su vida y una caída de la API ya no borra las estadísticas
que ya estaban publicadas.

## Archivos generados

- `data/liga.json`: contrato completo consumido por la interfaz, ya sin los
  campos de identidad de la planilla.
- `data/stats.json`: métricas avanzadas derivadas exclusivamente de paipus.
- `data/sync-status.json`: estado y error de las 168 celdas posibles.
- `data/generated.js`: versión cargable por la aplicación estática actual. Es el
  único de los cuatro que se sirve en el sitio; ver **Privacidad**.

El frontend conserva `data.js` como fallback de desarrollo. Cuando existe
`data/generated.js`, los datos sincronizados reemplazan el mock.

## Privacidad

La planilla es el panel administrativo y trae, por jugador, su **ID de Mahjong
Soul** y su **Discord**. Ninguno de los dos sale publicado: `sync.py` los usa en
memoria y `strip_private_fields` los borra antes de escribir `liga.json`,
`stats.json` y `generated.js`. `tests/test_sync.py::PrivacidadTests` sostiene la
regla, incluso sobre los archivos ya versionados.

**El sufijo `_a` de los enlaces de paipu se conserva a propósito.** Mahjong Soul
lo agrega al copiar un enlace desde el cliente y marca quién lo compartió; en la
planilla es siempre el mismo valor, el de la cuenta que pega los enlaces, no el
de ningún jugador. `extract_record_id` lo necesita para pedirle el registro a la
API, así que no se toca. Si algún día lo pega otra persona, el sufijo cambia con
ella: conviene que sea siempre la cuenta organizadora.

**Lo que queda fuera del código:** `sync-config.json` publica el ID de la
planilla y hoy la descarga es anónima (`export?format=xlsx` sin credenciales),
lo que sólo funciona si la planilla es legible con el enlace. Como el repo es
público, ese ID basta para que cualquiera exporte la planilla completa —
incluidos el ID de Mahjong Soul y el Discord de los 48 jugadores. Opciones:

1. **Restringir la planilla** y darle al workflow una cuenta de servicio de
   Google (secret nuevo, `sync.py` pasa a descargar autenticado). Es el arreglo
   real; cuesta crear la credencial.
2. **Sacar las columnas sensibles** de la planilla compartida y dejarlas en otra
   restringida. `match_paipu_seats` cae a emparejar por nickname cuando el
   roster no trae `accountId`, así que el pipeline sigue funcionando; se pierde
   robustez ante cambios de nickname.

Mientras no se haga ninguna de las dos, el arreglo del pipeline tapa la
filtración del sitio pero no la de la planilla.

## Autoridad de datos

- `Game History A/B` manda para standings y puntos.
- Los paipus deben coincidir exactamente con sus cuatro jugadores y scores.
- El paipu alimenta estadísticas avanzadas y agrega un enlace verificable al
  historial.
- Un paipu con error no reemplaza un resultado oficial válido.

## Estados

- `PENDIENTE`: la celda no contiene un paipu.
- `VALIDADO`: el paipu se decodificó, pero falta el resultado en Game History.
- `PUBLICADO`: el paipu coincide con Game History.
- `ERROR`: URL, descarga, fixture o resultado inconsistente.
- `REQUIERE_AUTH`: el enlace es válido, pero Mahjong Soul exige una sesión
  técnica para entregar el protobuf. El resultado oficial igual se publica.

## Buscar los paipus en las salas de torneo

`scripts/fill_calendar_paipus.py` hace el camino inverso al pegado manual: lee
el historial de partidas de las salas de torneo de División A y B y resuelve qué
enlace va en cada celda `Paipu G1` / `Paipu G2` todavía vacía.

```bash
MAJSOUL_CONTEST_ID_A=... MAJSOUL_CONTEST_ID_B=... python scripts/fill_calendar_paipus.py
python scripts/fill_calendar_paipus.py --xlsx planilla.xlsx --games-json partidas.json
python scripts/fill_calendar_paipus.py --write --fetch-logs
```

**Sin `--write` no toca la planilla**: deja `reports/calendar-paipus.json` y
`reports/calendar-paipus.csv` con `celda → valor`, y el mismo resumen en el Job
Summary de GitHub Actions, para que el pegado lo haga un humano.

Cómo empareja una partida con su mesa:

1. Cada asiento del torneo se resuelve a un jugador de liga por `account_id`
   (o por nickname si el roster no trae el ID).
2. Gana la mesa del Calendario con más jugadores en común, con un mínimo de 3.
   El reparto de mesas no se repite en la liga, así que tres coincidencias
   identifican la mesa aunque haya jugado un sustituto.
3. Si dos mesas empatan, desempata la fecha del fixture. Si tampoco alcanza, la
   partida queda sin asignar y aparece como `AMBIGUA`.
4. Dentro de una mesa, **Game 1 es la partida que empezó primero**.

Estados del reporte:

- `PROPUESTO`: celda vacía y una partida clara para pegar.
- `REVISAR`: la mesa tiene más de dos partidas en el torneo; se proponen las dos
  más tempranas y el aviso `MESA_CON_EXTRAS` lista todas.
- `CONFLICTO`: la celda ya tiene otro paipu. Nunca se sobrescribe.
- `PENDIENTE`: no hay partida en el torneo para esa celda.
- `OK`: la celda ya está cargada con el paipu que devolvió el torneo.

Avisos: `SIN_MESA` (partida que no calza con ninguna mesa), `AMBIGUA`,
`MESA_CON_EXTRAS` y `NOMBRE_DESCONOCIDO` (un nombre del Calendario que no está
en el roster). El job informa y termina OK; con `--fail-on-issues` falla.

### `--write`: pegar las celdas en el Google Sheet

`--write` escribe **solo las celdas `PROPUESTO`**: celda vacía y una única
partida del torneo que le corresponde. Todo lo demás sigue siendo decisión
humana — `CONFLICTO` no se sobrescribe nunca y `REVISAR` queda afuera salvo que
se pida con `--write-revisar`.

El reporte se arma sobre la copia descargada de la planilla, así que justo antes
del `batchUpdate` el script **relee cada celda destino**: si alguien la llenó en
el medio, la deja como está y la informa como `OMITIDO`. Cada fila del reporte
lleva su resultado (`ESCRITO`, `OMITIDO`, `OK`, `ERROR`, o `SIMULADO` cuando se
corrió sin `--write`).

Escribir necesita credenciales, porque el enlace público de exportación es de
solo lectura:

1. Crear una cuenta de servicio en Google Cloud y habilitarle la Google Sheets
   API; descargar su JSON.
2. Compartir la planilla con el `client_email` de esa cuenta, con permiso de
   **Editor**.
3. Guardar el JSON completo en el secret `GOOGLE_SERVICE_ACCOUNT_JSON` (o, en
   local, `export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat cuenta.json)"`, una ruta en
   `GOOGLE_APPLICATION_CREDENTIALS`, o `--credentials cuenta.json`).

La cuenta se valida antes de tocar Mahjong Soul: si falta, el script corta ahí
sin gastar el login. De las credenciales solo se imprime el `client_email`, que
es justamente lo que hay que compartir en la planilla.

### `--fetch-logs`: completar los paipus que falten

`--fetch-logs` descarga a `data/raw-paipu/` los `.pb` que falten, **en la misma
sesión técnica** que ya se abrió para leer las salas: Mahjong Soul admite un
solo login por cuenta, así que leer el torneo y bajar registros van juntos.

Primero se piden los paipus que esta corrida va a pegar (la novedad) y después
los que el Calendario ya traía. Rige el mismo límite que el sincronizador:
`MAX_RECORDS_PER_RUN` (3, ajustable con `--max-logs`) por corrida, espaciados
`PAIPU_REQUEST_DELAY_SECONDS` (20 s) y cortando al primer 540. Un `.pb` que
quedó guardado como XML (la respuesta de "requiere sesión") cuenta como
faltante y se vuelve a pedir.

Con esto, una sola corrida deja la celda pegada y su log disponible, y
`scripts/sync.py` publica las estadísticas avanzadas en la sincronización
siguiente sin esperar a que alguien copie el enlace a mano.

`.github/workflows/calendar-paipus.yml` lo corre a diario y a pedido con
`--write --fetch-logs`, con los secrets `MAJSOUL_CONTEST_ID_A`,
`MAJSOUL_CONTEST_ID_B` y `GOOGLE_SERVICE_ACCOUNT_JSON` además de la sesión
técnica, y commitea los `.pb` nuevos. Si el secret de Google no está, el job
avisa y se queda en modo propuesta. Comparte el grupo de concurrencia con el
sincronizador porque Mahjong Soul admite una sola sesión por cuenta.

## Automatización

`.github/workflows/sync-data.yml` ejecuta la sincronización cada 15 minutos y
también permite iniciarla manualmente desde GitHub Actions. Si los datos cambian,
el workflow hace un commit; Vercel puede desplegar ese commit normalmente.

La planilla debe continuar siendo legible mediante el enlace compartido: leerla
no requiere credenciales de Google. Escribir el Calendario sí las pide, y son
exclusivas de ese camino (`--write`, secret `GOOGLE_SERVICE_ACCOUNT_JSON`); la
sincronización sigue funcionando sin ellas.

Los paipus recientes de Mahjong Soul pueden exigir autenticación aun cuando el
enlace de replay sea compartible. En ese caso la tabla y el historial continúan
sincronizándose desde `Game History`; las estadísticas avanzadas quedan como
pendientes hasta configurar una cuenta técnica o colocar el protobuf en
`data/raw-paipu/<uuid>.pb`.

Para Mahjong Soul Global, el workflow usa una sesión técnica de YoStar guardada
exclusivamente en GitHub Actions Secrets:

- `MAJSOUL_UID`
- `MAJSOUL_TOKEN`
- `MAJSOUL_DEVICE_ID`

El sincronizador renueva la sesión mediante `quick-login`, inicia el flujo
OAuth2 de Mahjong Soul y descarga los registros faltantes en una única conexión,
respetando el límite de la API: como máximo `MAX_RECORDS_PER_RUN` (3) por corrida,
espaciados `PAIPU_REQUEST_DELAY_SECONDS` (20 s), y cortando la tanda al primer
rechazo con código 540. El resto queda para las corridas siguientes, que el cron
completa solo cada 15 minutos.
Los valores nunca se escriben en logs ni en archivos versionados.
