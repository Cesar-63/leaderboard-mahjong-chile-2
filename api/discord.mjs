// Endpoint de interacciones de Discord: /agendar escribe fecha y hora en la
// hoja Calendario de la planilla.
//
// Corre como Vercel Function del mismo proyecto que sirve el sitio. Se usan
// exports por método HTTP (GET/POST) porque ésa es la forma en que @vercel/node
// entrega el `Request` web: hace falta el cuerpo crudo, byte a byte, para
// verificar la firma Ed25519, y un body ya parseado no sirve.
//
// El camino crítico son 3 segundos: pasado ese plazo Discord da la interacción
// por perdida. Por eso el token de Google y los datos del gremio se cachean en
// el módulo (la lambda tibia se reusa) y la lectura de la planilla arranca en
// paralelo con las consultas a Discord.
import { verifyDiscordSignature } from "./_lib/verify.mjs";
import { parseWhen, WhenError, DEFAULT_TIMEZONE } from "./_lib/time.mjs";
import { mergeTargets, parseTarget, validateTarget } from "./_lib/target.mjs";
import { loadConfig, readLeague, readTable, SheetsError, writeSchedule } from "./_lib/sheets.mjs";
import {
  callerIdentity, checkBotToken, fetchChannel, InteractionResponseType, InteractionType,
  message, optionMap, resolveRoleId,
} from "./_lib/discord.mjs";

const CONFIG = loadConfig();
const DEFAULT_STAFF_ROLE_NAME = "Staff";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET() {
  // Sonda de salud: confirma que la función está desplegada y qué le falta
  // configurar, sin exponer ningún secreto. El token de bot se prueba contra
  // la API: que la variable exista no significa que sirva, y de él dependen
  // tanto el nombre del canal padre como resolver @Staff por nombre.
  const env = process.env;
  const botToken = (env.DISCORD_BOT_TOKEN || "").trim();
  const bot = await checkBotToken(botToken);
  return json({
    service: "liga-mahjong-chile/discord",
    ready: Boolean(env.DISCORD_PUBLIC_KEY && env.SHEET_ID),
    configured: {
      discordPublicKey: Boolean(env.DISCORD_PUBLIC_KEY),
      sheetId: Boolean(env.SHEET_ID),
      googleCredentials: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON || (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY)),
      botToken: bot.ok ? `válido (${bot.username})` : `NO SIRVE — ${bot.reason}`,
      staffRole: env.DISCORD_STAFF_ROLE_ID ? "por id" : `por nombre (@${staffRoleName(env)})`,
      timeZone: env.LEAGUE_TIMEZONE || DEFAULT_TIMEZONE,
    },
  });
}

function staffRoleName(env) {
  return (env.DISCORD_STAFF_ROLE_NAME || "").trim() || DEFAULT_STAFF_ROLE_NAME;
}

export async function POST(request) {
  const env = process.env;
  const rawBody = await request.text();
  const valid = verifyDiscordSignature({
    publicKeyHex: env.DISCORD_PUBLIC_KEY,
    signature: request.headers.get("x-signature-ed25519"),
    timestamp: request.headers.get("x-signature-timestamp"),
    rawBody,
  });
  if (!valid) return new Response("invalid request signature", { status: 401 });

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  if (interaction.type === InteractionType.PING) {
    return json({ type: InteractionResponseType.PONG });
  }
  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return json(message("Ese tipo de interacción no está soportado.", { ephemeral: true }));
  }
  if (interaction.data?.name !== "agendar") {
    return json(message(`Comando desconocido: \`${interaction.data?.name}\`.`, { ephemeral: true }));
  }

  if (!env.SHEET_ID) {
    return json(message("⚠️ Falta configurar `SHEET_ID` en el entorno del sitio.", { ephemeral: true }));
  }

  try {
    return json(await agendar(interaction, env));
  } catch (error) {
    const detail = error instanceof SheetsError ? error.message : `${error.name}: ${error.message}`;
    return json(message(`⚠️ No pude escribir en la planilla. ${detail}`, { ephemeral: true }));
  }
}

