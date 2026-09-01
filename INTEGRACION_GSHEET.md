# Integración Google Sheets → Liga Mahjong Chile

La planilla configurada en `sync-config.json` es el panel administrativo. Los
organizadores pegan los enlaces de repetición en la hoja **Calendario**, en la
celda vacía ubicada a la derecha de `Paipu G1` o `Paipu G2`.

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

- `data/liga.json`: contrato completo consumido por la interfaz.
- `data/stats.json`: métricas avanzadas derivadas exclusivamente de paipus.
- `data/sync-status.json`: estado y error de las 168 celdas posibles.
- `data/generated.js`: versión cargable por la aplicación estática actual.

El frontend conserva `data.js` como fallback de desarrollo. Cuando existe
`data/generated.js`, los datos sincronizados reemplazan el mock.

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
el historial de partidas de las salas de torneo de División A y B y dice qué
enlace va en cada celda `Paipu G1` / `Paipu G2` todavía vacía.

```bash
MAJSOUL_CONTEST_ID_A=... MAJSOUL_CONTEST_ID_B=... python scripts/fill_calendar_paipus.py
python scripts/fill_calendar_paipus.py --xlsx planilla.xlsx --games-json partidas.json
```

**No escribe en la planilla.** Deja `reports/calendar-paipus.json` y
`reports/calendar-paipus.csv` con `celda → valor`, y el mismo resumen en el
Job Summary de GitHub Actions. El pegado lo hace un humano.

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

`.github/workflows/calendar-paipus.yml` lo corre a diario y a pedido, con los
secrets `MAJSOUL_CONTEST_ID_A` y `MAJSOUL_CONTEST_ID_B` además de la sesión
técnica. Comparte el grupo de concurrencia con el sincronizador porque Mahjong
Soul admite una sola sesión por cuenta.

## Automatización

`.github/workflows/sync-data.yml` ejecuta la sincronización cada 15 minutos y
también permite iniciarla manualmente desde GitHub Actions. Si los datos cambian,
el workflow hace un commit; Vercel puede desplegar ese commit normalmente.

La planilla debe continuar siendo legible mediante el enlace compartido. No se
requieren credenciales de Google mientras se mantenga esa configuración.

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
