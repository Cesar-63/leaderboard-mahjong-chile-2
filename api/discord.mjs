// Endpoint de interacciones de Discord.
//
//   /agendar     escribe fecha y hora de una mesa en la hoja Calendario.
//   /actualizar  le pide a GitHub Actions que corra el pipeline ahora mismo.
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
  describeRun, dispatchWorkflow, GithubError, githubConfig, githubConfigError,
  isRunning, latestRun, runsUrl, selectWorkflows, WORKFLOWS,
} from "./_lib/github.mjs";
import {
  callerIdentity, fetchChannel, InteractionResponseType, InteractionType,
  message, optionMap, resolveRoleId,
} from "./_lib/discord.mjs";

const CONFIG = loadConfig();
const DEFAULT_STAFF_ROLE_NAME = "Staff";
const COMMANDS = { agendar, actualizar };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function GET() {
  // Sonda de salud: confirma que la función está desplegada y qué le falta
  // configurar, sin exponer ningún secreto.
  const env = process.env;
  const github = githubConfig(env);
  return json({
    service: "liga-mahjong-chile/discord",
    ready: Boolean(env.DISCORD_PUBLIC_KEY && env.SHEET_ID),
    configured: {
      discordPublicKey: Boolean(env.DISCORD_PUBLIC_KEY),
      sheetId: Boolean(env.SHEET_ID),
      googleCredentials: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON || (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY)),
      botToken: Boolean(env.DISCORD_BOT_TOKEN),
      staffRole: env.DISCORD_STAFF_ROLE_ID ? "por id" : `por nombre (@${staffRoleName(env)})`,
      timeZone: env.LEAGUE_TIMEZONE || DEFAULT_TIMEZONE,
      // Sólo el repositorio y la rama, que son públicos; nunca el token.
      githubActions: githubConfigError(github) || `${github.slug} @ ${github.ref}`,
    },
    commands: Object.keys(COMMANDS).map((name) => `/${name}`),
  });
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
  const handler = COMMANDS[interaction.data?.name];
  if (!handler) {
    return json(message(`Comando desconocido: \`${interaction.data?.name}\`.`, { ephemeral: true }));
  }

  try {
    return json(await handler(interaction, env));
  } catch (error) {
    // Los errores propios ya vienen redactados para leerse en el chat; de
    // cualquier otro se muestra el tipo, que es lo que permite diagnosticarlo
    // sin abrir los logs de Vercel.
    const known = error instanceof SheetsError || error instanceof GithubError;
    const detail = known ? error.message : `${error.name}: ${error.message}`;
    return json(message(`⚠️ No pude completar el comando. ${detail}`, { ephemeral: true }));
  }
}

/** El rol de organizadores: por id si está configurado, si no por nombre
 *  (que necesita token de bot). Lo usan los dos comandos. */
function staffRoleFor(env, guildId) {
  if (env.DISCORD_STAFF_ROLE_ID) return Promise.resolve(env.DISCORD_STAFF_ROLE_ID.trim());
  return resolveRoleId(env.DISCORD_BOT_TOKEN, guildId, staffRoleName(env));
}

function staffRoleName(env) {
  return env.DISCORD_STAFF_ROLE_NAME || DEFAULT_STAFF_ROLE_NAME;
}

function isStaffMember(interaction, staffRoleId) {
  return Boolean(staffRoleId) && (interaction.member?.roles || []).includes(staffRoleId);
}

