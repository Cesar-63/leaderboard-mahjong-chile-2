# Liga Mahjong Chile — Scoreboard Web

Instrucciones de repo para Claude Code. Leer junto con `DESIGN.md`.

## Contexto

Sitio público de standings, perfiles y jornadas para una liga chilena de riichi
mahjong, jugada en sala de torneo de MahjongSoul. Estático, sin backend, sin auth.

## Modelo de liga

- **Dos divisiones:** A y B, 24 jugadores cada una (48 en total).
- **Temporada:** 7 sesiones. Cada sesión son 2 hanchan → 14 hanchan por jugador.
- **Por sesión:** se sortean 6 mesas de 4 jugadores. Cada jugador aparece
  exactamente una vez por sesión, en una sola mesa, y juega los 2 hanchan de esa
  mesa con los mismos rivales.
- **No es round robin real.** El emparejamiento es por sorteo; sobre 7 sesiones un
  jugador enfrenta como máximo 21 de sus 23 rivales. No asumir cobertura completa
  en ninguna vista (ej. head-to-head puede estar vacío entre dos jugadores).
- **Ascenso/descenso:** hay serie de promoción entre A 21-24 y B 1-4.

## Reglas de puntaje

**Las reglas no son iguales en las dos divisiones.** Las de cada una viven en
`sync-config.json` bajo `divisions`; lo de abajo es la referencia, no una fuente
paralela que haya que mantener sincronizada a mano.

- Puntos iniciales: 30.000 por hanchan, en ambas divisiones.
- **Uma: A = +15 / +5 / −5 / −15. B = +35 / +5 / −10 / −30.**
- **Sin oka.** Puntos de retorno = puntos iniciales, por lo tanto cada mesa suma
  cero en puntos de liga. Los dos umas suman cero, así que la validación de
  "suma de puntos de liga por mesa = 0" vale para las dos.
- Fórmula: `puntos = (scoreFinal − 30000) / 1000 + uma`.
- **Akadora: A no tiene. B juega con 4.** Verificado en el `detail_rule` de los
  paipus (`dora_count: 4` solo en B) y en los tiles: 0 rojos en 624 manos
  ganadas de A, 70 en 117 de B. Los rojos ya vienen dentro del `scoreRaw`, así
  que no cambian nada del pipeline; la suma de scores crudos sigue siendo
  120.000.
- **Penalización por ausencia: −30 por hanchan** (una sesión completa ausente son
  −60). Confirmado por César; vive en `sync-config.json` como
  `absencePenaltyPerHanchan`, no hardcodeada. La partida cuenta como jugada y el
  −30 entra en el historial, pero **no ocupa puesto**: `avgRank` y la distribución
  1º-4º se calculan solo sobre partidas realmente jugadas.

**El paipu manda sobre el Excel** para resultados y puntos cuando existe; el
Game History es el respaldo para las mesas sin paipu.

**Las mesas del Game History NO están numeradas como en el Calendario.** Solo la
sesión coincide. El emparejamiento se hace por grupo de jugadores: se asocia cada
grupo del historial con la mesa del calendario con la que comparta al menos 3 de
4 jugadores (3 y no 4, para tolerar un suplente). **El número de mesa, la fecha y
la hora reales los tiene el Calendario.**

## Pipeline de datos

1. `scripts/import.py` lee el `.xlsx` (openpyxl) → emite `data/liga.json`.
2. Un script aparte parsea logs de partidas → emite `data/stats.json` con métricas
   avanzadas (win rate, deal-in, riichi, manos abiertas, yaku).
3. El sitio se genera 100% estático desde esos dos JSON.
4. Actualizar resultados = reemplazar Excel → correr script → commit + push →
   Vercel redespliega solo.

**Los dos datasets van separados y se unen por ID de jugador.** Cadencias
distintas: el Excel manda para clasificación, y una corrida a medias del parser de
logs no debe poder ensuciar la tabla.

## Estadísticas avanzadas (paipu)

