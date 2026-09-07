#!/usr/bin/env node
// Registra /agendar en Discord. Se corre a mano, una vez, y otra vez cada vez
// que cambien las opciones del comando.
//
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... \
//   DISCORD_GUILD_ID=... node scripts/register_discord_commands.mjs
//
// Con DISCORD_GUILD_ID el comando aparece al instante en ese servidor; sin él
// se registra global y Discord tarda hasta una hora en propagarlo.
const API = "https://discord.com/api/v10";

const COMMANDS = [
  {
    name: "agendar",
    description: "Agenda la fecha y hora de la mesa en la planilla de la liga",
    type: 1,
    dm_permission: false,
    options: [
      {
        name: "cuando",
        description: "Timestamp de Discord (<t:1758330000:F>), epoch en segundos, o 18-07-2026 21:30 (hora chilena)",
        type: 3,
        required: true,
      },
      {
        name: "division",
        description: "Sólo si el hilo no lo dice",
        type: 3,
        required: false,
        choices: [
          { name: "División A", value: "A" },
          { name: "División B", value: "B" },
        ],
      },
      {
        name: "sesion",
        description: "Sólo si el hilo no lo dice (1 a 7)",
        type: 4,
        required: false,
        min_value: 1,
        max_value: 7,
      },
      {
        name: "mesa",
        description: "Sólo si el hilo no lo dice (1 a 6)",
        type: 4,
        required: false,
        min_value: 1,
        max_value: 6,
      },
    ],
  },
];

async function main() {
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!applicationId || !token) {
    console.error("Faltan DISCORD_APPLICATION_ID y/o DISCORD_BOT_TOKEN.");
    process.exit(1);
  }

  const path = guildId
    ? `/applications/${applicationId}/guilds/${guildId}/commands`
    : `/applications/${applicationId}/commands`;
  const response = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(COMMANDS),
  });
  const payload = await response.text();
  if (!response.ok) {
    console.error(`Discord respondió ${response.status}:\n${payload}`);
    process.exit(1);
  }
  const registered = JSON.parse(payload);
  console.log(`Registrados ${registered.length} comando(s) en ${guildId ? `el servidor ${guildId}` : "modo global"}:`);
  for (const command of registered) console.log(`  /${command.name} — ${command.description}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
