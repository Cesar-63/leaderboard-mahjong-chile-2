// Interpretación de "cuándo se juega" y traducción a las dos celdas que la
// planilla espera: una fecha y una hora locales de la liga.
//
// La hoja Calendario dice "Horarios en CLT (UTC−4)", pero Chile cambia de
// huso en verano y lo que el jugador lee en su reloj es la hora local real.
// Por eso el huso es una zona IANA (`America/Santiago` por defecto) y no un
// offset fijo; se puede sobrescribir con LEAGUE_TIMEZONE.
export const DEFAULT_TIMEZONE = "America/Santiago";

export class WhenError extends Error {}

// Cuánto hacia atrás puede quedar una fecha sin año antes de entenderla como
// del año siguiente. 30 días alcanzan para registrar una mesa recién jugada.
const BACKDATE_GRACE_SECONDS = 30 * 24 * 60 * 60;

const MONTHS_ES = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};

function stripAccents(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Descompone un instante en la fecha y hora de pared de una zona horaria. */
export function zonedParts(epochSeconds, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = {};
  for (const part of formatter.formatToParts(new Date(epochSeconds * 1000))) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute),
    dateISO: `${parts.year}-${parts.month}-${parts.day}`,
    timeHM: `${parts.hour}:${parts.minute}`,
  };
}

/**
 * Hora de pared → instante. Se itera dos veces porque el offset depende de la
 * fecha: la primera pasada lo estima y la segunda corrige los casos que caen
 * justo en el cambio de horario de verano.
 */
export function zonedToEpoch({ year, month, day, hour, minute }, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute) / 1000;
  let epoch = target;
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = zonedParts(epoch, timeZone);
    const seenAsUTC = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) / 1000;
    const drift = target - seenAsUTC;
    if (drift === 0) break;
    epoch += drift;
  }
  return epoch;
}

function parseClock(text) {
  const match = /^(\d{1,2})(?:[:.h]\s*(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function parseCalendarDate(text, referenceYear) {
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), yearInferred: false };

  match = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/.exec(text);
  if (match) {
    const year = match[3] === undefined ? referenceYear : Number(match[3]);
    return {
      year: year < 100 ? 2000 + year : year,
      month: Number(match[2]), day: Number(match[1]),
      yearInferred: match[3] === undefined,
    };
  }

  match = /^(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?$/.exec(text);
  if (match && MONTHS_ES[match[2]] !== undefined) {
    return {
      year: match[3] === undefined ? referenceYear : Number(match[3]),
      month: MONTHS_ES[match[2]],
      day: Number(match[1]),
      yearInferred: match[3] === undefined,
    };
  }
  return null;
}

function isRealDate({ year, month, day }) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/**
 * Acepta las tres formas en que la gente pega una fecha en Discord:
 *   1. el tag de timestamp de Discord, `<t:1758330000:F>`
 *   2. el epoch pelado, en segundos o milisegundos
 *   3. fecha y hora escritas a mano, en hora local de la liga
 *
 * Devuelve siempre el instante y su hora de pared, porque la planilla guarda
 * pared y la confirmación en Discord se manda como tag para que cada jugador
 * la lea en su propio huso.
 */
export function parseWhen(input, { timeZone = DEFAULT_TIMEZONE, now = Date.now() } = {}) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new WhenError("Falta la fecha.");

  const tag = /^<t:(-?\d+)(?::[tTdDfFR])?>$/.exec(raw);
  if (tag) return describe(Number(tag[1]), timeZone, "tag");

  const bare = /^(-?\d{9,14})$/.exec(raw);
  if (bare) {
    const value = Number(bare[1]);
    const epoch = Math.abs(value) >= 1e12 ? Math.round(value / 1000) : value;
    return describe(epoch, timeZone, "epoch");
  }

  const normalized = stripAccents(raw.toLowerCase())
    .replace(/\ba\s+las\b/g, " ")
    .replace(/\bhrs?\b\.?/g, " ")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const pieces = normalized.split(" ");
  for (let split = pieces.length - 1; split >= 1; split -= 1) {
    const clock = parseClock(pieces.slice(split).join(" ").replace(/\s+/g, ""));
    if (!clock) continue;
    const reference = zonedParts(Math.floor(now / 1000), timeZone);
    const date = parseCalendarDate(pieces.slice(0, split).join(" "), reference.year);
    if (!date || !isRealDate(date)) continue;
    let epoch = zonedToEpoch({ ...date, ...clock }, timeZone);
    // Sin año escrito, "05/01" en diciembre es el enero que viene, no el que
    // pasó hace once meses. Se deja un margen hacia atrás para poder registrar
    // una mesa que ya se jugó hace poco.
    if (date.yearInferred && epoch < Math.floor(now / 1000) - BACKDATE_GRACE_SECONDS) {
      const rolled = { ...date, ...clock, year: date.year + 1 };
      if (isRealDate(rolled)) epoch = zonedToEpoch(rolled, timeZone);
    }
    return describe(epoch, timeZone, "texto");
  }

  throw new WhenError(
    "No pude interpretar la fecha. Usá el tag de Discord (`<t:1758330000:F>`), " +
    "el timestamp en segundos, o `18-07-2026 21:30` en hora chilena.",
  );
}

function describe(epochSeconds, timeZone, source) {
  if (!Number.isFinite(epochSeconds) || Math.abs(epochSeconds) > 4e10) {
    throw new WhenError("El timestamp está fuera de rango.");
  }
  const parts = zonedParts(epochSeconds, timeZone);
  return {
    epochSeconds,
    dateISO: parts.dateISO,
    timeHM: parts.timeHM,
    timeZone,
    source,
  };
}