`scripts/majsoul.py` cuenta por asiento y mano; `scripts/sync.py` agrega por
jugador y publica las tasas. Definiciones, alineadas con amae-koromo:

| Métrica | Fórmula | Nota |
| --- | --- | --- |
| `winRate` 和了率 | manos ganadas / manos jugadas | |
| `dealInRate` 放銃率 | manos en que pagó el ron / manos jugadas | |
| `riichiRate` 立直率 | manos con riichi / manos jugadas | |
| `openRate` 副露率 | manos con llamada / manos jugadas | **el kan cerrado no abre la mano** |
| `damatenRate` 黙聴率 | manos ganadas en menzen sin riichi / manos ganadas | |
| `avgWinPoints` 平均打点 | puntos de las manos ganadas / manos ganadas | `dadian`: sin palos ni honba |
| `avgDealInPoints` 平均銃点 | puntos pagados por ron / deal-ins | ídem |
| `avgWinTurn` 和了巡数 | turno propio al ganar / manos ganadas | tsumo = robos; ron = robos + 1 |

- **El kan cerrado (ankan, `RecordAnGangAddGang.type == 3`) no cuenta como
  furo.** El kakan (type 2) sí, pero llega sobre un pon que ya la había abierto.
- Las cuatro últimas se miden sobre manos ganadas o deal-ins, no sobre el total:
  su denominador es chico y hay que degradarlas (`STAT_MIN_SAMPLE` en
  `stat-tips.jsx`), no mostrarlas como dato firme.
- `stat-tips.jsx` es la fuente única de qué mide cada casilla: rótulo, fórmula,
  denominador y tooltip salen del mismo registro, y lo usan tanto la vista de
  escritorio como la del teléfono. Agregar una métrica = una entrada ahí, sus
  claves en `i18n.js` y el campo en `sync.py`.

## Esquema de `data/liga.json`

```json
{
  "liga": { "nombre": "Liga Mahjong Chile", "temporada": 3, "sesionesTotales": 7 },
  "reglas": { "puntosIniciales": 30000, "uma": [15, 5, -5, -15], "oka": 0 },
  "divisiones": [
    {
      "id": "A",
      "jugadores": [{ "id": "A01", "nombre": "..." }],
      "sesiones": [
        {
          "n": 1,
          "fecha": "2026-03-15",
          "mesas": [
            {
              "mesa": 1,
              "hanchans": [
                {
                  "n": 1,
                  "resultados": [
                    {
                      "jugador": "A01",
                      "scoreRaw": 45000,
                      "uma": 15,
                      "puntos": 30.0,
                      "puesto": 1,
                      "sustitutoDe": null
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "penalizaciones": [{ "jugador": "A07", "sesion": 3, "puntos": -20, "motivo": "ausencia" }]
}
```

- Mesas sin jugar emiten `hanchans: []` y se muestran como fixture pendiente.
- Resultados de sustitutos llevan `sustitutoDe` y `esSuplente`; entran en el
  historial de mesas pero **no** en standings ni en estadísticas avanzadas. El
  suplente puede ser de otra división, ajeno al torneo o incluso un bot.
- Hay como máximo **un ausente por hanchan**.
- Standings, promedios y rachas se derivan en build. **Nunca duplicar datos
  calculados dentro del JSON.**

## Validaciones del parser

El script falla con mensaje que indique **división, sesión y mesa**:

1. Roster: 24 jugadores por división, IDs únicos y estables.
2. Cobertura: cada jugador exactamente una vez por sesión.
3. Por hanchan: 4 jugadores, puestos 1–4 sin repetir, scores múltiplos de 100,
   suma de scores crudos = 120.000.
4. Suma de puntos de liga por mesa = 0 (se sostiene solo si no hay oka).
5. Sustitutos: cada `sustitutoDe` apunta a un jugador válido del roster.
6. Orden: no puede existir hanchan 2 sin hanchan 1 en la misma mesa.
7. Crosscheck contra la hoja de clasificación: totales de uma, conteo de puestos y
   partidas jugadas. Se salta si (1)–(6) fallaron, para mostrar causa raíz.

