// node --test tests/test_discord_bot.mjs
//
// Cubre sólo la lógica pura del bot: parseo de fecha, deducción de la mesa
// desde el nombre del hilo, aritmética de celdas y verificación de firma.
// Nada de esto toca la red.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";

import { parseWhen, WhenError, zonedParts, zonedToEpoch } from "../api/_lib/time.mjs";
import { mergeTargets, parseTarget, validateTarget } from "../api/_lib/target.mjs";
import {
  CALENDAR_PLAYER_COLS, CALENDAR_VALUE_COLS, SESSION_G1_ROWS,
  columnLetter, readTable, tableCells,
} from "../api/_lib/sheets.mjs";
import { verifyDiscordSignature } from "../api/_lib/verify.mjs";
import { playersFor } from "../api/discord.mjs";

// Antes de julio, para que los casos sin año no crucen el salto de año.
const NOW = Date.parse("2026-07-01T12:00:00Z");
const TZ = "America/Santiago";

test("acepta el tag de timestamp de Discord", () => {
  const when = parseWhen("<t:1784424600:F>", { timeZone: TZ, now: NOW });
  assert.equal(when.epochSeconds, 1784424600);
  assert.equal(when.dateISO, "2026-07-18");
  assert.equal(when.timeHM, "21:30");
});

test("acepta el epoch pelado, en segundos y en milisegundos", () => {
  assert.equal(parseWhen("1784424600", { timeZone: TZ, now: NOW }).epochSeconds, 1784424600);
  assert.equal(parseWhen("1784424600000", { timeZone: TZ, now: NOW }).epochSeconds, 1784424600);
});

test("acepta fecha y hora escritas a mano, en varias formas", () => {
  const expected = { dateISO: "2026-07-18", timeHM: "21:30" };
  for (const input of [
    "18-07-2026 21:30",
    "18/07/2026 21:30",
    "2026-07-18 21:30",
    "18 de julio 21:30",
    "18 de julio de 2026 a las 21:30",
    "18-07-2026, 9:30 pm",
  ]) {
    const when = parseWhen(input, { timeZone: TZ, now: NOW });
    assert.deepEqual({ dateISO: when.dateISO, timeHM: when.timeHM }, expected, input);
  }
});

test("sin año, elige el año que deja la fecha por delante", () => {
  // La fecha que viene, en el año en curso.
  assert.equal(parseWhen("18/07 21:30", { timeZone: TZ, now: NOW }).dateISO, "2026-07-18");

  // En diciembre, "05/01" es el enero que viene, no el que pasó hace once
  // meses. Antes se escribía la fecha vencida en la planilla sin chistar.
  const diciembre = Date.parse("2026-12-20T12:00:00Z");
  assert.equal(parseWhen("05/01 21:30", { timeZone: TZ, now: diciembre }).dateISO, "2027-01-05");

  // Pero una mesa recién jugada se puede registrar hacia atrás: hay 30 días de
  // gracia antes de dar por hecho que se quiso decir el año siguiente.
  assert.equal(parseWhen("18/12 21:30", { timeZone: TZ, now: diciembre }).dateISO, "2026-12-18");

  // Con el año escrito no se toca nunca, por vieja que sea la fecha.
  assert.equal(parseWhen("18-07-2026 21:30", { timeZone: TZ, now: diciembre }).dateISO, "2026-07-18");
});

test("rechaza lo que no entiende", () => {
  for (const input of ["", "mañana", "el jueves a la noche", "99-99-2026 21:30"]) {
    assert.throws(() => parseWhen(input, { timeZone: TZ, now: NOW }), WhenError, input);
  }
});

test("respeta el horario de verano chileno", () => {
  // Julio es invierno (UTC−4) y enero verano (UTC−3): la misma hora de pared
  // da dos instantes con una hora de diferencia respecto de UTC.
  const invierno = parseWhen("18-07-2026 21:30", { timeZone: TZ, now: NOW });
  const verano = parseWhen("18-01-2027 21:30", { timeZone: TZ, now: NOW });
  assert.equal(new Date(invierno.epochSeconds * 1000).getUTCHours(), 1);
  assert.equal(new Date(verano.epochSeconds * 1000).getUTCHours(), 0);
  // Y en las dos, la hora de pared que se escribe en la planilla es 21:30.
  assert.equal(invierno.timeHM, "21:30");
  assert.equal(verano.timeHM, "21:30");
});

