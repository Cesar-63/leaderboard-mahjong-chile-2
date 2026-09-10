// Acceso de escritura a la planilla.
//
// El pipeline de datos lee la planilla por el export público y no necesita
// credenciales; escribir sí. Acá se usa una cuenta de servicio de Google: el
// JWT se firma con el crypto de Node y se canjea por un access token, sin
// dependencias de npm (el repo no tiene toolchain, ver CLAUDE.md).
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

// Mismo mapa que scripts/sync.py: si la planilla se reordena, los dos tienen
// que moverse juntos.
export const CALENDAR_VALUE_COLS = { A: [3, 6, 9, 12, 15, 18], B: [22, 25, 28, 31, 34, 37] };
export const CALENDAR_PLAYER_COLS = { A: [1, 4, 7, 10, 13, 16], B: [20, 23, 26, 29, 32, 35] };
export const SESSION_G1_ROWS = [11, 19, 27, 35, 43, 51, 59];

const CALENDAR_RANGE = "Calendario!A1:AL60";
const DEFAULT_ROSTER_SHEETS = { A: "Jugadores Liga A", B: "Jugadores Liga B" };
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export class SheetsError extends Error {}

export function columnLetter(index) {
  let column = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - remainder) / 26);
  }
  return column;
}

/** Las cuatro celdas que describen una mesa del Calendario. */
export function tableCells(division, session, table) {
  const g1Row = SESSION_G1_ROWS[session - 1];
  const valueCol = CALENDAR_VALUE_COLS[division][table - 1];
  const playerCol = CALENDAR_PLAYER_COLS[division][table - 1];
  const letter = columnLetter(valueCol);
  return {
    g1Row,
    valueCol,
    playerCol,
    dateCell: `Calendario!${letter}${g1Row - 2}`,
    timeCell: `Calendario!${letter}${g1Row - 1}`,
    paipuG1Cell: `Calendario!${letter}${g1Row}`,
    paipuG2Cell: `Calendario!${letter}${g1Row + 1}`,
    dateRow: g1Row - 2,
    timeRow: g1Row - 1,
  };
}

function gridValue(grid, row, col) {
  const value = grid?.[row - 1]?.[col - 1];
  return value === undefined || value === null ? "" : String(value).trim();
}

/** Lee la mesa del Calendario tal como está hoy. */
export function readTable(grid, division, session, table) {
  const cells = tableCells(division, session, table);
  return {
    ...cells,
    players: [0, 1, 2, 3].map((offset) => gridValue(grid, cells.g1Row - 2 + offset, cells.playerCol)),
    date: gridValue(grid, cells.dateRow, cells.valueCol),
    time: gridValue(grid, cells.timeRow, cells.valueCol),
    paipuG1: gridValue(grid, cells.g1Row, cells.valueCol),
    paipuG2: gridValue(grid, cells.g1Row + 1, cells.valueCol),
  };
}

function loadCredentials(env) {
  const blob = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (blob) {
    const text = blob.trim().startsWith("{") ? blob : Buffer.from(blob, "base64").toString("utf8");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SheetsError("GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido (ni JSON en base64)");
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new SheetsError("GOOGLE_SERVICE_ACCOUNT_JSON no trae client_email/private_key");
    }
    return { email: parsed.client_email, privateKey: parsed.private_key };
  }
  if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
    // Las variables de entorno no guardan saltos de línea: la clave se pega
    // con \n literales y se restauran acá.
    return {
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  throw new SheetsError("Falta GOOGLE_SERVICE_ACCOUNT_JSON (o GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY)");
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

// El token vive ~1 hora y el módulo sobrevive entre invocaciones tibias, así
// que cachearlo saca el canje del camino crítico de los 3 s de Discord.
let tokenCache = null;

async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 60) return tokenCache.token;

  const { email, privateKey } = loadCredentials(env);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  let signature;
  try {
    signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(privateKey).toString("base64url");
  } catch (error) {
    throw new SheetsError(`No se pudo firmar el JWT de Google: ${error.message}`);
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new SheetsError(`Google rechazó las credenciales (${response.status}): ${payload.error_description || payload.error || "sin detalle"}`);
  }
  tokenCache = { token: payload.access_token, expiresAt: now + Number(payload.expires_in || 3600) };
  return tokenCache.token;
}