async function agendar(interaction, env) {
  const options = optionMap(interaction);
  const timeZone = env.LEAGUE_TIMEZONE || DEFAULT_TIMEZONE;

  let when;
  try {
    when = parseWhen(options.cuando, { timeZone });
  } catch (error) {
    if (!(error instanceof WhenError)) throw error;
    return message(`⚠️ ${error.message}`, { ephemeral: true });
  }

  // Recortado: pegar el token en el panel de Vercel suele arrastrar un salto
  // de línea, y eso rompe el header Authorization en todas las llamadas.
  const botToken = (env.DISCORD_BOT_TOKEN || "").trim();
  const channel = interaction.channel || {};
  const explicit = {
    division: options.division ? String(options.division).toUpperCase() : undefined,
    session: options.sesion === undefined ? undefined : Number(options.sesion),
    table: options.mesa === undefined ? undefined : Number(options.mesa),
  };

  // La lectura de la planilla no depende de la mesa, así que va en paralelo
  // con las consultas a Discord.
  const [league, context, staffRoleId] = await Promise.all([
    readLeague(env, CONFIG),
    channelContext(botToken, interaction, channel),
    env.DISCORD_STAFF_ROLE_ID
      ? Promise.resolve(env.DISCORD_STAFF_ROLE_ID.trim())
      : resolveRoleId(botToken, interaction.guild_id, staffRoleName(env)),
  ]);

  const target = mergeTargets(explicit, ...context.names.map(parseTarget));
  const missing = validateTarget(target);
  if (missing.length) {
    const lines = [
      `⚠️ No pude deducir ${missing.join(", ")} desde este canal` +
      (context.names.length ? ` (\`${context.names.join("` › `")}\`)` : "") + ".",
    ];
    // Que no se haya podido leer el canal padre es un problema de
    // configuración, no del nombre del hilo: hay que decirlo, porque si no
    // parece que el hilo estuviera mal nombrado.
    if (context.lookupFailed) {
      lines.push(
        "🔧 Además, no pude leer el nombre del canal donde vive este hilo: " +
        (botToken
          ? "el token del bot no sirve, o el bot no tiene permiso para ver ese canal."
          : "falta `DISCORD_BOT_TOKEN` en el entorno del sitio.") +
        " Por eso no saqué la división de ahí.",
      );
    }
    lines.push(
      "Pasalos a mano: `/agendar cuando:<t:…:F> division:A sesion:3 mesa:2`, " +
      "o nombrá el hilo con el formato `A · Sesión 3 · Mesa 2`.",
    );
    return message(lines.join("\n"), { ephemeral: true });
  }

  const table = readTable(league.grid, target.division, target.session, target.table);
  const label = `División ${target.division} · Sesión ${target.session} · Mesa ${target.table}`;
  if (table.players.every((name) => !name)) {
    return message(`⚠️ ${label} todavía no tiene jugadores en el Calendario. Falta publicar el sorteo.`, { ephemeral: true });
  }

  const memberRoles = interaction.member?.roles || [];
  const isStaff = Boolean(staffRoleId) && memberRoles.includes(staffRoleId);
  const identity = callerIdentity(interaction);
  const seats = playersFor(identity, league.roster);

  if (!isStaff) {
    const seated = seats.filter((player) => sameName(player.name, table.players));
    if (!seated.length) {
      const lines = [
        `⚠️ Sólo pueden agendar ${label} sus cuatro jugadores (${table.players.filter(Boolean).join(", ")}) o el rol @${staffRoleName(env)}.`,
        `Tu usuario (\`${identity.username || "desconocido"}\`) ${seats.length ? `figura en el roster como **${seats.map((p) => p.name).join(", ")}**, que no juega en esa mesa` : "no figura en la columna Discord de la planilla — ojo que se compara contra el **nombre de usuario**, no contra el nombre para mostrar ni el apodo del servidor"}.`,
      ];
      // Sin rol resuelto, el rechazo de arriba es engañoso: alguien con @Staff
      // creería que no lo tiene, cuando el bot ni siquiera pudo buscarlo.
      if (!staffRoleId) {
        lines.push(
          `🔧 Aviso de configuración: no pude resolver el rol @${staffRoleName(env)} ` +
          (botToken
            ? "(el token del bot no sirve, o no existe un rol con ese nombre)"
            : "(falta `DISCORD_BOT_TOKEN`)") +
          ", así que ahora mismo nadie tiene el atajo de organizador. Se arregla poniendo `DISCORD_STAFF_ROLE_ID` con el id del rol.",
        );
      }
      return message(lines.join("\n"), { ephemeral: true });
    }
    if (table.paipuG1) {
      return message(
        `⚠️ ${label} ya tiene resultados cargados (${table.paipuG1Cell}). Reagendarla borraría el registro del calendario; pedile a @${staffRoleName(env)} que lo haga.`,
        { ephemeral: true },
      );
    }
  }

  const previous = table.date || table.time
    ? `${table.date || "sin fecha"} ${table.time || ""}`.trim()
    : null;
  const result = await writeSchedule(env, {
    dateCell: table.dateCell,
    timeCell: table.timeCell,
    dateISO: when.dateISO,
    timeHM: when.timeHM,
  });

  const lines = [
    `📅 **${label}** queda agendada para <t:${when.epochSeconds}:F> (<t:${when.epochSeconds}:R>).`,
    `🀄 ${table.players.filter(Boolean).join(" · ")}`,
  ];
  if (previous) lines.push(`↩️ Antes decía: ${previous}`);
  if (isStaff && table.paipuG1) lines.push(`⚠️ Ojo: la mesa ya tenía un paipu cargado en ${table.paipuG1Cell}.`);
  const asText = [
    result.storedAsDate ? null : table.dateCell,
    result.storedAsTime ? null : table.timeCell,
  ].filter(Boolean);
  if (asText.length) {
    lines.push(
      `⚠️ Google guardó ${asText.join(" y ")} como texto y no como fecha/hora. ` +
      "El sitio lo va a mostrar como «Por definir» hasta que se corrija el formato de la celda.",
    );
  }
  lines.push(`_${table.dateCell} · ${table.timeCell} — el sitio se actualiza en menos de 15 minutos._`);
  return message(lines.join("\n"));
}