test("la conversión hora de pared → instante es reversible", () => {
  for (const month of [1, 4, 7, 9, 12]) {
    const wall = { year: 2026, month, day: 15, hour: 21, minute: 30 };
    const parts = zonedParts(zonedToEpoch(wall, TZ), TZ);
    assert.equal(parts.timeHM, "21:30", `mes ${month}`);
    assert.equal(parts.day, 15, `mes ${month}`);
  }
});

test("deduce la mesa desde el nombre del hilo", () => {
  const cases = {
    "a-s3-m2": { division: "A", session: 3, table: 2 },
    "A · Sesión 3 · Mesa 2": { division: "A", session: 3, table: 2 },
    "liga-b-sesion-4-mesa-1": { division: "B", session: 4, table: 1 },
    "divisionA-S2-T5": { division: "A", session: 2, table: 5 },
    "🀄 Liga A | Sesión 1 | Mesa 4": { division: "A", session: 1, table: 4 },
    "b s7 mesa 6": { division: "B", session: 7, table: 6 },
  };
  for (const [name, expected] of Object.entries(cases)) {
    assert.deepEqual(parseTarget(name), expected, name);
  }
});

test("no inventa división en nombres sueltos", () => {
  assert.deepEqual(parseTarget("general"), {});
  assert.deepEqual(parseTarget("Temporada 3 charla"), {});
  assert.deepEqual(parseTarget("Mesa 2"), { table: 2 });
});

test("el hilo se completa con el canal padre", () => {
  const merged = mergeTargets({}, parseTarget("Mesa 2"), parseTarget("División A · Sesión 3"));
  assert.deepEqual(merged, { table: 2, division: "A", session: 3 });
});

test("la opción explícita le gana al nombre del hilo", () => {
  const merged = mergeTargets({ table: 5 }, parseTarget("a-s3-m2"));
  assert.deepEqual(merged, { table: 5, division: "A", session: 3 });
});

test("valida rangos", () => {
  assert.deepEqual(validateTarget({ division: "A", session: 3, table: 2 }), []);
  assert.deepEqual(validateTarget({ division: "C", session: 8, table: 0 }), ["división", "sesión", "mesa"]);
  assert.deepEqual(validateTarget({ division: "A", table: 2 }), ["sesión"]);
});

test("las filas de fecha y hora coinciden con las de scripts/sync.py", () => {
  // Las constantes por sí solas no alcanzan: lo que decide en qué celda cae la
  // fecha es el desplazamiento respecto de la fila de G1. Si sync.py lo mueve,
  // el bot escribiría en la celda equivocada sin que nada más lo note.
  const source = readFileSync(new URL("../scripts/sync.py", import.meta.url), "utf8");
  assert.match(source, /raw_date = cell_value\(ws\.cell\(g1_row - 2, value_col\)\)/);
  assert.match(source, /raw_time = cell_value\(ws\.cell\(g1_row - 1, value_col\)\)/);
  assert.match(source, /cell = ws\.cell\(g1_row \+ game - 1, value_col\)/);

  const cells = tableCells("A", 1, 1);
  assert.equal(cells.dateRow, cells.g1Row - 2);
  assert.equal(cells.timeRow, cells.g1Row - 1);
});

