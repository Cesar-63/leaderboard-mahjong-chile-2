# Auto-streamer de la liga (Twitch / YouTube + audio de Discord)

Evaluación técnica, no implementación. Objetivo: transmitir **en vivo todas las
mesas posibles** de cada sesión, con el audio de un canal de voz de Discord como
comentario, y que todo arranque solo.

Se prioriza el costo: la Opción A corre en un PC de la casa y cuesta $0 de
infraestructura. La Opción B es la misma pieza de software en AWS, para cuando
molesta depender de un PC encendido.

## 1. Lo que pide el problema

| Restricción | Consecuencia |
| --- | --- |
| 6 mesas por sesión, **todas a la vez** | Un canal de Twitch transmite **una** señal. O mosaico 2×3, o realización automática, o N señales en YouTube. |
| 2 hanchan por mesa, ~2,5–3,5 h por sesión | Ventana de emisión corta y predecible: ~50 h por temporada entre las dos divisiones. |
| El audio sale de un canal de voz de Discord | Un bot de Discord que **recibe** voz y entrega PCM al encoder. |
| Debe arrancar solo | El disparador ya existe: fecha y hora por mesa viven en la hoja `Calendario`. |
| La liga se juega en salas de torneo de Mahjong Soul | No hay "cámara": hay que observar la partida y dibujarla. |

## 2. Hallazgo que define la arquitectura

**No hace falta capturar el cliente de Mahjong Soul.** El protocolo trae
observación en vivo de primera clase (`ms/protocol.proto` del
`mahjong_soul_api` que ya usa el pipeline):

| RPC / mensaje | Para qué sirve |
| --- | --- |
| `Lobby.fetchCustomizedContestGameLiveList(unique_id)` → `GameLiveHead[]` | Qué mesas de la sala de torneo están jugando **ahora**, con uuid, asientos y hora de inicio. |
| `Lobby.createGameObserveAuth(game_uuid)` → `token`, `location` | Permiso para observar esa partida y a qué servidor de juego conectarse. |
| `FastTest.authObserve(token)` + `FastTest.startObserve()` → `ResStartObserve{head, passed}` | Entra como observador y entrega **todo lo ya ocurrido** en la partida (`passed`), o sea que engancharse tarde no pierde nada. |
| `NotifyObserveData{GameLiveUnit}` (push por websocket) | Cada acción nueva, en vivo. |
| `Lobby.fetchGameLiveInfo` / `fetchGameLiveLeftSegment` | Alternativa por segmentos en CDN, con `left_start_seconds` (retardo de la emisión pública). |
| `CustomizedContestDetail.observer_switch` | Interruptor del torneo que habilita observadores. **Hay que confirmarlo en las dos salas.** |

Un `GameLiveUnit` es `{timestamp, action_category, action_data}` y `action_data`
es un `Wrapper` protobuf de la misma familia de mensajes `Record*`
(`RecordNewRound`, `RecordDealTile`, `RecordDiscardTile`, `RecordChiPengGang`,
`RecordHule`…) que `parse_record` en `scripts/majsoul.py` ya decodifica para los
paipus. **El decodificador en vivo es el mismo código que ya está probado contra
72 paipus reales**, no uno nuevo.

Consecuencias, todas a favor:

- **Dibujamos nuestro propio tablero.** `tile-art.js` ya tiene las 37 caras en
  SVG (FluffyStuff, CC0) y `tiles.jsx` ya las pinta con el CSS de `.mj-tile`.
  El overlay puede usar `data/generated.js`: nombre de liga, bandera, puntos de
  temporada, posición, y cuánto se mueve la tabla con cada hanchan.
- **Controlamos qué información se muestra.** Capturar el cliente obliga a
  mostrar lo que el cliente muestre; renderizando nosotros se decide mano por
  mano si se revelan las manos ocultas (ver §7, es el riesgo más serio).
- **Cuesta casi nada de CPU.** 2D estático con cambios cada 2–4 s comprime
  muchísimo mejor que un juego 3D capturado.
- **Cero dependencia de assets de Mahjong Soul** en la señal emitida.

