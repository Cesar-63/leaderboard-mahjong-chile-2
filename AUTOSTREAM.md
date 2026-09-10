# Auto-streamer de la liga (Twitch / YouTube + Discord)

Evaluación técnica, no implementación.

## 0. Decisiones ya tomadas

Esto no se re-discute en el resto del documento:

- **La imagen es el cliente de Mahjong Soul tal cual**: personajes, avatares,
  personalidades, animaciones. Se captura pantalla. Un tablero dibujado por
  nosotros no sirve.
- **Una partida a la vez.** En la práctica la liga tiende a tener una sola mesa
  en vivo, así que **una cuenta filmando** alcanza. Nada de realización entre
  mesas ni mosaicos.
- **Tener varias cuentas de Mahjong Soul no es problema**, siempre que no las
  baneen.
- **Nada por protocolo, por ahora.** Ver §6.
- **Canal propio de Twitch** (tipo *Liga Mahjong Chile TV*), no el canal personal
  de nadie.
- **Los comentaristas ven la señal por una URL** (WebRTC), no por Twitch ni por
  Go Live de Discord, y el audio de su canal de voz sale al aire.

## 1. El circuito completo

```
  PC de la casa                                  VPS (US$5/mes)
  ─────────────                                  ──────────────
  Mahjong Soul (cuenta "cámara")
        │ ventana
        ▼
  ┌──────────────────────────────┐
  │ OBS                          │
  │  video: juego + overlay      │
  │  pista 1: juego + voces      │──stream, con retardo──▶ ffmpeg -c copy ──▶ Twitch
  │  pista 2: juego solo         │                                      └──▶ YouTube
  │                              │
  │  salida grabación, SIN retardo│──srt──────────────────▶ mediamtx ──▶ https://…/mesa
  └──────────────────────────────┘                                       (WebRTC, ~0,4 s)
        ▲                                                                      │
        │ PCM                                                                  │ los
  discord-audio.mjs ◀── voces del canal ── Discord ◀────────────────────────────┘ comentaristas
                                                                                abren la URL
```

Tres flujos y ninguno se pisa:

- **Programa** → Twitch y YouTube, con el retardo de sincronía puesto.
- **Monitor** → los comentaristas, sin retardo, por una URL.
- **Voces** → vuelven a OBS y entran al programa.

El VPS hace dos trabajos chicos: duplicar el programa hacia las dos plataformas
y servir el monitor. Eso deja la subida de la casa en ~9 Mbps fijos, sin importar
cuántos comentaristas haya —cada uno tira del VPS, no del PC—, y evita darles la
IP de la casa.

## 2. El monitor de los comentaristas

Los comentaristas necesitan ver la partida **con muy poco atraso respecto de lo
que sale al aire**. Si se apoyan en el stream de Twitch comentan sobre algo que
el espectador vio hace 10–20 s, y el comentario llega tarde toda la transmisión.

**Y no se arregla retrasando la salida.** Es tentador pensar "si su monitor
atrasa 15 s, atraso yo el video 15 s y calza", pero el monitor está *después* de
ese retardo: atrasarlo todo también atrasa lo que ellos ven y el desfase queda
igual. Es un lazo que se persigue la cola. **El monitor tiene que ser una toma
aparte, anterior al retardo de programa.**

### La solución elegida: WebRTC con MediaMTX

Los comentaristas **abren una URL en el navegador y ya**. Nada que instalar,
ninguna cuenta, ningún cliente. Funciona igual en el teléfono.

- **`mediamtx`** es un binario único de Go, sin dependencias, que recibe la toma
  y la sirve por WebRTC. Trae **su propio reproductor web**: publicando en la
  ruta `mesa`, la dirección para mirar es `https://<host>:8889/mesa`.
- **La toma sale de OBS por la salida de *grabación***, configurada como *Salida
  personalizada (FFmpeg)* hacia `srt://<vps>:8890?streamid=publish:mesa`. Sin
  plugins: la salida de grabación y la de stream son independientes, y el
  **retardo de transmisión** de OBS afecta **sólo a la de stream**.
- **Atraso esperado:** ~0,1 s de encode + ~0,15 s del salto SRT + ~0,1 s de
  WebRTC ≈ **0,3–0,5 s**.
- **Certificado HTTPS:** MediaMTX lo sirve nativo con Let's Encrypt. Conviene,
  porque los navegadores tratan mucho mejor a un origen seguro.

### Dos detalles que hay que hacer bien

1. **La toma NO puede llevar las voces.** Si las lleva, cada comentarista se
   escucha a sí mismo medio segundo después y es insoportable. OBS tiene **seis
   pistas de audio** y la salida personalizada elige cuál usa: **pista 1 = juego
   + voces** (programa), **pista 2 = juego solo** (monitor). Nativo, sin plugins.