test("las celdas del Calendario coinciden con las de scripts/sync.py", () => {
  // Es el punto de acople real entre el bot y el pipeline: si la planilla se
  // reordena y sólo se toca uno de los dos, el bot escribe en la celda que no
  // es y el sitio no muestra nada raro hasta la próxima sesión.
  const source = readFileSync(new URL("../scripts/sync.py", import.meta.url), "utf8");
  const constant = (name) => {
    const match = new RegExp(`^${name} = (.+)$`, "m").exec(source);
    return JSON.parse(match[1].replace(/'/g, '"'));
  };
  assert.deepEqual(constant("CALENDAR_VALUE_COLS"), CALENDAR_VALUE_COLS);
  assert.deepEqual(constant("CALENDAR_PLAYER_COLS"), CALENDAR_PLAYER_COLS);
  assert.deepEqual(constant("SESSION_G1_ROWS"), SESSION_G1_ROWS);
});

test("aritmética de celdas", () => {
  assert.equal(columnLetter(3), "C");
  assert.equal(columnLetter(26), "Z");
  assert.equal(columnLetter(27), "AA");
  assert.equal(columnLetter(37), "AK");
  assert.deepEqual(
    { ...tableCells("A", 1, 1) },
    {
      g1Row: 11, valueCol: 3, playerCol: 1, dateRow: 9, timeRow: 10,
      dateCell: "Calendario!C9", timeCell: "Calendario!C10",
      paipuG1Cell: "Calendario!C11", paipuG2Cell: "Calendario!C12",
    },
  );
  assert.equal(tableCells("B", 7, 6).dateCell, "Calendario!AK57");
});

test("lee la mesa desde la grilla, tolerando filas cortas", () => {
  const grid = [];
  const put = (row, col, value) => {
    grid[row - 1] = grid[row - 1] || [];
    grid[row - 1][col - 1] = value;
  };
  ["Bodoque", "Meme000", "Mon_96", "Sh1rome"].forEach((name, index) => put(9 + index, 1, name));
  put(9, 3, "18 de julio");
  put(10, 3, "21:30");
  put(11, 3, "Mahjong Soul Game Log:https://…");

  const table = readTable(grid, "A", 1, 1);
  assert.deepEqual(table.players, ["Bodoque", "Meme000", "Mon_96", "Sh1rome"]);
  assert.equal(table.date, "18 de julio");
  assert.equal(table.time, "21:30");
  assert.ok(table.paipuG1);
  assert.equal(table.paipuG2, "");
  // Una mesa que nunca se tocó no revienta aunque la grilla venga truncada.
  assert.deepEqual(readTable(grid, "B", 7, 6).players, ["", "", "", ""]);
});

const ROSTER_MATCH = [
  { id: "A01", division: "A", name: "Bodoque", discord: ".bodoque" },
  { id: "A02", division: "A", name: "Mon_96", discord: "monique__96" },
  { id: "A03", division: "A", name: "KaijuHead", discord: "308000000000000001" },
  { id: "B01", division: "B", name: "Misiwasy2", discord: "" },
];

test("empareja al jugador por su nombre de usuario de Discord", () => {
  const named = (username, id = "") => playersFor({ username, id }, ROSTER_MATCH).map((p) => p.name);
  assert.deepEqual(named(".bodoque"), ["Bodoque"]);
  // El handle puede venir con arroba, con mayúsculas o con el discriminador viejo.
  assert.deepEqual(named("@.Bodoque"), ["Bodoque"]);
  assert.deepEqual(named("monique__96#1234"), ["Mon_96"]);
  assert.deepEqual(named("nadie"), []);
  // Una celda Discord vacía no puede emparejar con nadie.
  assert.deepEqual(playersFor({ username: "", id: "" }, ROSTER_MATCH), []);
});

test("una celda con id numérico se compara contra el id, no contra el nombre", () => {
  // El id no se puede falsificar y sobrevive a un cambio de nombre de usuario.
  assert.deepEqual(
    playersFor({ username: "cualquiera", id: "308000000000000001" }, ROSTER_MATCH).map((p) => p.name),
    ["KaijuHead"],
  );
  // Y con el id cargado, el nombre de usuario ya no alcanza.
  assert.deepEqual(playersFor({ username: "308000000000000001", id: "" }, ROSTER_MATCH), []);
});

test("verifica la firma Ed25519 de Discord", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");
  const timestamp = "1757260800";
  const rawBody = JSON.stringify({ type: 1 });
  const signature = sign(null, Buffer.from(timestamp + rawBody), privateKey).toString("hex");

  assert.equal(verifyDiscordSignature({ publicKeyHex, signature, timestamp, rawBody }), true);
  assert.equal(verifyDiscordSignature({ publicKeyHex, signature, timestamp, rawBody: rawBody + " " }), false);
  assert.equal(verifyDiscordSignature({ publicKeyHex, signature, timestamp: "1757260801", rawBody }), false);
  assert.equal(verifyDiscordSignature({ publicKeyHex, signature: "00".repeat(64), timestamp, rawBody }), false);
  assert.equal(verifyDiscordSignature({ publicKeyHex, signature: "no-es-hex", timestamp, rawBody }), false);
  assert.equal(verifyDiscordSignature({ publicKeyHex: "", signature, timestamp, rawBody }), false);
});

// --- Interacción completa, con la red simulada -------------------------------
//
// El handler sólo habla con Google y con Discord por `fetch`, así que se puede
// ejercitar entero sin salir a internet. Es la única forma de probar el camino
// que de verdad escribe en la planilla antes de desplegarlo.

const KEYS = generateKeyPairSync("ed25519");
const PUBLIC_KEY_HEX = KEYS.publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");

const ROSTER_A = [
  [1, "Bodoque", 125229166, ".bodoque", "Chileno"],
  [2, "Mon_96", 88811372, "monique__96", "Chileno"],
  [3, "KaijuHead", 121504494, "Pablov", "Chileno"],
  [4, "Sh1rome", 123196771, "sh1rome", "Uruguaya"],
  [5, "Meme000", 105237091, "memememememememe", "Uruguaya"],
];

function calendarGrid({ paipuG1 = "", date = "", time = "" } = {}) {
  // División A, sesión 3, mesa 2 → jugadores en D25:D28, valores en F25:F28.
  const grid = [];
  const put = (row, col, value) => {
    grid[row - 1] = grid[row - 1] || [];
    grid[row - 1][col - 1] = value;
  };
  ["Bodoque", "Mon_96", "Sh1rome", "Meme000"].forEach((name, index) => put(25 + index, 4, name));
  if (date) put(25, 6, date);
  if (time) put(26, 6, time);
  if (paipuG1) put(27, 6, paipuG1);
  return grid;
}

function fakeNetwork({ grid, onWrite }) {
  return async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "token-de-prueba", expires_in: 3600 });
    }
    if (href.includes("/values:batchGet")) {
      return Response.json({
        valueRanges: [{ values: grid }, { values: ROSTER_A }, { values: [] }],
      });
    }
    if (href.includes("/values:batchUpdate")) {
      const body = JSON.parse(init.body);
      onWrite?.(body);
      return Response.json({
        responses: body.data.map((entry, index) => ({
          updatedData: { range: entry.range, values: [[index === 0 ? 46221 : 0.8958333333]] },
        })),
      });
    }
    if (href.includes("/guilds/") && href.endsWith("/roles")) {
      return Response.json([{ id: "role-staff", name: "Staff" }, { id: "role-otro", name: "Jugadores" }]);
    }
    throw new Error(`Llamada no simulada: ${href}`);
  };
}

