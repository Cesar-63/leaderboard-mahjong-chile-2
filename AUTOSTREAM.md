# Auto-streamer de la liga (Twitch / YouTube + audio de Discord)

Evaluación técnica, no implementación. Objetivo: transmitir **en vivo todas las
mesas posibles** de cada sesión, con el audio de un canal de voz de Discord como
comentario, y que todo arranque solo.

**La imagen es el cliente de Mahjong Soul tal cual**: personajes, avatares,
personalidades, animaciones. Es la decisión de partida y manda sobre el resto
del diseño. Un tablero dibujado por nosotros no sirve para la transmisión
principal (sí para otra cosa, ver §8).

Se prioriza el costo: la Opción A corre en un PC de la casa y cuesta $0 de
infraestructura. La Opción B es lo mismo en AWS.

## 1. Lo que pide el problema

| Restricción | Consecuencia |
| --- | --- |
| La imagen es el cliente real | Captura de pantalla de un navegador con el juego corriendo. Hace falta **GPU**. |
| 6 mesas por sesión, **todas a la vez** | Cada cliente observa **una** mesa, y cada cliente necesita **su propia cuenta**. Ese es el cuello de botella real (§4). |
| 2 hanchan por mesa, ~2,5–3,5 h por sesión | Ventana corta y predecible: ~50–60 h de emisión por temporada entre las dos divisiones. |
| Twitch: una señal por canal | O realización automática (cortes entre mesas), o mosaico. |
| El audio sale de un canal de voz de Discord | Un bot que **recibe** voz, mezclado con el audio del juego. |
| Debe arrancar solo | El disparador ya existe: fecha y hora por mesa viven en la hoja `Calendario`. |

## 2. La arquitectura: cámara + cerebro

El truco no es elegir entre capturar el cliente y leer el protocolo, es usar
**los dos, cada uno para lo que sirve**:

- **La cámara** — el cliente de Mahjong Soul corriendo en un Chromium, en modo
  espectador, capturado por OBS. Es lo que se ve: personajes, avatares, emotes,
  animación de ron. Sale al aire tal cual.
- **El cerebro** — un proceso que habla el protocolo del juego y sabe, sin
  dibujar nada, qué pasa en **las seis mesas a la vez**: quién declaró riichi,
  quién va tenpai, el marcador de cada mesa, cuándo empieza y termina cada
  hanchan. **No se emite ni un pixel suyo.** Sirve para tres cosas:
  1. decidir a qué mesa cortar (dónde está la acción);
  2. alimentar el overlay: marcador en vivo de las otras cinco mesas, nombres de
     liga en vez de nicknames de Mahjong Soul, puntos de temporada y cuánto se
     mueve la tabla con este hanchan (`data/generated.js` ya tiene todo eso);
  3. saber cuándo hay que hacer clic: qué mesa arrancó, cuál terminó.

Así la señal se ve como el juego, y además todas las mesas están presentes en
pantalla aunque la cámara esté en una sola.

Ese cerebro es barato de escribir porque el repo ya tiene la mitad: el
`mahjong_soul_api` de `requirements.txt` expone
`fetchCustomizedContestGameLiveList` (qué mesas juegan ahora),
`createGameObserveAuth` + `authObserve`/`startObserve` (engancharse a una, con
todo lo ya jugado) y el push `NotifyObserveData`; y las acciones que llegan son
los mismos mensajes `Record*` que `parse_record` en `scripts/majsoul.py:511` ya
decodifica contra los 72 paipus de `data/raw-paipu`.

## 3. Cómo se automatiza el cliente (la parte nueva y frágil)

El cliente web (`mahjongsoul.game.yo-star.com`) es un canvas WebGL: **no hay
botones en el DOM**, así que Playwright no puede buscar "el botón de observar"
por selector. Se hace clic por coordenadas sobre el canvas.

- **Fijar el terreno:** resolución fija (1280×720 o 1920×1080), idioma fijo,
  perfil de Chromium persistente para no repetir el login. Con eso las
  posiciones de la lista de observación del torneo son deterministas.
- **No hardcodear coordenadas a secas.** Un screenshot + *template matching*
  (OpenCV) para encontrar el botón antes de clickearlo cuesta unas líneas más y
  sobrevive a que Yostar mueva la interfaz. Sin eso, cada actualización del
  cliente rompe la transmisión.