2. **Códec compatible con WebRTC:** H.264 *baseline* o *main*, **sin B-frames**,
   keyframe cada 1–2 s, `tune=zerolatency`; audio en **Opus**, que es el único
   que WebRTC acepta sin transcodificar. Si el contenedor pelea con Opus, el
   plan B es RTMP hacia el VPS y un `ffmpeg` ahí que convierta sólo el audio.

### El retardo que cierra la cuenta

Con el monitor andando, el desfase restante se corrige con una perilla:

> **`Ajustes → Avanzado → Retardo de transmisión` = latencia del monitor +
> latencia del audio de vuelta** ≈ 0,4 s + 0,3 s ≈ **1 s** (medir, no adivinar).

Así el comentario cae en el frame correcto. La reacción humana no se compensa:
que el comentario llegue un pelo después de la jugada es lo natural en
televisión.

Para medirlo: un reloj con milisegundos en pantalla, se fotografían juntas la
señal de programa y el monitor, se resta. Diez minutos, una sola vez.

### Costo

Un VPS de **US$5/mes** con IP pública (Lightsail incluye 2 TB de tráfico; el
consumo estimado es ~200 GB por temporada). Si algún día la máquina de captura
se va a AWS, `mediamtx` se muda a esa misma instancia y el VPS desaparece.

### Descartadas

| Camino | Por qué no |
| --- | --- |
| Que cada uno espectee la mesa en su cliente | Descartado por César. |
| Parsec / Moonlight | Mejor latencia de todas (<100 ms), pero exige que cada comentarista instale. Descartado. |
| Discord Go Live | Anda bien (~0,5–1 s) pero **un bot no puede hacerlo**: la API no expone video a cuentas de bot, así que necesitaría una cuenta normal y alguien que apriete el botón. Queda como respaldo si el VPS falla. |
| Meet / Jitsi | Re-comprime, imagen peor, y una cuenta más de la que depender. |
| Twitch/YouTube en baja latencia | 2–5 s. Es el problema que estamos resolviendo. |

## 3. Vuelta: el bot de voz

- Bot con `@discordjs/voice` + `prism-media`: entra al canal, se suscribe a cada
  hablante, decodifica Opus → PCM 48 kHz estéreo, mezcla y lo entrega a OBS o a
  ffmpeg por pipe (`-f s16le -ar 48000 -ac 2 -i pipe:3`).
- Acá **sí corresponde un bot** (recibir audio es lo único que la API le permite
  y es exactamente lo que necesitamos), con `GuildVoiceStates` en los intents.
- **Avisar que se graba:** mensaje fijo en el canal y aviso del bot al entrar.
- **Ducking:** el audio del juego baja ~12 dB cuando alguien habla. En OBS es un
  compresor con sidechain; en ffmpeg, `sidechaincompress`.
- El roster ya trae el Discord de cada jugador (`PRIVATE_PLAYER_FIELDS`): sirve
  para rotular quién habla **con nombre de liga**. El handle no se publica nunca,
  igual que en el bot de `/agendar`.

## 4. La cuenta de Twitch (y YouTube de yapa)

- **Emitir es sólo empujar RTMP a la *stream key*** del canal. No hace falta API
  ni OAuth para salir al aire. La key va en un `.env` fuera de git — el repo es
  público.
- **Título y categoría automáticos, eso sí, valen la pena:** un `PATCH` a
  *Modify Channel Information* de la API de Twitch deja el canal como
  "División A · Sesión 3 · Mesa 2" y la categoría en *Mahjong Soul* antes de
  arrancar. Los datos salen del `Calendario`, que ya los tiene.
- **YouTube sale casi gratis y no lo paga la casa:** OBS manda **un** programa al
  VPS y ahí un `ffmpeg -c copy` lo reparte a las dos plataformas, sin
  re-codificar y sin duplicar la subida del PC. YouTube tiene *stream key*
  persistente, así que tampoco necesita API.
- **Resolución:** sin partner, Twitch no garantiza transcodes; quien tenga mala
  conexión se queda sin opción de calidad. 720p60 a ~4,5 Mbps es más amable que
  1080p.
- **El VOD queda solo** si se activan las *Past Broadcasts* del canal. Vale la
  pena: sirve para las cápsulas de la web.

## 5. La máquina y la automatización del cliente

**Opción A — PC local con GPU dedicada: $0.** Es la recomendación. El cliente es
un juego 3D, así que GPU hay que tener; el PC de cualquiera que juegue alcanza y
sobra para una sola instancia.