function signedRequest(interaction) {
  const rawBody = JSON.stringify(interaction);
  const timestamp = "1757260800";
  const signature = sign(null, Buffer.from(timestamp + rawBody), KEYS.privateKey).toString("hex");
  return new Request("https://liga.example/api/discord", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    body: rawBody,
  });
}

function interactionFor({
  username = ".bodoque", roles = [], channelName = "a-s3-m2", options = [],
  globalName = null, nick = null, userId = "user-1",
} = {}) {
  return {
    type: 2,
    guild_id: "guild-1",
    channel_id: "channel-1",
    channel: { id: "channel-1", name: channelName, type: 11 },
    member: { user: { id: userId, username, global_name: globalName ?? username }, roles, nick },
    data: {
      name: "agendar",
      options: [{ name: "cuando", type: 3, value: "18-07-2026 21:30" }, ...options],
    },
  };
}

async function callHandler(interaction, network, env = {}) {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    DISCORD_PUBLIC_KEY: PUBLIC_KEY_HEX,
    SHEET_ID: "sheet-de-prueba",
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "bot@example.iam.gserviceaccount.com",
      private_key: generateKeyPairSync("rsa", { modulusLength: 2048 })
        .privateKey.export({ format: "pem", type: "pkcs8" }),
    }),
    LEAGUE_TIMEZONE: TZ,
    ...env,
  });
  globalThis.fetch = network;
  try {
    const { POST } = await import("../api/discord.mjs");
    const response = await POST(signedRequest(interaction));
    return { status: response.status, body: await response.json() };
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
}

