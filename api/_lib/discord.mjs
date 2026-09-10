// Helpers de la API de Discord.
//
// El endpoint de interacciones no necesita token de bot para responder, pero
// sí para dos cosas: leer el nombre del canal padre (el payload trae parent_id
// y no el nombre) y resolver el rol @Staff por nombre. Ambas se cachean en el
// módulo porque la lambda tibia se reusa entre invocaciones.
const API = "https://discord.com/api/v10";

export const InteractionType = { PING: 1, APPLICATION_COMMAND: 2 };
export const InteractionResponseType = { PONG: 1, CHANNEL_MESSAGE_WITH_SOURCE: 4 };
export const EPHEMERAL = 64;

// Las respuestas se cachean poco tiempo y **nunca los fallos**: un 429 pasajero
// no puede dejar ciega la deducción de mesa por el resto de la vida de la
// lambda, y un canal renombrado (`liga-a-sesion-3` → `-4`) tiene que verse
// antes de que el bot escriba en las celdas de la sesión anterior.
const CACHE_TTL_MS = 60_000;
const channelCache = new Map();
const rolesCache = new Map();

function cacheGet(store, key) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit;
  store.delete(key);
  return null;
}

function cacheSet(store, key, value) {
  store.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function discordFetch(token, path) {
  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bot ${token}` },
  });
  if (!response.ok) {
    const error = new Error(`Discord respondió ${response.status} en ${path}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Valida el token de bot sin necesitar servidor ni permisos: devuelve la
 * identidad del bot, o el motivo del rechazo. Existe para que la sonda de
 * salud diga si el token sirve; un token con un espacio invisible al pegarlo
 * rompe todas las llamadas autenticadas —canal padre y rol @Staff— y antes
 * fallaba sin dejar rastro.
 */
export async function checkBotToken(token) {
  if (!token) return { ok: false, reason: "falta DISCORD_BOT_TOKEN" };
  try {
    const user = await discordFetch(token, "/users/@me");
    return { ok: true, username: user.username };
  } catch (error) {
    if (error.status === 401) return { ok: false, reason: "token inválido (401)" };
    return { ok: false, reason: error.message };
  }
}

export async function fetchChannel(token, channelId) {
  if (!token || !channelId) return null;
  const hit = cacheGet(channelCache, channelId);
  if (hit) return hit.value;
  try {
    return cacheSet(channelCache, channelId, await discordFetch(token, `/channels/${channelId}`));
  } catch {
    return null;
  }
}

export async function resolveRoleId(token, guildId, roleName) {
  if (!token || !guildId || !roleName) return null;
  const key = `${guildId}:${roleName.toLowerCase()}`;
  const hit = cacheGet(rolesCache, key);
  if (hit) return hit.value;
  try {
    const roles = await discordFetch(token, `/guilds/${guildId}/roles`);
    const match = roles.find((role) => String(role.name).toLowerCase() === roleName.toLowerCase());
    // Un rol que todavía no existe no se cachea: si lo crean o lo renombran
    // después del primer intento, @Staff quedaría sin privilegios hasta el
    // próximo despliegue.
    return match ? cacheSet(rolesCache, key, match.id) : null;
  } catch {
    return null;
  }
}

export function optionMap(interaction) {
  const options = interaction?.data?.options || [];
  return Object.fromEntries(options.map((option) => [option.name, option.value]));
}

/**
 * Identidad de quien invoca, para emparejar contra la columna Discord.
 *
 * Sólo el nombre de usuario y el id numérico. El nombre para mostrar
 * (`global_name`) y el apodo del servidor (`nick`) los elige cada uno y no son
 * únicos: aceptarlos dejaría que cualquiera del servidor se ponga de apodo el
 * handle de otro jugador y agende una mesa en la que no juega.
 */
export function callerIdentity(interaction) {
  const user = interaction?.member?.user || interaction?.user || {};
  return {
    username: String(user.username || "").trim(),
    id: String(user.id || "").trim(),
  };
}

export function message(content, { ephemeral = false } = {}) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      // Los tags <t:...> se renderizan igual; sólo se bloquean las menciones
      // para que un nombre de jugador no termine pingueando a nadie.
      allowed_mentions: { parse: [] },
      ...(ephemeral ? { flags: EPHEMERAL } : {}),
    },
  };
}
