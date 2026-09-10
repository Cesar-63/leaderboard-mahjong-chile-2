import { appendValues, ensureSheet, loadConfig, readLeague, readTable, readValues, writeValues } from "./_lib/sheets.mjs";

const SHEET = "Disponibilidad";
const HEADER = ["division", "session", "table", "playerId", "player", "slots", "updatedAt"];

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function paramsFrom(url) {
  const query = new URL(url).searchParams;
  return { division: query.get("division"), session: Number(query.get("session")), table: Number(query.get("table")) };
}

function validTable({ division, session, table }) {
  return ["A", "B"].includes(division) && Number.isInteger(session) && session >= 1 && session <= 7 && Number.isInteger(table) && table >= 1 && table <= 6;
}

function storageEnv() {
  if (!process.env.AVAILABILITY_SHEET_ID) throw new Error("Falta AVAILABILITY_SHEET_ID");
  return { ...process.env, SHEET_ID: process.env.AVAILABILITY_SHEET_ID };
}

async function rows(env) {
  await ensureSheet(env, SHEET);
  const values = await readValues(env, `${SHEET}!A:G`);
  if (!values.length) {
    await writeValues(env, `${SHEET}!A1:G1`, [HEADER]);
    return [];
  }
  return values.slice(1);
}

export async function GET(request) {
  try {
    const scope = paramsFrom(request.url);
    if (!validTable(scope)) return json({ error: "Mesa inválida" }, 400);
    const values = await rows(storageEnv());
    const responses = values.filter((row) => row[0] === scope.division && Number(row[1]) === scope.session && Number(row[2]) === scope.table).map((row) => ({
      playerId: row[3], player: row[4], slots: JSON.parse(row[5] || "[]"), updatedAt: row[6],
    }));
    return json({ responses });
  } catch (error) {
    return json({ error: error.message || "No se pudo leer la disponibilidad" }, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const scope = { division: body.division, session: Number(body.session), table: Number(body.table) };
    if (!validTable(scope)) return json({ error: "Mesa inválida" }, 400);
    const slots = [...new Set((body.slots || []).map(Number))].filter((slot) => Number.isInteger(slot) && slot > 0).sort((a, b) => a - b);
    if (!body.playerId || slots.length > 420) return json({ error: "Respuesta inválida" }, 400);

    const config = loadConfig();
    const league = await readLeague(process.env, config);
    const player = league.roster.find((item) => item.id === body.playerId && item.division === scope.division);
    const table = readTable(league.grid, scope.division, scope.session, scope.table);
    if (!player || !table.players.includes(player.name)) return json({ error: "El jugador no pertenece a esta mesa" }, 403);

    const store = storageEnv();
    const values = await rows(store);
    const existing = values.findIndex((row) => row[0] === scope.division && Number(row[1]) === scope.session && Number(row[2]) === scope.table && row[3] === player.id);
    const record = [scope.division, scope.session, scope.table, player.id, player.name, JSON.stringify(slots), new Date().toISOString()];
    if (existing >= 0) await writeValues(store, `${SHEET}!A${existing + 2}:G${existing + 2}`, [record]);
    else await appendValues(store, `${SHEET}!A:G`, [record]);
    return json({ response: { playerId: player.id, player: player.name, slots, updatedAt: record[6] } });
  } catch (error) {
    return json({ error: error.message || "No se pudo guardar la disponibilidad" }, 500);
  }
}
