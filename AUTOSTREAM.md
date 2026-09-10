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
- **La transmisión también entra a Discord** para que los comentaristas la vean,
  y el audio de ese canal sale al aire.

## 1. El circuito completo

```
   Mahjong Soul                    ┌──────────────────────────────┐
   (cuenta "cámara",               │            OBS               │
    modo espectador) ──ventana────▶│  escena: juego + overlay     │
                                   │  audio: juego (atenuado)     │
   overlay.html ──browser source──▶│         + voces de Discord   │
   (Calendario + generated.js)     └──────┬───────────┬───────────┘
                                          │           │
                                    rtmp  │           │  Go Live (cuenta normal)
                                          ▼           ▼
                             Twitch  +  YouTube    Discord #comentarios
                                                        │  (los comentaristas
                                                        │   ven la señal acá)
                                                        │
                             discord-audio.mjs ◀── voces del canal
                                    │
                                    └──PCM──▶ de vuelta a OBS
```

Dos direcciones distintas y conviene no confundirlas:

- **Ida (video):** la máquina entra al canal de voz y hace **Go Live** con la
  señal. Los comentaristas ven exactamente los mismos pixeles que salen al aire,
  con menos de un segundo de atraso. Esto es lo que mantiene el comentario
  pegado a la imagen.
- **Vuelta (audio):** un bot escucha las voces del canal y las devuelve a OBS
  como pista de audio.

**El eco.** Si la ida llevara el audio del juego, el bot lo volvería a capturar y
saldría duplicado y desfasado. Solución: **el Go Live va sin audio de juego**
(sólo video), y el sonido del juego lo agrega OBS localmente. Los comentaristas
no escuchan los efectos del juego por Discord; si les molesta, que abran su
propio cliente como espectadores, que ya viene con el mismo retardo de 5 min.

## 2. Ida: por qué una cuenta normal y no un bot

**Un bot de Discord no puede hacer Go Live.** La API oficial le permite a un bot
*enviar y recibir audio* en un canal de voz, pero **no compartir pantalla ni
enviar video**: eso no está expuesto para cuentas de bot. Las bibliotecas que lo
logran lo hacen con una cuenta de usuario y por caminos no soportados.

Entonces, como dijiste, **cuenta normal**. Dos maneras:

- **Manual (recomendado para empezar):** la cuenta de la liga queda logueada en
  el Discord de escritorio de la máquina, y alguien hace clic en *Go Live* una
  vez al empezar la sesión. Cero automatización, cero zona gris de ToS, dos
  segundos de trabajo.
- **Automático:** `xdotool` sobre la ventana del Discord de escritorio hace ese
  clic solo cuando arranca la ventana de emisión. Funciona, pero automatizar una
  cuenta de usuario es zona gris del ToS de Discord y se rompe cuando cambian el
  layout de la app.

Sugerencia: manual la primera temporada. Es el único clic humano de todo el
circuito y no vale la pena arriesgar la cuenta por ahorrárselo.

Detalle de calidad: sin Nitro, el Go Live llega hasta 720p30, que sobra para
comentar. Con Nitro sube a 1080p60.

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
- **YouTube sale casi gratis:** el muxer `tee` de ffmpeg manda el **mismo
  encode** a los dos destinos, sin costo extra de CPU. YouTube tiene *stream key*
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
3. **Sincronía comentario ↔ imagen.** El Go Live la resuelve. Lo que la rompe es
   que un comentarista mire la partida por un camino sin el retardo de 5 min.
4. **Suplentes.** Un asiento puede ser un suplente ajeno al torneo: el overlay
   debe caer a "Suplente" sin publicar identidad, como el resto del pipeline.
5. **Aviso** de que es una transmisión de la liga, no oficial de Yostar.

## 10. Plan por fases

| Fase | Qué entrega | Esfuerzo |
| --- | --- | --- |
| 0 | **Medición.** Web vs Steam en la máquina real: fps, estabilidad, cuánto demora entrar a observar. Confirmar cómo se vincula la cuenta en Steam. | 1–2 días |
| 1 | **Primera sesión al aire, manual.** Cliente + OBS + Go Live a mano, overlay estático con la mesa del día. Se transmite este mes y se aprende qué falta. | 1 día |
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
├── twitch.mjs          # título y categoría antes de emitir
├── schedule.py         # ventana de emisión desde la hoja Calendario (gsheets.py)
└── run.sh              # levanta todo y arma la línea de ffmpeg
```

Hay que **agregar `stream/` al `.vercelignore`**: hoy excluye `tests/`,
`reports/` y los `.md`, pero subiría una carpeta nueva de la raíz sin necesidad.