**Opción B — AWS,** si molesta depender de un PC encendido: `g4dn.xlarge` (1× T4)
≈ US$0,526/h on-demand, ~US$0,16–0,21/h en spot, encendida sólo durante la
ventana de sesión con EventBridge → Lambda → `StartInstances`/`StopInstances`.
Con ~60 h de emisión por temporada: **≈US$48** on-demand o **≈US$28** en spot,
incluyendo ~US$16 de disco (una AMI con driver NVIDIA no baja de 50 GB y se paga
todo el mes). El egreso cae dentro de los 100 GB/mes gratis. **Pedir el aumento
de cuota de vCPU para instancias G con anticipación**: AWS se demora días.
Descartado MediaLive: cobra por canal-hora, 10–30× más caro que ffmpeg en la
misma instancia.

**Automatizar los clics.** El cliente web es un canvas WebGL: **no hay botones en
el DOM**, así que hay que clickear por coordenadas sobre la ventana.

- Resolución fija, idioma fijo y perfil persistente para no repetir el login.
- **Template matching (OpenCV) sobre un screenshot** para encontrar el botón de
  observar antes de clickear, en vez de coordenadas quemadas. Sobrevive a que
  Yostar mueva la interfaz; sin eso, cada actualización del cliente rompe la
  transmisión.
- **Verificar y reintentar:** si a los 10 s no está observando, se repite. Nunca
  dar por hecho que el clic funcionó.
- **Qué mesa es:** el `Calendario` ya sabe quién juega a qué hora, y con eso se
  arma el overlay. Como refinamiento, un OCR (`tesseract`) sobre la lista de
  observación permite confirmar contra el roster que la mesa en pantalla es la
  esperada.
- **Tapar con el overlay:** chat del observador, botones de emote y el nombre de
  la cuenta espectadora.

Esta es la parte frágil del proyecto y no tiene vuelta: es el precio de que se
vean los personajes.

**Si dos mesas se solapan** —que pasa poco— hay dos caminos: una segunda cuenta
cámara con su propia instancia, o una regla simple de prioridad (la que empezó
antes) y la otra queda sólo en paipu. Con una sola cuenta, prioridad; ya que las
cuentas no son problema, la segunda cámara es una decisión de máquina, no de
diseño.

## 6. Cuentas de Mahjong Soul y riesgo de baneo

Tu preocupación es la correcta, aunque el motivo probablemente no sea el ancho de
banda: **una conexión por protocolo gasta muchísimo menos que el propio cliente**
(son unos pocos KB por segundo contra un juego 3D descargando assets). Lo que
efectivamente puede molestar es que es un **cliente no oficial**, y eso ya lo
sabemos de primera mano: el pipeline se comió un `540` de `fetchGameRecord` por
pedir 24 paipus seguidos, y por eso hoy corre a `PAIPU_REQUEST_DELAY_SECONDS =
20` y `MAX_RECORDS_PER_RUN = 3`.

Decisión, coherente con eso: **la transmisión no toca el protocolo**. La cuenta
cámara hace exactamente lo que hace cualquier espectador —abrir el cliente y
mirar—, que es el uso más normal que existe. La exposición al protocolo se queda
donde ya está: el pipeline de datos, con su cuenta, su ritmo lento y su
`concurrency` compartido.

Lo único a cuidar con la cuenta cámara: que sea una cuenta de la organización con
su correo, no una creada en serie, y que no se use para nada más.

## 7. Anotado: Mahjong Soul por Steam

No es prioridad, pero para la cuenta cámara **puede ser mejor que el navegador**,
y conviene medirlo en la fase 0 junto con la opción web:

**A favor**

- Ventana nativa: la captura de OBS es más limpia y estable que capturar una
  pestaña, y no hay riesgo de que el navegador suspenda la pestaña en segundo
  plano ni de que una actualización de Chromium cambie el comportamiento.
- Suele rendir mejor y más parejo que el WebGL, que es justo lo que se nota en
  una transmisión.
- Menos piezas: sin perfil de Chromium, sin flags, sin cookies que expiren.

**En contra**

- Es una app de Windows. En Linux hay que pasar por Proton/Wine —factible pero
  una capa más de cosas que se rompen—, y en AWS obligaría a una instancia
  Windows, con licencia y una imagen más pesada.
- Steam se auto-actualiza y a veces abre ventanas encima justo cuando no
  corresponde. Hay que dejarlo en modo silencioso y sin *overlay*.
- **Los clics siguen siendo por coordenadas**: cambiar de navegador a app nativa
  no arregla la parte frágil, sólo la mueve.