Costo del hallazgo: hay que escribir un renderizador de tablero completo
(manos, descartes, melds, riichi, dora, marcadores, viento, honba). Es la
tarea grande del proyecto, ~60% del esfuerzo.

## 3. Opción A — PC local (la más barata: $0 de infra)

```
                   ┌───────────────────────────────┐
Mahjong Soul ─ws──▶ │ stream_observer.py            │
 (sala torneo)      │  login Yostar (majsoul.py)    │
                    │  live list cada 45 s          │
                    │  observe × 6 mesas            │
                    │  decodifica Record* → JSON    │
                    └──────────┬────────────────────┘
                               │ websocket local (localhost:8787)
                    ┌──────────▼────────────────────┐
                    │ broadcast.html (Chromium)     │  ← tiles.jsx, tile-art.js,
                    │  mosaico 2×3 + overlays       │    styles.css, generated.js
                    └──────────┬────────────────────┘
                               │ OBS browser source (o ffmpeg + headless)
Discord (voz) ─────▶ discord-audio.mjs ──PCM 48k──┐  │
                                                  ▼  ▼
                                        ┌────────────────────┐
                                        │ ffmpeg / OBS       │──rtmp──▶ Twitch
                                        │ x264 720p30        │──rtmp──▶ YouTube
                                        └────────────────────┘
```

Dos sabores, y conviene empezar por el primero:

**A0 — asistido (una tarde de trabajo, $0).** El comentarista abre OBS en su PC,
pone `broadcast.html` como *browser source* y captura el audio de escritorio (el
Discord que ya tiene abierto). No hay bot de voz, no hay orquestador. Sirve para
validar el renderizador contra una sesión real antes de automatizar nada.

**A1 — automático.** Un mini-PC (o el mismo PC de siempre) corre `run.sh`:
`stream_observer.py` + Chromium headless + el bot de voz + ffmpeg, disparados
por systemd-timer/cron que lee la hoja `Calendario` con `scripts/gsheets.py`.
Se enciende 10 min antes de la primera mesa y se apaga cuando la última cierra.

**Costos A:** $0 de servicios. Lo único a verificar es la **subida**: 1 señal de
mosaico 720p30 son ~3 Mbps; 1080p30 ~6 Mbps. Cualquier fibra chilena de
100/100 sobra. Si además se quieren 6 señales individuales en YouTube, son
~18 Mbps sostenidos de subida: ahí ya hay que mirar el plan.

**Riesgo A:** depende de que ese PC esté encendido, con luz y con internet, justo
a la hora de la sesión. Es exactamente el riesgo que compra la Opción B.

## 4. Opción B — AWS, la misma pieza de software

Nada cambia salvo dónde corre. **EC2 puro + ffmpeg**, encendido sólo durante la
ventana de sesión.

- **Instancia:** `c7g.large` (2 vCPU Graviton3) alcanza para el mosaico y una
  salida 720p30. Para 6 salidas separadas, `c7g.2xlarge`.
- **Encendido/apagado:** EventBridge Scheduler dispara un Lambda que lee el
  `Calendario` (o directamente un cron con las fechas de la temporada) y hace
  `StartInstances` / `StopInstances`. Sin instancia encendida no hay costo de
  cómputo.
- **Sin MediaLive.** AWS Elemental MediaLive cobra por canal y por hora (orden de
  US$1–3/h por canal según resolución): para 6 canales × 50 h es entre 10 y 30
  veces el costo de hacer lo mismo con ffmpeg en una EC2. Descartado.

**Estimación de costos por temporada** (7 sesiones × 2 divisiones × ~3,5 h ≈
50–60 h de emisión; precios de referencia de `us-east-1`, **verificar antes de
comprometerse**, y São Paulo es bastante más caro):

| Escenario | Cómputo | Egreso | Almacenamiento | Total temporada |
| --- | --- | --- | --- | --- |
| 1 señal (mosaico), on-demand `c7g.large` | 60 h × $0,0725 ≈ **$4,4** | ~95 GB, primeros 100 GB/mes gratis ≈ **$0** | 8 GB gp3 × 4 meses ≈ **$2,6** | **≈ $7** |
| 1 señal, spot | ≈ **$1,8** | ≈ **$0** | ≈ **$2,6** | **≈ $5** |
| 6 señales a YouTube, `c7g.2xlarge` on-demand | 60 h × $0,29 ≈ **$17** | ~570 GB ≈ **$40** | ≈ **$2,6** | **≈ $60** |

