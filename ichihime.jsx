// ichihime.jsx — Modo Ichihime: easter egg con el arte de Mahjong Soul.
//
// Las imágenes NO están en el repo: se enlazan desde files.riichi.moe, el mismo
// espejo de assets que usa MajsoulData. Así el arte nunca entra al historial de
// git y sacarlo es borrar este archivo. Si ese servidor no responde, cada imagen
// que falla se oculta sola y el sitio queda como si el modo estuviera apagado.
//
// La bandera, su persistencia y el "nya" de los textos viven en i18n.js junto a
// tr(); acá sólo va lo que se dibuja.

const ICHI_BASE = 'https://files.riichi.moe/mjg/game%20resources%20and%20tools/Mahjong%20Soul/unity_raw/extracted/MyAssets';
const ICHI_EMOTE = (n) => `${ICHI_BASE}/deco/emo/e200001/common/${n}.png`;

// Emotes del traje por defecto (los 0–8 sin texto). 1 y 4 traen texto por
// idioma, por eso no están. El 0 es el del botón.
const ICHI_EMOTES = [0, 2, 3, 5, 6, 7, 8].map(ICHI_EMOTE);
const ICHI_FULL = (skin) => `${ICHI_BASE}/deco/character/${skin}/full/full.png`;

// Un traje de fondo por pestaña (son 7 y 7). La coordinación de mesas es parte
// del calendario y usa el mismo.
const ICHI_SKINS = {
  standings: 'yiji',                 // traje por defecto
  detail: 'yiji_0',                  // el del contrato
  compare: 'yiji_kxj',               // supermercado
  log: 'yiji_haitanpaidui',          // playa
  iormc: 'yiji_CJ',                  // danza del león
  calendar: 'yiji_xinnianchuzhi',    // Año Nuevo
  coordinate: 'yiji_xinnianchuzhi',
  hof: 'yiji_SP',                    // gato-espíritu
};

const ICHI = {
  button: ICHI_EMOTE(0),
  head: `${ICHI_BASE}/deco/character/yiji/smallhead/smallhead.png`,
  full: ICHI_FULL('yiji'),
  fullFor: (tab) => ICHI_FULL(ICHI_SKINS[tab] || 'yiji'),
  emotes: ICHI_EMOTES,
};

// El CSS usa las mismas URLs para los botones: se publican como variables en
// :root para que la lista viva en un solo lugar. Un background-image sólo se
// descarga cuando una regla lo usa, y esas reglas exigen data-ichihime="true".
(function () {
  const root = document.documentElement.style;
  root.setProperty('--ichi-head', `url("${ICHI.head}")`);
  ICHI.emotes.forEach((u, i) => root.setProperty(`--ichi-emo-${i}`, `url("${u}")`));
})();

function useIchihime() {
  const [on, setOn] = React.useState(!!window.ICHIHIME);
  React.useEffect(() => {
    const sync = () => setOn(!!window.ICHIHIME);
    window.addEventListener('ichihimechange', sync);
    return () => window.removeEventListener('ichihimechange', sync);
  }, []);
  return on;
}

// <img> invisible hasta que carga y que desaparece si falla: un marco vacío o
// un ícono roto es peor que nada.
function IchiImg({ src, className = '', style, alt = '' }) {
  const [state, setState] = React.useState('loading');
  if (state === 'broken') return null;
  return <img src={src} className={`${className} ichi-img ${state}`} style={style} alt={alt} draggable="false"
    referrerPolicy="no-referrer" decoding="async" onLoad={() => setState('ready')} onError={() => setState('broken')} />;
}

// Precarga los emotes al pasar por el botón, para que la ráfaga del click no
// salga con cuadros vacíos mientras se descargan.
let ichiPreloaded = false;
function ichiPreload() {
  if (ichiPreloaded) return;
  ichiPreloaded = true;
  [...ICHI.emotes, ICHI.full, ICHI.head].forEach(src => { const img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = src; });
}

// PRNG con semilla: las posiciones se sortean una vez por activación y no
// saltan en cada re-render.
function ichiRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stickers fijos pegados a los bordes de la ventana, donde tapan menos datos.
// Los de index ≥ 4 se esconden en teléfono (ver styles.css).
function ichiStickers(seed) {
  const rnd = ichiRandom(seed);
  const slots = [
    { side: 'left', top: 16 }, { side: 'right', top: 30 },
    { side: 'left', top: 58 }, { side: 'right', top: 78 },
    { side: 'left', top: 88 }, { side: 'right', top: 52 },
    { side: 'left', top: 36 }, { side: 'right', top: 12 },
  ];
  return slots.map((slot, i) => ({
    ...slot,
    src: ICHI.emotes[Math.floor(rnd() * ICHI.emotes.length)],
    top: slot.top + (rnd() - 0.5) * 8,
    rot: Math.round((rnd() - 0.5) * 30),
    size: Math.round(50 + rnd() * 22),
    delay: (0.08 * i + rnd() * 0.12).toFixed(2),
    float: (4 + rnd() * 3).toFixed(1),
  }));
}