- **Verificar antes de comprometerse:** cómo se relaciona el login de Steam con
  una cuenta Yostar existente (si se puede vincular la cuenta de la liga o si la
  versión de Steam crea la suya). Ese detalle decide si la cuenta cámara puede
  ser la misma en los dos lados o si son dos cuentas distintas.

**Veredicto provisional:** para un PC local dedicado, la versión de Steam es
probablemente la mejor opción para la cámara. Para AWS, el navegador. Se prueban
las dos en la fase 0 y gana la que dé más fps y menos sorpresas.

## 8. Guardado para bien a futuro

Nada de esto se toca **ni esta temporada ni la próxima**. Queda anotado para no
perderlo:

- **Modo sobrio / tablero propio.** `tile-art.js` ya tiene las 37 caras en SVG
  (FluffyStuff, CC0) y `tiles.jsx` ya las pinta: se podría dibujar la mesa desde
  cero para segmentos de análisis, para una señal secundaria o para piezas de
  redes. No reemplaza la transmisión: no tiene los personajes.
- **Cerebro por protocolo.** Si algún día hay varias mesas simultáneas, el
  protocolo (`fetchCustomizedContestGameLiveList`, `createGameObserveAuth`,
  `authObserve`/`startObserve`, y los mismos mensajes `Record*` que
  `scripts/majsoul.py:511` ya decodifica) permitiría saber dónde está la acción y
  cortar automáticamente, sin emitir un pixel suyo. Hoy no hace falta y agrega
  riesgo de cuenta.

## 9. Riesgos

1. **Actualizaciones del cliente rompen los clics.** Mitigado con template
   matching y verificación, no eliminado. Alguna sesión va a requerir arreglo a
   mano.
2. **Secretos.** Stream key de Twitch/YouTube, token del bot y credenciales de la
   cuenta cámara **no pueden entrar al repo**: es público y `data/generated.js`
   se sirve tal cual. `.env` fuera de git, o SSM Parameter Store en AWS.
3. **Sincronía comentario ↔ imagen.** La resuelven el monitor WebRTC de §2 y el
   retardo de transmisión de OBS. Lo que la rompe es que un comentarista se
   apoye en el stream de Twitch.
4. **El VPS es un punto único de falla** en vivo: si se cae, se caen el monitor y
   la salida a las dos plataformas. Respaldo ensayado: apuntar OBS directo a
   Twitch y que los comentaristas se apoyen en Discord mientras tanto. Vale la
   pena tener las dos configuraciones guardadas en OBS como perfiles.
5. **Suplentes.** Un asiento puede ser un suplente ajeno al torneo: el overlay
   debe caer a "Suplente" sin publicar identidad, como el resto del pipeline.
6. **Aviso** de que es una transmisión de la liga, no oficial de Yostar.

## 10. Plan por fases

| Fase | Qué entrega | Esfuerzo |
| --- | --- | --- |
| 0 | **Medición.** Web vs Steam en la máquina real: fps, estabilidad, cuánto demora entrar a observar. Confirmar cómo se vincula la cuenta en Steam. | 1–2 días |
| 0 bis | **Monitor WebRTC:** VPS con `mediamtx`, toma desde OBS, medir latencia real y fijar el retardo de transmisión. | medio día |
| 1 | **Primera sesión al aire, manual.** Cliente + OBS + monitor elegido, overlay estático con la mesa del día. Se transmite este mes y se aprende qué falta. | 1 día |
| 2 | Overlay dinámico desde `Calendario` + `data/generated.js`: mesa, jugadores con nombre de liga, bandera, puntos y posición. | 2–3 días |
| 3 | Bot de voz de Discord + ducking. | 2–3 días |
| 4 | Automatizar el cliente: entrar a observar por template matching, con verificación y reintento. | 3–5 días |
| 5 | Orquestación por `Calendario`: encender, fijar título y categoría en Twitch, emitir, apagar. | 2 días |
| 6 | (Opcional) Go Live automático con `xdotool`, y/o mover todo a EC2 con GPU. | 1–2 días |

## 11. Archivos que tocaría

```
stream/
├── camara.py           # abre el cliente y entra a observar (template matching)
├── overlay.html        # browser source de OBS
├── overlay.jsx         # mesa, jugadores, puntos (usa generated.js)
├── discord-audio.mjs   # bot de voz → PCM
├── mediamtx.yml        # config del monitor WebRTC (VPS)
├── twitch.mjs          # título y categoría antes de emitir
├── schedule.py         # ventana de emisión desde la hoja Calendario (gsheets.py)
└── run.sh              # levanta todo y arma la línea de ffmpeg
```

Hay que **agregar `stream/` al `.vercelignore`**: hoy excluye `tests/`,
`reports/` y los `.md`, pero subiría una carpeta nueva de la raíz sin necesidad.