- **Verificar después de clickear:** el cerebro sabe qué mesa debería estar en
  pantalla; si a los 10 s el cliente no está observando esa partida, se
  reintenta. Nunca dar por hecho que el clic funcionó.
- **Sonido:** Chromium hacia un *null sink* de PulseAudio, para poder bajarle el
  volumen al juego cuando alguien habla en Discord.
- **Lo que hay que tapar con el overlay:** chat del observador, botones de
  emote, y el nombre de la cuenta espectadora.

Esto es lo más frágil del proyecto y no tiene vuelta: es el precio de que se
vean los personajes.

## 4. Cuántas mesas se pueden ver a la vez (el límite real)

Dos límites, y el segundo es el que duele:

1. **GPU.** Cada cliente es un juego 3D corriendo. Cuántas instancias aguanta
   una máquina hay que **medirlo**, no estimarlo (fase 0). Un PC con GPU dedicada
   moderna debería con varias a 640×360; una instancia AWS `g4dn.xlarge` (una T4)
   probablemente con 2–4.
2. **Cuentas.** **Mahjong Soul admite una sola sesión por cuenta** — está
   documentado en `calendar-paipus.yml:26` y es la razón del `concurrency`
   compartido entre los dos workflows. Un cliente observando = una sesión. Por
   lo tanto **6 mesas capturadas al mismo tiempo = 6 cuentas de Yostar
   simultáneas**, más una para el cerebro, más la que ya usa el pipeline. Crear
   seis cuentas desechables para esto es trabajo, es incómodo frente al ToS de
   Yostar, y es una cuenta más que puede quedar mal logueada justo el día de la
   sesión.

Por eso la recomendación es **no** hacer mosaico de seis clientes:

| Montaje | Cuentas | GPU | Veredicto |
| --- | --- | --- | --- |
| **Realización con 1 cámara** | 2 (cámara + cerebro) | 1 instancia | **Recomendado.** La señal sigue la mesa caliente; las otras cinco viven en el overlay con marcador en vivo. |
| Realización con 2 cámaras | 3 | 2 instancias | Corte instantáneo entre mesas, sin esperar a que el cliente entre a la otra. Vale la pena si la fase 0 muestra que cambiar de mesa demora >5 s. |
| Mosaico 2×3 de clientes reales | 7 | 6 instancias | Caro en cuentas, en GPU y en riesgo. Sólo si algún día sobra máquina. |

Con una cámara, "cada partida en vivo" se cumple así: **la mesa destacada se ve
completa y las otras cinco se ven en un marcador permanente que se actualiza
jugada a jugada**, con corte automático cuando algo pasa en otra (riichi, tenpai
final, South-4 apretado, yakuman en camino). Es exactamente cómo se televisa un
torneo de golf o de póker, y es el montaje más barato.

Además, el cerebro puede observar las 6 mesas **con una sola cuenta** si el
servidor permite varios `authObserve` en paralelo desde el mismo lobby — **falta
confirmarlo en la fase 0**. Si no lo permite, el cerebro se limita a la lista de
mesas y a los marcadores que trae `fetchCustomizedContestGameLiveList`.

## 5. Opción A — PC local (la más barata: $0)

Un PC con GPU dedicada —el de cualquiera que juegue— alcanza. La pieza de
software es la misma que en AWS.

```
Calendario (Google Sheets) ──▶ run.sh: abre la ventana de emisión
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
 cerebro.py                  Chromium + Majsoul        discord-audio.mjs
 (protocolo, 6 mesas)        (espectador, 1 mesa)      (bot de voz → PCM)
        │                         │                          │
        │ ws://localhost           │ captura de ventana       │
        ▼                         ▼                          ▼
 overlay.html ─────────────▶  OBS / ffmpeg  ◀────────────────┘
   (marcadores, nombres        x264 720p30, audio del juego
    de liga, tabla)            atenuado bajo la voz
                                  │
                          rtmp ──▶ Twitch  +  YouTube (muxer tee, un solo encode)
```

**A0 — asistido, para empezar (1 día).** El comentarista abre el cliente y OBS
en su PC, con el overlay como *browser source* y el audio de escritorio del
Discord que ya tiene abierto. Sin bot, sin automatización de clics. Con esto se
transmite la primera sesión **este mes** y se aprende qué hace falta de verdad.

**A1 — automático.** `run.sh` levanta las tres piezas, disparado por un
systemd-timer que lee el `Calendario` con `scripts/gsheets.py`.