async function sheetsFetch(env, path, init = {}) {
  const token = await accessToken(env);
  const response = await fetch(`${SHEETS_API}/${env.SHEET_ID}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    if (response.status === 403) {
      throw new SheetsError(`La planilla no está compartida como Editor con la cuenta de servicio (${detail})`);
    }
    throw new SheetsError(`Google Sheets respondió ${response.status}: ${detail}`);
  }
  return payload;
}

export async function ensureSheet(env, title) {
  const metadata = await sheetsFetch(env, "?fields=sheets.properties.title");
  if ((metadata.sheets || []).some((sheet) => sheet?.properties?.title === title)) return;
  await sheetsFetch(env, ":batchUpdate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
}

export async function readValues(env, range) {
  const query = new URLSearchParams({ majorDimension: "ROWS" });
  return (await sheetsFetch(env, `/values/${encodeURIComponent(range)}?${query}`)).values || [];
}

export async function writeValues(env, range, values) {
  return sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

export async function appendValues(env, range, values) {
  return sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

export function rosterSheetName(config, division) {
  return config?.divisions?.[division]?.rosterSheet || DEFAULT_ROSTER_SHEETS[division];
}

/** Los nombres de hoja con espacios ("Jugadores Liga A") van entre comillas. */
export function quoteSheet(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

/** Config de la liga; si el archivo no viajó al deploy, se usan los defaults. */
export function loadConfig() {
  try {
    return JSON.parse(readFileSync(new URL("../../sync-config.json", import.meta.url), "utf8"));
  } catch {
    return null;
  }
}

/** Una sola llamada trae el Calendario y los dos rosters. */
export async function readLeague(env, config) {
  const ranges = [
    CALENDAR_RANGE,
    `${quoteSheet(rosterSheetName(config, "A"))}!A2:E40`,
    `${quoteSheet(rosterSheetName(config, "B"))}!A2:E40`,
  ];
  const query = new URLSearchParams();
  for (const range of ranges) query.append("ranges", range);
  query.set("majorDimension", "ROWS");
  const payload = await sheetsFetch(env, `/values:batchGet?${query}`);
  const [calendar, rosterA, rosterB] = payload.valueRanges || [];
  return {
    grid: calendar?.values || [],
    roster: [
      ...rosterRows(rosterA?.values || [], "A"),
      ...rosterRows(rosterB?.values || [], "B"),
    ],
  };
}

function rosterRows(rows, division) {
  const players = [];
  for (const row of rows) {
    const number = row?.[0];
    const name = String(row?.[1] ?? "").trim();
    if (number === undefined || number === "" || !name) continue;
    players.push({
      id: `${division}${String(number).padStart(2, "0")}`,
      division,
      name,
      discord: String(row?.[3] ?? "").trim(),
    });
  }
  return players;
}

/**
 * Escribe fecha y hora. `USER_ENTERED` con fecha ISO y hora `HH:MM` deja
 * valores reales de fecha/hora en cualquier locale de la planilla, y la celda
 * conserva su formato ("18 de julio"). Se pide el valor de vuelta como serial
 * para confirmar que Google los guardó como fecha y no como texto: si quedaran
 * como texto, sync.py los leería como "Por definir" sin fallar.
 */
export async function writeSchedule(env, { dateCell, timeCell, dateISO, timeHM }) {
  const payload = await sheetsFetch(env, "/values:batchUpdate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      includeValuesInResponse: true,
      responseValueRenderOption: "UNFORMATTED_VALUE",
      responseDateTimeRenderOption: "SERIAL_NUMBER",
      data: [
        { range: dateCell, values: [[dateISO]] },
        { range: timeCell, values: [[timeHM]] },
      ],
    }),
  });
  const stored = (payload.responses || []).map((entry) => entry?.updatedData?.values?.[0]?.[0]);
  return {
    storedAsDate: typeof stored[0] === "number",
    storedAsTime: typeof stored[1] === "number",
    stored,
  };
}