test("PING responde PONG", async () => {
  const { body } = await callHandler({ type: 1 }, async () => {
    throw new Error("un PING no debería salir a la red");
  });
  assert.deepEqual(body, { type: 1 });
});

test("rechaza una firma inválida con 401", async () => {
  process.env.DISCORD_PUBLIC_KEY = PUBLIC_KEY_HEX;
  const { POST } = await import("../api/discord.mjs");
  const response = await POST(new Request("https://liga.example/api/discord", {
    method: "POST",
    headers: { "x-signature-ed25519": "00".repeat(64), "x-signature-timestamp": "1757260800" },
    body: JSON.stringify({ type: 1 }),
  }));
  assert.equal(response.status, 401);
  delete process.env.DISCORD_PUBLIC_KEY;
});

test("un jugador de la mesa agenda desde su hilo", async () => {
  let written = null;
  const { body } = await callHandler(
    interactionFor(),
    fakeNetwork({ grid: calendarGrid(), onWrite: (payload) => { written = payload; } }),
  );
  assert.equal(written.valueInputOption, "USER_ENTERED");
  assert.deepEqual(written.data, [
    { range: "Calendario!F25", values: [["2026-07-18"]] },
    { range: "Calendario!F26", values: [["21:30"]] },
  ]);
  assert.equal(body.type, 4);
  assert.equal(body.data.flags, undefined, "la confirmación es pública, la ve la mesa entera");
  assert.match(body.data.content, /División A · Sesión 3 · Mesa 2/);
  assert.match(body.data.content, /<t:1784424600:F>/);
  assert.match(body.data.content, /Bodoque · Mon_96 · Sh1rome · Meme000/);
});

test("pide los rangos con el nombre de hoja entre comillas", async () => {
  // "Jugadores Liga A" tiene espacios: sin comillas la API rechaza el rango
  // entero y el bot no puede verificar a nadie.
  let requested = null;
  await callHandler(interactionFor(), async (url, init) => {
    if (String(url).includes("/values:batchGet")) requested = new URL(String(url)).searchParams.getAll("ranges");
    return fakeNetwork({ grid: calendarGrid() })(url, init);
  });
  assert.deepEqual(requested, [
    "Calendario!A1:AL60",
    "'Jugadores Liga A'!A2:E40",
    "'Jugadores Liga B'!A2:E40",
  ]);
});

test("informa la fecha anterior cuando la reescribe", async () => {
  const { body } = await callHandler(
    interactionFor(),
    fakeNetwork({ grid: calendarGrid({ date: "10 de julio", time: "20:00" }) }),
  );
  assert.match(body.data.content, /Antes decía: 10 de julio 20:00/);
});

test("un apodo prestado no habilita a agendar la mesa de otro", async () => {
  // El apodo del servidor y el nombre para mostrar los elige cada uno: si
  // contaran para identificar al jugador, cualquiera del servidor podría
  // ponerse ".bodoque" y reescribir la fecha de una mesa ajena.
  let written = null;
  const { body } = await callHandler(
    interactionFor({ username: "randomtroll", globalName: ".Bodoque", nick: ".bodoque" }),
    fakeNetwork({ grid: calendarGrid(), onWrite: (payload) => { written = payload; } }),
  );
  assert.equal(written, null, "no debe escribir nada");
  assert.equal(body.data.flags, 64);
  assert.match(body.data.content, /nombre de usuario/);
});

test("un ajeno a la mesa no puede agendarla", async () => {
  let written = null;
  const { body } = await callHandler(
    interactionFor({ username: "Pablov" }),
    fakeNetwork({ grid: calendarGrid(), onWrite: (payload) => { written = payload; } }),
  );
  assert.equal(written, null, "no debe escribir nada");
  assert.equal(body.data.flags, 64, "el rechazo es efímero");
  assert.match(body.data.content, /KaijuHead/);
});