O sea: el mosaico en AWS cuesta **menos que un café al mes**; lo que se paga caro
es insistir en seis señales separadas, y el 80% de ese costo es egreso, no CPU.
Si en algún momento se quieren las 6, conviene el híbrido: mosaico en la nube y
las mesas sueltas sólo cuando alguien las pida.

**Descartados y por qué:**

- *GitHub Actions* — el job muere a las 6 h, no hay red estable para RTMP y usar
  minutos gratis para emitir video es abuso del servicio. No.
- *VM con GPU capturando el cliente de Mahjong Soul* — 10–20× el costo, arrastra
  Windows/Wine, y una actualización del cliente rompe la captura. El observador
  por protocolo lo vuelve innecesario.
- *Lambda / Fargate* — no sirven para procesos de 3 h con salida continua a un
  precio mejor que una EC2 apagada el resto del tiempo.

## 5. Las 6 mesas simultáneas

- **Twitch: una señal por canal.** La respuesta es el **mosaico 2×3** (cada mesa
  a 640×360 dentro de un 1080p) más un **realizador automático** que abre a
  pantalla completa la mesa "caliente". Heurística barata, toda calculable desde
  los eventos que ya llegan: riichi declarado, mano abierta con dora, tenpai
  final, diferencia de puntos < 3.000 en South-4, yakuman en camino.
- **YouTube: admite varias transmisiones simultáneas por canal** (confirmar el
  límite de la cuenta). Ahí sí cabe "una mesa, un video", más el mosaico como
  señal principal.
- **Restream a las dos plataformas es gratis en CPU:** un solo encode y el muxer
  `tee` de ffmpeg empuja el mismo paquete a los dos RTMP.

Recomendación: **mosaico + realizador como señal única**, en Twitch y YouTube a
la vez. Cumple "cada partida posible en vivo" literalmente —las seis están en
pantalla todo el tiempo— sin multiplicar por seis el costo ni la fragilidad.

## 6. Audio de Discord

- Bot con `@discordjs/voice` + `prism-media`: se une al canal de voz, se
  suscribe a cada hablante, decodifica Opus → PCM 48 kHz estéreo, mezcla y lo
  entrega a ffmpeg por pipe (`-f s16le -ar 48000 -ac 2 -i pipe:3`).
- **Bot, nunca cuenta de usuario.** Automatizar una cuenta personal (selfbot)
  viola el ToS de Discord y arriesga la cuenta del comentarista. La recepción de
  voz por bot no está documentada por Discord pero la biblioteca la soporta y es
  práctica corriente.
- **Avisar que se graba.** Un mensaje fijo en el canal y un aviso del bot al
  entrar. Es lo correcto y además evita el reclamo posterior.
- **Sincronía comentario ↔ imagen:** los comentaristas tienen que comentar *lo
  que sale al aire*, no lo que ven en el cliente. Se les da la misma página de
  transmisión ya retrasada (una pestaña local) y **se les pide no tener abierto
  el observador de Mahjong Soul**. Si comentan la partida en tiempo real y la
  señal va retrasada, el audio queda adelantado y se spoilea solo.
- El roster ya trae el Discord de cada jugador (`PRIVATE_PLAYER_FIELDS`): sirve
  para rotular quién habla **con nombre de liga**. El handle no se publica nunca,
  igual que en el bot de `/agendar`.

## 7. Riesgos y decisiones abiertas

1. **Trampa por la propia transmisión (el riesgo serio).** El feed de observador
   puede revelar las manos ocultas de los cuatro. Emitirlo en vivo permite que
   un tercero mire el stream y le sople la mano al rival. Opciones, de más a
   menos segura: (a) **no dibujar las manos ocultas** hasta que la mano termine
   —la mesa se ve con descartes, melds, riichi y marcador, que es el 90% de lo
   entretenido—; (b) **retardo de emisión de 10 min**, más largo que una mano
   típica; (c) las dos. Recomiendo (a) + retardo de 5 min, y revelar todo recién
   en el VOD. **Esto lo decide la organización, no el código.**
