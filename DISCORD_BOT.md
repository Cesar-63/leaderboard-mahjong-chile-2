# Bot de Discord — agendar mesas

`/agendar` escribe la fecha y la hora de una mesa directamente en la hoja
**Calendario** de la planilla. El sincronizador la levanta en la corrida
siguiente (`sync-data.yml` corre cada 15 minutos) y el sitio se actualiza solo.

```
/agendar cuando:<t:1784424600:F>
```

En un hilo llamado `A · Sesión 3 · Mesa 2` eso alcanza: el bot deduce división,
sesión y mesa del nombre del hilo, y responde en el hilo para que la vean los
cuatro jugadores.

## Qué acepta el campo `cuando`

| Forma | Ejemplo |
| --- | --- |
| Tag de timestamp de Discord | `<t:1784424600:F>` |
| Epoch en segundos o milisegundos | `1784424600` |
| Fecha y hora escritas, en hora chilena | `18-07-2026 21:30`, `18/07 21:30`, `2026-07-18 21:30`, `18 de julio a las 9:30 pm` |

El tag es el camino recomendado: lo genera cualquiera de los sitios de
timestamps de Discord, no depende del huso de quien escribe y la confirmación
del bot vuelve como tag, así que cada jugador la lee en su propia hora.

Sin año, se asume el año en curso. La hora se interpreta y se guarda en hora
local chilena (`America/Santiago`, con horario de verano incluido), que es lo
que dice la columna "Hora (CLT)" de la planilla. Se puede fijar otro huso con
`LEAGUE_TIMEZONE`.

## Cómo deduce la mesa

En cascada, y gana el primero que tenga el dato:

1. Las opciones explícitas del comando: `division`, `sesion`, `mesa`.
2. El nombre del hilo o canal donde se escribió.
3. El nombre del canal padre, si el hilo no alcanza (requiere `DISCORD_BOT_TOKEN`).

Del nombre se reconocen, sin distinguir mayúsculas, acentos ni separadores:

```
a-s3-m2          A · Sesión 3 · Mesa 2        liga-b-sesion-4-mesa-1
divisionA-S2-T5  🀄 Liga A | Sesión 1 | Mesa 4
```

Un `Mesa 2` dentro de un canal `División A · Sesión 3` también funciona: los
dos nombres se combinan. Una letra `A`/`B` suelta sólo cuenta como división si
viene pegada a una sesión o una mesa, para que un canal `general` no pase por
División A.

Si falta algo, el bot lo dice y no escribe nada:

```
/agendar cuando:<t:1784424600:F> division:A sesion:3 mesa:2
```

## Quién puede usarlo

- **Los cuatro jugadores de esa mesa.** El bot compara el usuario de Discord de
  quien invoca contra la columna **Discord** de `Jugadores Liga A` / `Jugadores
  Liga B`, y exige que el jugador esté sentado en esa mesa del Calendario.
- **El rol @Staff**, que puede agendar cualquier mesa.

Dos guardas más:

- Una mesa que **ya tiene paipu en G1** no la reagenda un jugador: sólo @Staff,
  y con un aviso en la respuesta.
- Una mesa sin jugadores publicados en el Calendario se rechaza.

> **Ojo con la columna Discord.** Se compara contra el nombre de usuario, el
> nombre para mostrar y el apodo del servidor. En el roster de la temporada 3
> hay handles cargados como nombre de pantalla (`Pablov`, `Kychiel`) en vez de
> nombre de usuario: esos jugadores van a ser rechazados si su nombre para
> mostrar cambió. Corregir la celda en la planilla lo arregla sin tocar código.

## Puesta en marcha

### 1. Aplicación de Discord

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** → crear el bot y copiar el *token* (`DISCORD_BOT_TOKEN`).
3. **General Information** → copiar *Application ID* y *Public Key*.
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; sin
   permisos especiales (el bot no manda mensajes por su cuenta, sólo responde
   interacciones). Invitar el bot al servidor de la liga.

### 2. Cuenta de servicio de Google

El pipeline lee la planilla por el export público y no necesita credenciales;
escribir sí.

1. Google Cloud Console → proyecto nuevo o existente → habilitar **Google
   Sheets API**.
2. **IAM → Cuentas de servicio** → crear una → **Claves** → *Agregar clave* →
   JSON. Se descarga un archivo con `client_email` y `private_key`.
3. Compartir la planilla de la liga con ese `client_email` como **Editor**.
4. Codificar el JSON para pegarlo como variable de entorno:

   ```bash
   base64 -w0 credenciales.json
   ```

La cuenta de servicio sólo necesita acceso a esta planilla. Los cambios quedan
en el historial de versiones a su nombre, que es justamente lo que se quiere
para poder auditar quién movió una fecha.

### 3. Variables de entorno en Vercel