// Ráfaga del click: emotes que salen del botón, vuelan y se desvanecen.
function ichiBurst(seed, origin) {
  const rnd = ichiRandom(seed ^ 0x9e3779b9);
  const w = window.innerWidth, h = window.innerHeight;
  return Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2 + rnd() * 0.5;
    const dist = Math.min(w, h) * (0.25 + rnd() * 0.3);
    return {
      src: ICHI.emotes[i % ICHI.emotes.length],
      x: origin.x, y: origin.y,
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.abs(Math.sin(angle)) * dist + 40),
      rot: Math.round((rnd() - 0.5) * 120),
      delay: (rnd() * 0.15).toFixed(2),
    };
  });
}

function IchihimeToggle() {
  const on = useIchihime();
  const toggle = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    window.ICHI_ORIGIN = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    window.setIchihime(!window.ICHIHIME);
  };
  const label = on ? tr('ichihime_off') : tr('ichihime_on');
  return (
    <button className={`ichi-toggle ${on ? 'on' : ''}`} onClick={toggle} onPointerEnter={ichiPreload} onFocus={ichiPreload}
      role="switch" aria-checked={on} aria-label={label} title={label}>
      <IchiImg src={ICHI.button} className="ichi-toggle-img" />
      <span className="ichi-toggle-text">{label}</span>
    </button>
  );
}

function IchihimeLayer({ tab }) {
  const on = useIchihime();
  const [seed, setSeed] = React.useState(() => Date.now());
  const [burst, setBurst] = React.useState(null);
  React.useEffect(() => {
    if (!on) { setBurst(null); return; }
    const s = Date.now();
    setSeed(s);
    // Sólo hay ráfaga cuando lo prendió un click, no al volver a entrar al sitio.
    if (!window.ICHI_ORIGIN) return;
    setBurst(ichiBurst(s, window.ICHI_ORIGIN));
    window.ICHI_ORIGIN = null;
    const t = setTimeout(() => setBurst(null), 1800);
    return () => clearTimeout(t);
  }, [on]);
  const stickers = React.useMemo(() => ichiStickers(seed), [seed]);
  if (!on) return null;
  const credit = (window.I18N[window.LANG] || window.I18N.es).ichihime_credit;
  return (
    <React.Fragment>
      <div className="ichi-backdrop" aria-hidden="true">
        {/* key por pestaña: al cambiar, la imagen nueva entra con su animación */}
        <IchiImg key={tab} src={ICHI.fullFor(tab)} className="ichi-full" />
      </div>
      <div className="ichi-stickers" aria-hidden="true">
        {stickers.map((s, i) => (
          <div key={`${seed}-${i}`} className={`ichi-sticker ${s.side}`}
            style={{ top: `${s.top}%`, '--rot': `${s.rot}deg`, '--size': `${s.size}px`, '--delay': `${s.delay}s`, '--float': `${s.float}s` }}>
            <IchiImg src={s.src} />
          </div>
        ))}
      </div>
      {burst && (
        <div className="ichi-burst" aria-hidden="true">
          {burst.map((b, i) => (
            <div key={i} className="ichi-burst-item"
              style={{ left: b.x, top: b.y, '--dx': `${b.dx}px`, '--dy': `${b.dy}px`, '--rot': `${b.rot}deg`, '--delay': `${b.delay}s` }}>
              <IchiImg src={b.src} />
            </div>
          ))}
        </div>
      )}
      <div className="ichi-credit">{credit}</div>
    </React.Fragment>
  );
}

// Ichihime asomada en el centro de un gráfico SVG, recortada en círculo. Se
// dibuja detrás de los datos para no tapar la forma del radar.
function IchiChartBadge({ cx, cy, r, emote = 0 }) {
  const on = useIchihime();
  const [broken, setBroken] = React.useState(false);
  const id = React.useId().replace(/:/g, '');
  if (!on || broken) return null;
  return (
    <g className="ichi-chart-badge" aria-hidden="true">
      <clipPath id={`ichi-clip-${id}`}><circle cx={cx} cy={cy} r={r} /></clipPath>
      <image href={ICHI.emotes[emote % ICHI.emotes.length]} x={cx - r} y={cy - r} width={r * 2} height={r * 2}
        clipPath={`url(#ichi-clip-${id})`} preserveAspectRatio="xMidYMid slice" opacity="0.55"
        onError={() => setBroken(true)} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line-strong)" strokeWidth="1" />
    </g>
  );
}

Object.assign(window, { ICHI, IchihimeToggle, IchihimeLayer, IchiChartBadge, useIchihime });