test("@Staff puede agendar cualquier mesa", async () => {
  let written = null;
  const { body } = await callHandler(
    interactionFor({ username: "unaorganizadora", roles: ["role-staff"] }),
    fakeNetwork({ grid: calendarGrid(), onWrite: (payload) => { written = payload; } }),
    // El rol se resuelve por nombre, y para eso hace falta el token de bot.
    { DISCORD_BOT_TOKEN: "token-de-bot" },
  );
  assert.ok(written, "el rol @Staff habilita la escritura aunque no juegue en la mesa");
  assert.match(body.data.content, /queda agendada/);
});

test("sin token de bot, @Staff se configura por id de rol", async () => {
  let written = null;
  await callHandler(
    interactionFor({ username: "unaorganizadora", roles: ["role-staff"] }),
    fakeNetwork({ grid: calendarGrid(), onWrite: (payload) => { written = payload; } }),
    { DISCORD_STAFF_ROLE_ID: "role-staff" },
  );
  assert.ok(written);
});

test("una mesa ya jugada sólo la reagenda @Staff", async () => {
  const grid = calendarGrid({ paipuG1: "Mahjong Soul Game Log:https://…" });
  let written = null;
  const jugador = await callHandler(
    interactionFor(),
    fakeNetwork({ grid, onWrite: (payload) => { written = payload; } }),
  );
  assert.equal(written, null);
  assert.equal(jugador.body.data.flags, 64);
  assert.match(jugador.body.data.content, /ya tiene resultados cargados/);

  const staff = await callHandler(
    interactionFor({ username: "unaorganizadora", roles: ["role-staff"] }),
    fakeNetwork({ grid, onWrite: (payload) => { written = payload; } }),
    { DISCORD_STAFF_ROLE_ID: "role-staff" },
  );
  assert.ok(written);
  assert.match(staff.body.data.content, /ya tenía un paipu cargado/);
});

test("pide los datos a mano cuando el hilo no dice nada", async () => {
  const { body } = await callHandler(
    interactionFor({ channelName: "general" }),
    fakeNetwork({ grid: calendarGrid() }),
  );
  assert.equal(body.data.flags, 64);
  assert.match(body.data.content, /No pude deducir división, sesión, mesa/);
});

test("las opciones explícitas alcanzan sin nombre de hilo", async () => {
  let written = null;
  await callHandler(
    interactionFor({
      channelName: "general",
      options: [
        { name: "division", type: 3, value: "A" },
        { name: "sesion", type: 4, value: 3 },
        { name: "mesa", type: 4, value: 2 },
      ],
    }),
    fakeNetwork({ grid: calendarGrid(), onWrite: (payload) => { written = payload; } }),
  );
  assert.equal(written.data[0].range, "Calendario!F25");
});

test("avisa si Google guardó la fecha como texto", async () => {
  const network = async (url, init) => {
    if (String(url).includes("/values:batchUpdate")) {
      const body = JSON.parse(init.body);
      return Response.json({
        responses: body.data.map((entry) => ({ updatedData: { range: entry.range, values: [["2026-07-18"]] } })),
      });
    }
    return fakeNetwork({ grid: calendarGrid() })(url, init);
  };
  const { body } = await callHandler(interactionFor(), network);
  assert.match(body.data.content, /como texto y no como fecha\/hora/);
  // Las dos celdas quedaron mal: nombrar sólo una deja la otra rota después
  // de "arreglarlo".
  assert.match(body.data.content, /Calendario!F25 y Calendario!F26/);
});

test("una fecha ilegible no llega a tocar la planilla", async () => {
  const interaction = interactionFor();
  interaction.data.options[0].value = "el jueves a la noche";
  const { body } = await callHandler(interaction, async (url) => {
    throw new Error(`no debería salir a la red: ${url}`);
  });
  assert.equal(body.data.flags, 64);
  assert.match(body.data.content, /No pude interpretar la fecha/);
});