/** Nombre del hilo y, si se puede, el del canal padre. */
/**
 * Nombre del hilo y el del canal donde vive.
 *
 * Discord manda el `parent_id` del hilo pero no el nombre del padre, así que
 * ése hay que pedirlo con el token del bot. Es el caso normal de la liga: el
 * hilo dice `Sesión 6 Mesa 1` y la división sólo está en `#chat-general-liga-a`.
 * Cuando la consulta falla se informa (`lookupFailed`) en vez de quedar en
 * silencio, porque si no el rechazo culpa al nombre del hilo.
 */
async function channelContext(botToken, interaction, channel) {
  const names = [];
  let lookupFailed = false;
  if (channel.name) names.push(channel.name);

  let parentId = channel.parent_id;
  if (!channel.name && interaction.channel_id) {
    const fetched = await fetchChannel(botToken, interaction.channel_id);
    if (fetched?.name) names.push(fetched.name);
    else lookupFailed = true;
    parentId = parentId || fetched?.parent_id;
  }

  if (parentId) {
    const parent = await fetchChannel(botToken, parentId);
    if (parent?.name) names.push(parent.name);
    else lookupFailed = true;
  }
  return { names, lookupFailed };
}

/** El Calendario y el roster salen de la misma planilla, pero se comparan sin
 *  distinguir mayúsculas para que un tipeo de capitalización no deje afuera a
 *  un jugador de su propia mesa. */
function sameName(name, candidates) {
  const wanted = name.trim().toLowerCase();
  return candidates.some((candidate) => candidate.trim().toLowerCase() === wanted);
}

function normalizeHandle(value) {
  return String(value ?? "").trim().toLowerCase().replace(/^@/, "").split("#")[0];
}

/**
 * Jugadores del roster que son quien invocó el comando.
 *
 * La celda Discord del roster puede traer el nombre de usuario o el id
 * numérico. El id es preferible —no se puede falsificar ni cambia cuando
 * alguien se renombra—, así que si la celda son puros dígitos se compara
 * contra el id y nada más.
 */
export function playersFor(identity, roster) {
  const username = normalizeHandle(identity?.username);
  const id = String(identity?.id || "").trim();
  return roster.filter((player) => {
    const cell = String(player.discord || "").trim();
    if (!cell) return false;
    if (/^\d{17,20}$/.test(cell)) return Boolean(id) && cell === id;
    return Boolean(username) && normalizeHandle(cell) === username;
  });
}