**Costos A:** $0 de servicios. La subida de una señal 720p30 son ~3 Mbps; 1080p30
~6 Mbps. Cualquier fibra chilena sirve.

**Riesgo A:** depende de que ese PC esté encendido, con luz y con internet.

## 6. Opción B — AWS

Ahora la máquina necesita GPU, así que el costo sube respecto de lo que costaría
un tablero dibujado:

- **Instancia:** `g4dn.xlarge` (1× T4, 4 vCPU) ≈ **US$0,526/h** on-demand en
  `us-east-1`; spot suele andar en US$0,16–0,21/h. Para dos cámaras,
  `g4dn.2xlarge` ≈ US$0,75/h. **Precios de referencia, verificar**: São Paulo es
  bastante más caro y conviene comparar con la latencia al ingest de Twitch.
- **Encendido/apagado:** EventBridge Scheduler → Lambda → `StartInstances` /
  `StopInstances` según el `Calendario`. Apagada no cobra cómputo.
- **Cuidado:** las instancias G necesitan **aumento de cuota de vCPU** en la
  cuenta, y AWS se puede demorar días en aprobarlo. Pedirlo antes, no la semana
  de la primera transmisión.

| Escenario (60 h de emisión por temporada) | Cómputo | Egreso | Disco | Total temporada |
| --- | --- | --- | --- | --- |
| 1 cámara, `g4dn.xlarge` on-demand | ≈ **$32** | ~95 GB, primeros 100 GB/mes gratis ≈ **$0** | 50 GB gp3 × 4 meses ≈ **$16** | **≈ $48** |
| 1 cámara, spot | ≈ **$12** | ≈ **$0** | ≈ **$16** | **≈ $28** |
| 2 cámaras, `g4dn.2xlarge` on-demand | ≈ **$45** | ≈ **$0** | ≈ **$16** | **≈ $61** |

El disco pesa porque una AMI con driver NVIDIA + Chromium + perfil no baja de
~50 GB y se paga todo el mes, no sólo las horas de emisión. Se puede recortar
con snapshot y recrear la instancia cada sesión, a cambio de más piezas móviles.

**Descartados:**

- *AWS Elemental MediaLive* — cobra por canal-hora (orden de US$1–3/h): entre 10
  y 30× hacer lo mismo con ffmpeg en la EC2 que ya está encendida.
- *Instancia sin GPU* — el cliente sobre software rendering (SwiftShader) va a
  ir a tirones. Se puede medir en la fase 0, pero no contar con eso.
- *GitHub Actions* — 6 h de tope, sin red apta para RTMP, y sería abuso del
  servicio.

Ojo con lo que muestra la tabla: **el requisito de GPU es lo que hace que AWS
cueste 5–7× lo que costaría el camino sin captura**. Si algún día molesta,
comparar con un VPS con GPU de otro proveedor, que para esta carga suele ser
bastante más barato que AWS.

## 7. Audio de Discord

- Bot con `@discordjs/voice` + `prism-media`: entra al canal, se suscribe a cada
  hablante, decodifica Opus → PCM 48 kHz estéreo, mezcla y lo entrega a ffmpeg
  por pipe (`-f s16le -ar 48000 -ac 2 -i pipe:3`).
- **Bot, nunca cuenta de usuario.** Automatizar una cuenta personal (selfbot)
  viola el ToS de Discord. La recepción de voz por bot no está documentada pero
  la biblioteca la soporta y es práctica corriente.
- **Avisar que se graba**, con mensaje fijo en el canal y aviso del bot al entrar.
- **Ducking:** el audio del juego baja ~12 dB cuando hay voz. En OBS es un filtro
  de compresor con sidechain; en ffmpeg, `sidechaincompress`.
- **Sincronía:** la vista de espectador de Mahjong Soul ya llega con **5 minutos
  de retardo** (por defecto del juego). Los comentaristas ven lo mismo que la
  cámara, con el mismo atraso, así que el comentario calza solo. Nadie debe
  mirar la partida por un camino sin ese retardo.
- El roster ya trae el Discord de cada jugador (`PRIVATE_PLAYER_FIELDS`): sirve
  para rotular quién habla **con nombre de liga**. El handle no se publica nunca,
  igual que en el bot de `/agendar`.

## 8. Guardado para después: modo análisis

El cerebro por protocolo puede, además, dibujar la mesa desde cero: `tile-art.js`
ya tiene las 37 caras en SVG (FluffyStuff, CC0) y `tiles.jsx` ya las pinta. Eso
**no** reemplaza la transmisión —no tiene los personajes— pero da una vista
sobria y limpia que sirve para:

- **segmentos de análisis**: congelar una mano, mostrar las cuatro manos, los
  descartes y el cálculo de puntos, sin depender de que el cliente esté en la
  posición correcta;
- **una señal secundaria** en YouTube con las seis mesas en modo tablero, para
  quien quiera seguir una mesa que la cámara no está mostrando;
- **piezas para redes** después de la sesión.

Es trabajo aparte y no bloquea nada de lo anterior. Anotado para no perderlo.

## 9. Riesgos y decisiones abiertas

1. **Actualizaciones del cliente rompen los clics.** Mitigado con template
   matching y verificación posterior, no eliminado. Hay que asumir que alguna
   sesión va a requerir arreglo manual.
2. **Cuentas espectadoras.** Una por cámara, más una para el cerebro. Ver §4.
   Conviene que sean cuentas de staff con consentimiento, no cuentas creadas en
   serie para esto.
3. **Choque con el pipeline.** El observador del cerebro conectado 3 h sería
   expulsado por `sync-data.yml`, que corre cada 15 min con la cuenta del
   pipeline. Cuenta distinta (ya contemplado) o pausar la sincronización durante
   la sesión.
4. **`observer_switch` de las salas A y B**: confirmar que los torneos permiten
   observadores y con qué nivel (si muestra o no las manos ocultas).
5. **Ritmo de peticiones.** El repo ya se quemó con el 540 de `fetchGameRecord`
   (`PAIPU_REQUEST_DELAY_SECONDS = 20`). El *live list* es barato, pero conviene
   45–60 s entre sondeos y el mismo enfriamiento ante un 540.
6. **Secretos.** Claves RTMP, token del bot y credenciales de las cuentas
   espectadoras **no pueden entrar al repo**: es público y `data/generated.js` se
   sirve tal cual. `.env` local fuera de git, o SSM Parameter Store en AWS.
7. **Suplentes y bots.** Un asiento puede ser un suplente ajeno al torneo: el
   overlay debe caer a "Suplente" sin publicar identidad, como el resto del
   pipeline.
8. **Emparejar la partida con la mesa del calendario** ya está resuelto:
   `match_games` en `scripts/fill_calendar_paipus.py` asocia por coincidencia de
   ≥3 de 4 jugadores. Se reutiliza para rotular "A · Sesión 3 · Mesa 2".
9. **Aviso** de que es una transmisión de la liga, no oficial de Yostar.

## 10. Plan por fases

| Fase | Qué entrega | Esfuerzo |
| --- | --- | --- |
| 0 | **Medición, antes de escribir nada serio.** Cuántos clientes aguanta la máquina; cuánto demora entrar a observar una mesa; si el cerebro puede observar 6 mesas con una cuenta; si el retardo de 5 min aplica al camino de websocket. | 1–2 días |
| 1 | **A0 al aire:** OBS manual + overlay estático. Primera sesión transmitida, sin automatización. | 1 día |
| 2 | Cerebro: lista de mesas en vivo + marcadores + nombres de liga → overlay dinámico. | 3–4 días |
| 3 | Automatización del cliente: entrar a observar por template matching, con verificación y reintento. | 3–5 días |
| 4 | Realizador: heurística de mesa caliente y corte automático. | 2 días |
| 5 | Bot de voz de Discord + ducking. | 2–3 días |
| 6 | Orquestación por `Calendario` y apagado automático. | 2 días |
| 7 | (Opcional) Mover el conjunto a EC2 con GPU y encendido programado. | 1–2 días |

## 11. Archivos que tocaría

```
stream/
├── cerebro.py          # protocolo: mesas en vivo, marcadores, eventos (reusa majsoul.py)
├── camara.py           # Playwright + template matching sobre el canvas del cliente
├── overlay.html        # marcadores, nombres de liga, tabla (browser source de OBS)
├── overlay.jsx         # usa generated.js; tiles.jsx sólo si se hace el modo análisis
├── discord-audio.mjs   # bot de voz → PCM por pipe
├── schedule.py         # ventana de emisión desde la hoja Calendario (gsheets.py)
└── run.sh              # levanta todo y arma la línea de ffmpeg
```

Hay que **agregar `stream/` al `.vercelignore`**: hoy excluye `tests/`,
`reports/` y los `.md`, pero subiría una carpeta nueva de la raíz sin necesidad.
