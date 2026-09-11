// Disparar los workflows de GitHub Actions desde el bot.
//
// Los scripts del pipeline (`sync.py`, `fill_calendar_paipus.py`,
// `fill_game_history.py`) no corren acá y no pueden: necesitan Python, los
// secretos de Mahjong Soul y varios minutos, y Discord corta a los 3 segundos.
// Lo que hace el bot es pedirle a GitHub que corra el workflow —una sola
// llamada HTTP— y devolver el link de la corrida. Todo lo que tarde el
// pipeline pasa del otro lado.
//
// Sin dependencias de npm, igual que el resto de `api/` (ver CLAUDE.md).
const API = "https://api.github.com";

export class GithubError extends Error {}

/**
 * Los procesos que el bot sabe lanzar.
 *
 * Es la única lista: `scripts/register_discord_commands.mjs` arma las opciones
 * del comando desde acá, y un test verifica que cada `file` exista en
 * `.github/workflows/` y declare `workflow_dispatch`. Agregar un workflow al
 * comando = una entrada más acá.
 */
export const WORKFLOWS = {
  paipus: {
    file: "calendar-paipus.yml",
    label: "Paipus del torneo hacia el Calendario",
    detail: "busca las partidas nuevas del torneo, las pega en el Calendario y completa el Game History",
    schedule: "cada hora",
  },
  datos: {
    file: "sync-data.yml",
    label: "Sincronizar planilla y paipus",
    detail: "relee la planilla, recalcula las estadísticas y publica `data/generated.js`",
    schedule: "cada 15 minutos",
  },
};

// El orden importa: `paipus` llena la planilla y `datos` la lee. Al revés, lo
// que escribe el primero recién se vería en la corrida siguiente del segundo.
export const WORKFLOW_CHAIN = ["paipus", "datos"];

/** Qué workflows pide una opción del comando. `todo` los encadena. */
export function selectWorkflows(key) {
  const wanted = String(key || "").toLowerCase().trim();
  if (wanted === "todo") return WORKFLOW_CHAIN.map((name) => WORKFLOWS[name]);
  return WORKFLOWS[wanted] ? [WORKFLOWS[wanted]] : null;
}

/**
 * Token, repositorio y rama.
 *
 * El repo sale de `GITHUB_REPOSITORY` (mismo formato `owner/repo` que usa
 * Actions) o, si no está, de las variables que Vercel inyecta solas en cada
 * deploy. La rama es `main` a propósito y no la del deploy: `workflow_dispatch`
 * exige que el archivo del workflow exista en la rama que se pide, y un preview
 * de una rama cualquiera no tiene por qué tenerlo.
 */
export function githubConfig(env) {
  const owner = String(env.GITHUB_REPOSITORY || "").includes("/")
    ? env.GITHUB_REPOSITORY.trim().split("/")[0]
    : String(env.VERCEL_GIT_REPO_OWNER || "").trim();
  const repo = String(env.GITHUB_REPOSITORY || "").includes("/")
    ? env.GITHUB_REPOSITORY.trim().split("/")[1]
    : String(env.VERCEL_GIT_REPO_SLUG || "").trim();
  return {
    token: String(env.GITHUB_DISPATCH_TOKEN || env.GITHUB_TOKEN || "").trim(),
    owner,
    repo,
    slug: owner && repo ? `${owner}/${repo}` : "",
    ref: String(env.GITHUB_BRANCH || "main").trim(),
  };
}

/** Qué le falta al entorno para poder lanzar nada. `null` si está listo. */
export function githubConfigError(config) {
  if (!config.slug) {
    return "Falta `GITHUB_REPOSITORY` (formato `usuario/repo`) en el entorno del sitio.";
  }
  if (!config.token) {
    return "Falta `GITHUB_DISPATCH_TOKEN` en el entorno del sitio: es un token de GitHub con permiso de escritura sobre Actions.";
  }
  return null;
}

async function githubFetch(config, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "liga-mahjong-chile-bot",
      authorization: `Bearer ${config.token}`,
      ...(init.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message || `HTTP ${response.status}`;
    if (response.status === 401) {
      throw new GithubError(`GitHub rechazó el token (${detail}). Puede estar vencido o mal copiado.`);
    }
    // Un token de alcance fino sin permiso de Actions contesta 404, no 403: el
    // mensaje tiene que nombrar las dos causas o se busca el error donde no es.
    if (response.status === 403 || response.status === 404) {
      throw new GithubError(
        `GitHub respondió ${response.status} sobre ${config.slug} (${detail}). ` +
        "Revisá que el token tenga permiso **Actions: Read and write** sobre ese repositorio " +
        `y que el workflow exista en la rama \`${config.ref}\`.`,
      );
    }
    throw new GithubError(`GitHub respondió ${response.status}: ${detail}`);
  }
  return payload;
}

/** Página de corridas del workflow. Se linkea eso y no la corrida recién
 *  pedida porque `workflow_dispatch` contesta 204 sin id: la corrida la crea
 *  GitHub un instante después, y esperarla cuesta un round trip del budget de
 *  3 segundos de Discord. */
export function runsUrl(config, workflow) {
  return `https://github.com/${config.slug}/actions/workflows/${workflow.file}`;
}

export async function dispatchWorkflow(config, workflow, inputs = {}) {
  await githubFetch(config, `/repos/${config.slug}/actions/workflows/${workflow.file}/dispatches`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ref: config.ref, inputs }),
  });
}

/** La última corrida del workflow, o `null` si nunca corrió. */
export async function latestRun(config, workflow) {
  const query = new URLSearchParams({ per_page: "1", exclude_pull_requests: "true" });
  const payload = await githubFetch(
    config,
    `/repos/${config.slug}/actions/workflows/${workflow.file}/runs?${query}`,
  );
  const run = payload?.workflow_runs?.[0];
  if (!run) return null;
  const startedAt = Date.parse(run.run_started_at || run.created_at || "");
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    url: run.html_url,
    event: run.event,
    startedAt: Number.isNaN(startedAt) ? null : Math.floor(startedAt / 1000),
  };
}

/** Una corrida que todavía no terminó ocupa el lugar: pedir otra igual sólo
 *  repite el mismo trabajo. */
export function isRunning(run) {
  return Boolean(run) && run.status !== "completed";
}

const CONCLUSIONS = {
  success: "terminó bien",
  failure: "falló",
  cancelled: "la cancelaron",
  timed_out: "se quedó sin tiempo",
  action_required: "quedó esperando una acción manual",
  skipped: "se salteó",
  neutral: "terminó sin veredicto",
  startup_failure: "no llegó a arrancar",
};

/** Una línea en castellano sobre en qué quedó la última corrida. */
export function describeRun(run) {
  if (!run) return "Nunca corrió todavía.";
  const when = run.startedAt ? ` (arrancó <t:${run.startedAt}:R>)` : "";
  if (isRunning(run)) {
    const state = run.status === "queued" ? "está en la cola" : "está corriendo";
    return `⏳ ${state}${when} — <${run.url}>`;
  }
  const verdict = CONCLUSIONS[run.conclusion] || `terminó en \`${run.conclusion}\``;
  const icon = run.conclusion === "success" ? "✅" : "❌";
  return `${icon} La última ${verdict}${when} — <${run.url}>`;
}
