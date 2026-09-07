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

const channelCache = new Map();
const rolesCache = new Map();

async function discordFetch(token, path) {
  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bot ${token}` },
  });
  if (!response.ok) throw new Error(`Discord respondió ${response.status} en ${path}`);
  return response.json();
}

export async function fetchChannel(token, channelId) {
  if (!token || !channelId) return null;
  if (channelCache.has(channelId)) return channelCache.get(channelId);
  try {
    const channel = await discordFetch(token, `/channels/${channelId}`);
    channelCache.set(channelId, channel);
    return channel;
  } catch {
    channelCache.set(channelId, null);
    return null;
  }
}

export async function resolveRoleId(token, guildId, roleName) {
  if (!token || !guildId || !roleName) return null;
  const key = `${guildId}:${roleName.toLowerCase()}`;
  if (rolesCache.has(key)) return rolesCache.get(key);
  try {
    const roles = await discordFetch(token, `/guilds/${guildId}/roles`);
    const match = roles.find((role) => String(role.name).toLowerCase() === roleName.toLowerCase());
    const id = match ? match.id : null;
    rolesCache.set(key, id);
    return id;
  } catch {
    return null;
  }
}

export function optionMap(interaction) {
  const options = interaction?.data?.options || [];
  return Object.fromEntries(options.map((option) => [option.name, option.value]));
}

/** Nombres con los que el usuario puede figurar en la columna Discord. */
export function callerHandles(interaction) {
  const user = interaction?.member?.user || interaction?.user || {};
  return [user.username, user.global_name, interaction?.member?.nick]
    .filter(Boolean)
    .map((value) => String(value).trim());
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