## Arquitectura

```
src/
├── app/            páginas (App Router, SSG)
├── components/     presentación pura
├── lib/
│   ├── liga.ts       tipos + carga de JSON
│   ├── standings.ts  funciones puras: puntos, promedio, distribución, racha, forma
│   └── stats.ts      métricas derivadas de logs
└── styles/globals.css  tokens
```

**Lógica separada de presentación.** `standings.ts` no importa JSX y tiene tests
contra un fixture escrito a mano. Los componentes solo pintan.

## Preview local

Para ver una rama sin desplegar ni tocar `main`:

- **Servidor estático:** `python3 -m http.server 8000` en la raíz y abrir
  `http://localhost:8000/index.html` (o `/Mobile.html`). Es el sitio tal cual,
  con React y Babel desde CDN.
- **Bundle de un solo archivo:** `node scripts/build_preview.mjs` emite
  `dist/preview.html` (y `--entry Mobile.html` emite `dist/mobile.html`):
  CSS, datos, logo, React y el JSX ya transpilado, todo inlineado. Se abre con
  doble clic o se comparte tal cual; no pide red ni servidor. El gemelo
  `dist/*.artifact.html` es el mismo contenido sin `<html>/<head>/<body>`, para
  publicarlo como Artifact.

El script instala solo sus dependencias en `.vendor/` la primera vez. `.vendor/`
y `dist/` no se versionan, y nada de esto entra al deploy de Vercel.

## Vistas

1. **Tabla** — clasificación por división, columnas ordenables, sparkline de forma,
   zonas de playoff/ascenso/descenso. Rail lateral: próxima sesión, últimas
   hanchan, progreso de temporada, top 4 de la otra división.
2. **Jugador** — rango, puntos, banner de zona, stats clave, distribución de
   puestos, radar de estilo, curva de evolución, yaku más jugados.
3. **Comparador** — dos jugadores cara a cara, cruzando divisiones. Dos radars y
   métricas en barras espejadas.
4. **Historial** — log de hanchan filtrable por sesión, con los 4 resultados y
   deltas.
5. **Calendario** — próximos eventos por división, serie de promoción, strip de
   sesiones jugadas.
6. **Records** — Hall of Fame, 6 récords por división.

## Reglas de trabajo

- **Código completo y copy-paste-ready.** Nunca placeholders (`// tu lógica aquí`,
  `# resto sin cambios`). Si una omisión es inevitable, avisarla de forma
  prominente ANTES del bloque.
- **Validar el parser contra el Excel real antes de tocar UI.**
- Mobile-first: la liga se mira desde el teléfono.
- Commits chicos, uno por feature.
- Jornadas sin jugar se muestran como fixture pendiente, no se ocultan.
- **No inventar datos.** Si una métrica del diseño no se puede alimentar con los
  datos disponibles, parar y avisar en vez de mockear.
- **No copiar rangos numéricos del mockup.** Fue maquetado con uma ±30/±10 y datos
  sintéticos; ejes, umbrales y valores de ejemplo están al doble de escala.
  Recalibrar contra datos reales.

## Estados que hay que manejar

- Sesión 7 pendiente (fixture, no ocultar).
- Jugador con 0 hanchan jugados.
- Jugador con muestra chica: un radar o una curva con 2 hanchan es ruido. Decidir
  umbral mínimo y degradar visualmente, no mostrar como si fuera dato firme.
- `stats.json` ausente o incompleto para un jugador: el perfil se ve bien sin el
  radar, no roto.
- Penalización por ausencia aplicada.

## Abierto

- Penalización por ausencia: −20 o −30.
- Umbral de muestra mínima para métricas avanzadas.
- Colisión de rojo en tema Neon: rojo = División A y también = líder / pestaña
  activa / valor ganador. Necesita separación (ej. división solo en bordes y
  avatares, estado en relleno).
