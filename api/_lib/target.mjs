// De dónde sale la mesa: nombre del hilo, nombre del canal padre y, como
// último recurso, las opciones que el jugador escribe a mano.
export const DIVISIONS = ["A", "B"];
export const SESSIONS_TOTAL = 7;
export const TABLES_PER_SESSION = 6;

function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Extrae división, sesión y mesa de un texto libre. Devuelve sólo lo que
 * encuentra: los tres campos son independientes para poder completar el hilo
 * con el canal padre (`Mesa 2` dentro de `División A · Sesión 3`).
 *
 * Reconoce, entre otros: `a-s3-m2`, `A · Sesión 3 · Mesa 2`,
 * `liga-b-sesion-4-mesa-1`, `divisionA-S2-T5`.
 */
export function parseTarget(text) {
  const value = normalize(text);
  if (!value) return {};
  const found = {};

  const compact = /(?:^|\s)(?:division|div|liga)?\s*([ab])\s*s\s*(\d{1,2})\s*(?:m|t|mesa|table)\s*(\d{1,2})(?:\s|$)/.exec(value);
  if (compact) {
    return { division: compact[1].toUpperCase(), session: Number(compact[2]), table: Number(compact[3]) };
  }

  const labelled = /(?:^|\s)(?:division|div|liga)\s*([ab])(?:\s|$)/.exec(value);
  if (labelled) {
    found.division = labelled[1].toUpperCase();
  } else {
    // `a` suelta sólo cuenta si viene pegada a una sesión o una mesa; si no,
    // cualquier palabra de una letra la haría pasar por división.
    const adjacent = /(?:^|\s)([ab])(?=\s*(?:s\s*\d|ses|sesion|jornada|mesa|table|m\s*\d|t\s*\d))/.exec(value);
    if (adjacent) found.division = adjacent[1].toUpperCase();
  }

  const session = /(?:^|\s)(?:sesion|session|jornada|ses|s)\s*(\d{1,2})(?:\s|$)/.exec(value);
  if (session) found.session = Number(session[1]);

  const table = /(?:^|\s)(?:mesa|table|tabla|m|t)\s*(\d{1,2})(?:\s|$)/.exec(value);
  if (table) found.table = Number(table[1]);

  return found;
}

/** El primer valor definido gana: opción explícita > hilo > canal padre. */
export function mergeTargets(...candidates) {
  const merged = {};
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const field of ["division", "session", "table"]) {
      if (merged[field] === undefined && candidate[field] !== undefined) {
        merged[field] = candidate[field];
      }
    }
  }
  return merged;
}

export function validateTarget(target) {
  const missing = [];
  if (!DIVISIONS.includes(target.division)) missing.push("división");
  if (!Number.isInteger(target.session) || target.session < 1 || target.session > SESSIONS_TOTAL) missing.push("sesión");
  if (!Number.isInteger(target.table) || target.table < 1 || target.table > TABLES_PER_SESSION) missing.push("mesa");
  return missing;
}