En *Project Settings → Environment Variables* (Production y Preview):

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `DISCORD_PUBLIC_KEY` | sí | Verificar la firma Ed25519 de cada interacción |
| `SHEET_ID` | sí | El id de la planilla (`spreadsheetId` de `sync-config.json`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | sí | El JSON de la cuenta de servicio, crudo o en base64 |
| `DISCORD_BOT_TOKEN` | recomendada | Leer el nombre del canal padre y resolver @Staff por nombre |
| `DISCORD_STAFF_ROLE_ID` | opcional | Id del rol de organizadores; evita depender del token de bot |
| `DISCORD_STAFF_ROLE_NAME` | opcional | Nombre del rol si no es `Staff` |
| `LEAGUE_TIMEZONE` | opcional | Huso de la liga; por defecto `America/Santiago` |

En vez de `GOOGLE_SERVICE_ACCOUNT_JSON` se pueden usar
`GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY` (con `\n` literales).

### 4. Conectar el endpoint

Desplegar, y después en el portal de Discord → **General Information** →
*Interactions Endpoint URL*:

```
https://<dominio-del-sitio>/api/discord
```

Discord manda un PING firmado al guardar; si la clave pública está bien, valida
al instante. Para confirmar que la función está viva y qué le falta configurar:

```bash
curl https://<dominio-del-sitio>/api/discord
```

Devuelve un JSON con `ready` y qué variables están puestas. No expone secretos.

### 5. Registrar el comando

```bash
DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... \
  node scripts/register_discord_commands.mjs
```

Con `DISCORD_GUILD_ID` el comando aparece al instante en ese servidor. Sin él se
registra global y Discord tarda hasta una hora en propagarlo. Hay que volver a
correrlo cada vez que cambien las opciones del comando.

## Qué escribe, exactamente

Dos celdas, las mismas que lee `scripts/sync.py`: la fecha en la fila `G1 − 2` y
la hora en la fila `G1 − 1`, en la columna de valores de esa mesa. Para
División A, sesión 3, mesa 2 son `Calendario!F25` y `Calendario!F26`.

Se escribe con `USER_ENTERED`, fecha en ISO (`2026-07-18`) y hora `21:30`:
Google las guarda como fecha y hora reales en cualquier locale, y la celda
conserva su formato, así que se sigue viendo "18 de julio". El bot pide el valor
de vuelta como número de serie para confirmarlo; si Google lo hubiera guardado
como texto, lo avisa en la respuesta, porque en ese caso `sync.py` lo leería
como "Por definir" sin fallar.

Nunca toca las celdas de paipu, ni el roster, ni el Game History.

## Arquitectura

```
api/
├── discord.mjs        el endpoint: firma, permisos, orquestación, respuesta
└── _lib/
    ├── verify.mjs     firma Ed25519 (el prefijo `_` la deja fuera del ruteo)
    ├── time.mjs       parseo de `cuando` y conversión de huso
    ├── target.mjs     nombre del hilo → división / sesión / mesa
    ├── sheets.mjs     cuenta de servicio, lectura y escritura de la planilla
    └── discord.mjs    llamadas a la API de Discord y armado de respuestas
scripts/register_discord_commands.mjs
tests/test_discord_bot.mjs
```

Sin dependencias de npm: la firma Ed25519, el JWT RS256 de Google y las
llamadas HTTP salen de `node:crypto` y `fetch`. El `package.json` de la raíz
sigue sin ser un toolchain (ver `CLAUDE.md`).

Discord da **3 segundos** para responder. Por eso la función responde de forma
síncrona en vez de diferir: el camino crítico son dos llamadas a Google (leer y
escribir), el token se cachea en el módulo mientras la lambda sigue tibia, y la
lectura de la planilla arranca en paralelo con las consultas a Discord.

## Tests

```bash
node --test tests/test_discord_bot.mjs
```

Cubren el parseo de fechas, la deducción de la mesa, la aritmética de celdas, la
verificación de firma y el `POST` completo con la red simulada (permisos de
jugador y de @Staff, mesa ya jugada, datos faltantes, fecha ilegible). Uno de
los tests relee las constantes de `scripts/sync.py`: si la planilla se reordena
y sólo se toca uno de los dos, falla.

## Problemas frecuentes

| Síntoma | Causa |
| --- | --- |
| Discord no acepta la *Interactions Endpoint URL* | `DISCORD_PUBLIC_KEY` mal copiada, o el deploy todavía no terminó |
| "La planilla no está compartida como Editor…" | Falta compartir la planilla con el `client_email` de la cuenta de servicio |
| "No pude deducir división, sesión, mesa" | El hilo no sigue la convención de nombres; pasar las opciones a mano |
| A un jugador lo rechaza siendo de la mesa | Su celda **Discord** en el roster no coincide con su usuario actual |
| @Staff no tiene privilegios | Falta `DISCORD_BOT_TOKEN` (para resolver el rol por nombre) o `DISCORD_STAFF_ROLE_ID` |
| La fecha aparece en la planilla pero no en el sitio | El sincronizador todavía no corrió; espera hasta 15 minutos |