2. **Mahjong Soul admite una sola sesión por cuenta.** Está documentado en
   `CLAUDE.md` y es la razón del `concurrency: sync-mahjong-data` compartido por
   los dos workflows. Un observador conectado 3 h **sería expulsado por
   `sync-data.yml`, que corre cada 15 minutos**. Hace falta una **segunda cuenta
   Yostar dedicada al observador**, o pausar la sincronización durante las
   sesiones. La segunda cuenta es más limpia.
3. **`observer_switch` de las salas.** Hay que confirmar que los torneos A y B
   permiten observadores y con qué `observer_level`; si no, se habilita desde la
   administración del torneo.
4. **Ritmo de peticiones.** El repo ya se quemó con el 540 de `fetchGameRecord`
   (`PAIPU_REQUEST_DELAY_SECONDS = 20`, `MAX_RECORDS_PER_RUN = 3`). El *live
   list* es una llamada barata, pero conviene 45–60 s entre sondeos y respetar
   el mismo enfriamiento ante un 540.
5. **Secretos.** Las claves RTMP de Twitch/YouTube y el token del bot no pueden
   entrar al repo: es público y `data/generated.js` se sirve tal cual. Van en
   `.env` local (fuera de git) o en SSM Parameter Store si se usa AWS.
6. **Emparejar la partida con la mesa del calendario.** Ya está resuelto:
   `match_games` en `scripts/fill_calendar_paipus.py` asocia por coincidencia de
   ≥3 de 4 jugadores. Se reutiliza para rotular "A · Sesión 3 · Mesa 2" en el
   overlay en vez de mostrar un uuid.
7. **Suplentes y bots.** Un asiento puede ser un suplente ajeno al torneo. El
   overlay debe caer a "Suplente" sin publicar identidad, igual que el resto del
   pipeline.
8. **Derechos de imagen del juego.** Transmitir Mahjong Soul es práctica
   aceptada, y aquí ni siquiera se emiten sus assets. Sí conviene un aviso de
   que es una transmisión de la liga, no oficial de Yostar.

## 8. Plan por fases

| Fase | Qué entrega | Esfuerzo |
| --- | --- | --- |
| 0 | `stream_observer.py`: engancha una partida en vivo y escupe JSON a consola. Confirma `observer_switch`, el retardo real y si llegan las manos ocultas. | 1–2 días |
| 1 | `broadcast.html` con **una** mesa: tablero completo dibujado con `tiles.jsx` + overlay de puntos desde `generated.js`. Se mira en el navegador. | 3–5 días |
| 2 | **A0 al aire:** OBS en el PC del comentarista, audio de escritorio, primera sesión transmitida. Sin bot, sin nube. | 1 día |
| 3 | Mosaico 2×3 + realizador automático. | 2–3 días |
| 4 | Bot de voz de Discord y mezcla en ffmpeg. | 2–3 días |
| 5 | Orquestación por `Calendario` + retardo de emisión + apagado automático. | 2 días |
| 6 | (Opcional) Mover el conjunto a EC2 con encendido programado. | 1 día |

## 9. Archivos que tocaría

```
stream/
├── observer.py         # reusa majsoul_lobby() y el decodificador de Record*
├── broadcast.html      # entrada de la vista de transmisión
├── broadcast.jsx       # tablero + mosaico + realizador (usa tiles.jsx, tile-art.js)
├── discord-audio.mjs   # bot de voz → PCM por pipe
├── schedule.py         # ventana de emisión desde la hoja Calendario (gsheets.py)
└── run.sh              # levanta todo y arma la línea de ffmpeg
```

Nada de esto llega al sitio publicado: `build_site.mjs` recorre `index.html`, no
el árbol completo. Igual hay que **agregar `stream/` al `.vercelignore`** —hoy
excluye `tests/`, `reports/` y los `.md`, pero subiría una carpeta nueva de la
raíz sin necesidad.