async function agendar(interaction, env) {
  if (!env.SHEET_ID) {
    return message("⚠️ Falta configurar `SHEET_ID` en el entorno del sitio.", { ephemeral: true });
  }
  const options = optionMap(interaction);
  const timeZone = env.LEAGUE_TIMEZONE || DEFAULT_TIMEZONE;

  let when;
  try {
    when = parseWhen(options.cuando, { timeZone });
  } catch (error) {
    if (!(error instanceof WhenError)) throw error;
    return message(`⚠️ ${error.message}`, { ephemeral: true });
  }

  const botToken = env.DISCORD_BOT_TOKEN;
  const channel = interaction.channel || {};
  const explicit = {
    division: options.division ? String(options.division).toUpperCase() : undefined,
    session: options.sesion === undefined ? undefined : Number(options.sesion),
    table: options.mesa === undefined ? undefined : Number(options.mesa),
  };

  // La lectura de la planilla no depende de la mesa, así que va en paralelo
  // con las consultas a Discord.
  const [league, contextNames, staffRoleId] = await Promise.all([
    readLeague(env, CONFIG),
    channelNames(botToken, interaction, channel),
    staffRoleFor(env, interaction.guild_id),
  ]);

  const target = mergeTargets(explicit, ...contextNames.map(parseTarget));
  const missing = validateTarget(target);
  if (missing.length) {
    return message(
      `⚠️ No pude deducir ${missing.join(", ")} desde este canal` +
      (contextNames.length ? ` (\`${contextNames.join("` › `")}\`)` : "") +
      ".\nPasalos a mano: `/agendar cuando:<t:…:F> division:A sesion:3 mesa:2`, " +
      "o nombrá el hilo con el formato `A · Sesión 3 · Mesa 2`.",
      { ephemeral: true },
    );
  }

  const table = readTable(league.grid, target.division, target.session, target.table);
  const label = `División ${target.division} · Sesión ${target.session} · Mesa ${target.table}`;
  if (table.players.every((name) => !name)) {
    return message(`⚠️ ${label} todavía no tiene jugadores en el Calendario. Falta publicar el sorteo.`, { ephemeral: true });
  }

  const isStaff = isStaffMember(interaction, staffRoleId);
  const identity = callerIdentity(interaction);
  const seats = playersFor(identity, league.roster);

  if (!isStaff) {
    if (!staffRoleId) {
      // Sin token de bot no se puede resolver @Staff por nombre; entonces el
      // rol hay que configurarlo por id o nadie tiene el atajo de organizador.
      console.warn("No se pudo resolver el rol de organizador: falta DISCORD_STAFF_ROLE_ID o DISCORD_BOT_TOKEN");
    }
    const seated = seats.filter((player) => sameName(player.name, table.players));
    if (!seated.length) {
      return message(
        `⚠️ Sólo pueden agendar ${label} sus cuatro jugadores (${table.players.filter(Boolean).join(", ")}) o el rol @${staffRoleName(env)}.\n` +
        `Tu usuario (\`${identity.username || "desconocido"}\`) ${seats.length ? `figura en el roster como **${seats.map((p) => p.name).join(", ")}**, que no juega en esa mesa` : "no figura en la columna Discord de la planilla — ojo que se compara contra el **nombre de usuario**, no contra el nombre para mostrar ni el apodo del servidor"}.`,
        { ephemeral: true },
      );
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

/**
 * /actualizar — corre el pipeline ahora en vez de esperar al cron.
 *
 * El bot no ejecuta ningún script: le pide a GitHub Actions que corra el
 * workflow, que es donde viven Python, los secretos de Mahjong Soul y los
 * minutos que el pipeline necesita. Por eso el comando contesta enseguida y lo
 * único que devuelve es el link de la corrida.
 *
 * Lo pueden lanzar los jugadores del roster y @Staff, con la misma verificación
 * de identidad que /agendar: quema minutos de Actions y termina escribiendo en
 * la planilla, así que no es para cualquiera que pase por el servidor.
 */
async function actualizar(interaction, env) {
  const options = optionMap(interaction);
  const selection = selectWorkflows(options.que ?? "todo");
  if (!selection) {
    const known = ["todo", ...Object.keys(WORKFLOWS)].map((name) => `\`${name}\``).join(", ");
    return message(`⚠️ No conozco el proceso \`${options.que}\`. Los que hay: ${known}.`, { ephemeral: true });
  }

  const config = githubConfig(env);
  const configError = githubConfigError(config);
  if (configError) return message(`⚠️ ${configError}`, { ephemeral: true });

  // Las tres consultas son independientes: el rol en Discord, el roster en la
  // planilla y el estado en GitHub. En serie no entrarían en los 3 segundos.
  const [staffRoleId, league, runs] = await Promise.all([
    staffRoleFor(env, interaction.guild_id),
    readRoster(env),
    Promise.all(selection.map((workflow) => latestRun(config, workflow))),
  ]);

  const isStaff = isStaffMember(interaction, staffRoleId);
  const identity = callerIdentity(interaction);
  if (!isStaff) {
    if (league.error) {
      return message(
        `⚠️ No pude leer el roster para verificar quién sos (${league.error}). ` +
        `Que lo lance @${staffRoleName(env)}.`,
        { ephemeral: true },
      );
    }
    if (!playersFor(identity, league.roster).length) {
      return message(
        `⚠️ Esto lo lanzan los jugadores de la liga y el rol @${staffRoleName(env)}.\n` +
        `Tu usuario (\`${identity.username || "desconocido"}\`) no figura en la columna Discord de la planilla ` +
        "— ojo que se compara contra el **nombre de usuario**, no contra el nombre para mostrar ni el apodo del servidor.",
        { ephemeral: true },
      );
    }
  }

  if (options.solo_estado) {
    return message(
      selection.map((workflow, index) =>
        `🔧 **${workflow.label}** — ${describeRun(runs[index])}\n_Automático: ${workflow.schedule}._`).join("\n"),
      { ephemeral: true },
    );
  }

  // En fila y en el orden de WORKFLOW_CHAIN: `paipus` llena la planilla y
  // `datos` la lee, así que lanzarlos al revés dejaría lo recién escrito para
  // la corrida siguiente. Una que ya está corriendo no se vuelve a pedir: haría
  // exactamente el mismo trabajo.
  const launched = [];
  const busy = [];
  for (const [index, workflow] of selection.entries()) {
    if (isRunning(runs[index])) {
      busy.push({ workflow, run: runs[index] });
      continue;
    }
    await dispatchWorkflow(config, workflow);
    launched.push({ workflow, previous: runs[index] });
  }

  const lines = [];
  for (const { workflow, previous } of launched) {
    lines.push(`🚀 **${workflow.label}** — ${workflow.detail}.`);
    lines.push(`↳ <${runsUrl(config, workflow)}>`);
    // Una corrida anterior que no terminó bien es la explicación más probable
    // de por qué faltan datos: mostrarla acá ahorra ir a buscarla a GitHub.
    if (previous && previous.conclusion && previous.conclusion !== "success") {
      lines.push(`↳ ${describeRun(previous)}`);
    }
  }
  for (const { workflow, run } of busy) {
    lines.push(`⏳ **${workflow.label}** ya ${run.status === "queued" ? "está en la cola" : "está corriendo"} — <${run.url}>`);
  }
  if (!launched.length) return message(lines.join("\n"), { ephemeral: true });
  lines.push(
    launched.length > 1
      ? "_Tardan unos minutos y comparten cola —Mahjong Soul admite una sola sesión por cuenta—, así que el segundo arranca cuando termina el primero. El sitio se actualiza solo._"
      : "_Tarda unos minutos. El sitio se actualiza solo cuando termina._",
  );
  return message(lines.join("\n"));
}

/** El roster, tolerando que la planilla no esté configurada: un problema de
 *  Google no tiene por qué impedirle a @Staff lanzar un workflow. */
async function readRoster(env) {
  if (!env.SHEET_ID) return { roster: [], error: "falta `SHEET_ID`" };
  try {
    return { roster: (await readLeague(env, CONFIG)).roster };
  } catch (error) {
    return { roster: [], error: error.message };
  }
}

/** Nombre del hilo y, si se puede, el del canal padre. */
async function channelNames(botToken, interaction, channel) {
  const names = [];
  if (channel.name) names.push(channel.name);
  const parentId = channel.parent_id;
  if (parentId) {
    const parent = await fetchChannel(botToken, parentId);
    if (parent?.name) names.push(parent.name);
  } else if (!channel.name && interaction.channel_id) {
    const fetched = await fetchChannel(botToken, interaction.channel_id);
    if (fetched?.name) names.push(fetched.name);
    if (fetched?.parent_id) {
      const parent = await fetchChannel(botToken, fetched.parent_id);
      if (parent?.name) names.push(parent.name);
    }
  }
  return names;
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
