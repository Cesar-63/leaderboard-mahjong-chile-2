// stat-tips.jsx — registro de métricas del perfil y sus tooltips.
//
// Cada casilla de stats declara acá qué mide, con qué fórmula sale y sobre qué
// muestra se calcula, así el número y su explicación salen de la misma fuente.
// El formato del tooltip sigue al de amae-koromo: la fórmula en palabras, la
// muestra real y dónde queda el jugador dentro de su división.

// Denominador bajo el cual la métrica es ruido: se muestra, pero atenuada.
const STAT_MIN_SAMPLE = 10;

const statPct = (v) => v.toFixed(1) + '%';
// Puntos sin separador de miles: al lado de un 11.65 de junme, un "5.427"
// se lee como decimal.
const statPoints = (v) => String(Math.round(v));
const statTurn = (v) => v.toFixed(2);

// `lower: true` = menos es mejor (para el ranking dentro de la división).
// `den` es el denominador real de la métrica, no siempre las manos jugadas.
const STAT_METRICS = {
  avgRank: {
    jp: '平均順位', label: 'lbl_avgrank', formula: 'fx_avgrank', unit: 'den_played',
    value: (p) => p.avgRank, den: (p) => p.games - p.absences, fmt: (v) => v.toFixed(2), lower: true,
  },
  avgPoints: {
    jp: '平均得点', label: 'lbl_avgpts', formula: 'fx_avgpts', unit: 'den_games',
    value: (p) => p.avgPoints, den: (p) => p.games, fmt: (v) => fmtPts(v), signed: true,
  },
  winRate: {
    jp: '和了率', label: 'lbl_winrate', formula: 'fx_winrate', unit: 'den_hands',
    value: (p) => p.winRate, num: (p) => p.wins, den: (p) => p.hands, fmt: statPct, advanced: true,
  },
  dealInRate: {
    jp: '放銃率', label: 'lbl_dealin', formula: 'fx_dealin', unit: 'den_hands',
    value: (p) => p.dealInRate, num: (p) => p.dealIns, den: (p) => p.hands, fmt: statPct,
    advanced: true, lower: true, tone: 'bad',
  },
  riichiRate: {
    jp: '立直率', label: 'lbl_riichi', formula: 'fx_riichi', unit: 'den_hands',
    value: (p) => p.riichiRate, num: (p) => p.riichis, den: (p) => p.hands, fmt: statPct, advanced: true,
  },
  openRate: {
    jp: '副露率', label: 'lbl_open', formula: 'fx_open', note: 'fx_open_note', unit: 'den_hands',
    value: (p) => p.openRate, num: (p) => p.openHands, den: (p) => p.hands, fmt: statPct, advanced: true,
  },
  damatenRate: {
    jp: '黙聴率', label: 'lbl_damaten', formula: 'fx_damaten', note: 'fx_damaten_note', unit: 'den_wins',
    value: (p) => p.damatenRate, num: (p) => p.damaten, den: (p) => p.wins, fmt: statPct, advanced: true,
  },
  avgWinPoints: {
    jp: '平均打点', label: 'lbl_winpts', formula: 'fx_winpts', note: 'fx_points_note', unit: 'den_wins',
    value: (p) => p.avgWinPoints, den: (p) => p.wins, fmt: statPoints, advanced: true,
  },
  avgDealInPoints: {
    jp: '平均銃点', label: 'lbl_dealinpts', formula: 'fx_dealinpts', note: 'fx_points_note', unit: 'den_dealins',
    value: (p) => p.avgDealInPoints, den: (p) => p.dealIns, fmt: statPoints,
    advanced: true, lower: true, tone: 'bad',
  },
  avgWinTurn: {
    jp: '和了巡数', label: 'lbl_winturn', formula: 'fx_winturn', note: 'fx_winturn_note', unit: 'den_wins',
    value: (p) => p.avgWinTurn, den: (p) => p.wins, fmt: statTurn, advanced: true, lower: true,
  },
};

// Valor de la métrica, o null cuando todavía no hay con qué calcularla: sin
// paipus parseados, o con el denominador en cero (nadie tiene "0% damaten"
// cuando aún no gana una mano).
function statValue(player, key) {
  const metric = STAT_METRICS[key];
  if (!metric || !player) return null;
  if (metric.advanced && !(player.statsSample > 0)) return null;
  if (metric.den(player) <= 0) return null;
  const value = metric.value(player);
  return typeof value === 'number' && isFinite(value) ? value : null;
}

// Los pares de la misma división con la métrica disponible, para situar al
// jugador. Cruzar divisiones no tendría sentido: A y B juegan con umas y
// akadora distintos.
function statPeers(data, player, key) {
  const division = data.divisions[player.div];
  return division.players
    .map((peer) => ({ id: peer.id, value: statValue(peer, key) }))
    .filter((item) => item.value !== null);
}

function statInfo(player, data, key) {
  const metric = STAT_METRICS[key];
  const value = statValue(player, key);
  const den = metric.den(player);
  const num = metric.num ? metric.num(player) : null;
  const peers = data ? statPeers(data, player, key) : [];
  const values = peers.map((item) => item.value).sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : null;
  const rank = value === null ? null
    : peers.filter((item) => (metric.lower ? item.value < value : item.value > value)).length + 1;
  return {
    key, metric, value, den, num, peers, median, rank, div: player.div,
    display: value === null ? '—' : metric.fmt(value),
    weak: value !== null && den < STAT_MIN_SAMPLE,
  };
}

// Tira de distribución: un tick por jugador de la división sobre el rango real,
// con el jugador actual destacado. Es la versión chica del histograma que
// amae-koromo muestra en su tooltip; con 24 jugadores un histograma por bins
// sería más ruido que señal.
function StatDistribution({ info, color }) {
  const width = 232, height = 34, pad = 8, base = 24;
  const values = info.peers.map((item) => item.value);
  if (values.length < 4 || info.value === null) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const x = (v) => pad + ((v - min) / range) * (width - pad * 2);
  const fmt = info.metric.fmt;
  return (
    <svg className="st-dist" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line x1={pad} y1={base} x2={width - pad} y2={base} stroke="var(--line-strong)" strokeWidth="1" />
      {values.map((v, i) => (
        <rect key={i} x={x(v) - 1} y={base - 9} width="2" height="9" rx="1" fill="var(--ink-faint)" opacity=".45" />
      ))}
      <rect x={x(info.value) - 2.5} y={base - 16} width="5" height="16" rx="1.5"
        fill={color} stroke="var(--bg-elev)" strokeWidth="2" paintOrder="stroke" />
      <text x={pad} y={height - 2} className="st-axis" textAnchor="start">{fmt(min)}</text>
      <text x={width - pad} y={height - 2} className="st-axis" textAnchor="end">{fmt(max)}</text>
    </svg>
  );
}

// Tooltip en portal: la grilla de stats tiene overflow oculto, así que la
// tarjeta se dibuja sobre el body y se ancla al elemento con coordenadas fijas.
function StatTip({ info, color, children }) {
  const [anchor, setAnchor] = React.useState(null);
  const ref = React.useRef(null);

  const open = React.useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setAnchor({ x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
  }, []);
  const close = React.useCallback(() => setAnchor(null), []);

  React.useEffect(() => {
    if (!anchor) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const onPointer = (event) => { if (ref.current && !ref.current.contains(event.target)) close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [anchor, close]);

  const metric = info.metric;
  const card = anchor && (() => {
    const half = 132;
    const x = Math.max(half + 6, Math.min(window.innerWidth - half - 6, anchor.x));
    const below = anchor.bottom + 210 < window.innerHeight || anchor.top < 220;
    const style = below
      ? { left: x, top: anchor.bottom + 10, transform: 'translateX(-50%)' }
      : { left: x, top: anchor.top - 10, transform: 'translate(-50%,-100%)' };
    return ReactDOM.createPortal(
      <div className={`stat-tip ${below ? 'below' : 'above'}`} style={style} role="tooltip">
        <span className="st-arrow" style={{ left: `calc(50% + ${anchor.x - x}px)` }} />
        <div className="st-head">
          <span className="st-name">{tr(metric.label)}</span>
          <span className="st-jp">{metric.jp}</span>
        </div>
        <div className="st-formula">
          <span className="st-fl">{tr('st_how')}</span>
          {tr(metric.formula)}
        </div>
        {metric.note && <div className="st-note">{tr(metric.note)}</div>}
        <div className="st-sample">
          <span className="st-sl">{tr('st_based')}</span>
          {info.num !== null && info.value !== null
            ? tr('st_sample_ratio', { num: info.num, den: info.den, unit: tr(metric.unit) })
            : tr('st_sample_plain', { den: info.den, unit: tr(metric.unit) })}
          {info.weak && <span className="st-weak"> · {tr('st_small_sample')}</span>}
        </div>
        <div className="st-pos">
          <span className="st-pl">{tr('st_position')}</span>
          <StatDistribution info={info} color={color} />
        </div>
        {info.rank && (
          <div className="st-foot">
            {tr('st_context', {
              div: info.div, rank: info.rank, total: info.peers.length, median: metric.fmt(info.median),
            })}
          </div>
        )}
      </div>,
      document.body,
    );
  })();

  return (
    <span ref={ref} className="stat-tip-anchor" tabIndex={0} role="button" aria-label={tr(metric.label)}
      onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
      onClick={(event) => { event.stopPropagation(); anchor ? close() : open(); }}>
      {children}
      {card}
    </span>
  );
}

// Casilla de stat: rótulo, valor y tooltip. `className` deja reusar la misma
// pieza en la grilla del escritorio y en la del teléfono.
function StatCell({ metric, player, data, className = 'stat-cell' }) {
  const info = statInfo(player, data, metric);
  const color = accentFor(player.div);
  const tone = info.metric.tone === 'bad' && info.value !== null ? { color: 'var(--bad)' }
    : info.metric.signed && info.value !== null ? { color: info.value >= 0 ? 'var(--good)' : 'var(--bad)' }
      : undefined;
  return (
    <div className={className}>
      <div className="l">{tr(info.metric.label)} · {info.metric.jp}</div>
      <StatTip info={info} color={color}>
        <div className={`v${info.weak ? ' weak' : ''}`} style={tone}>{info.display}</div>
      </StatTip>
    </div>
  );
}

// Orden de las casillas del perfil: primero lo de la liga, después lo que sale
// de los paipus (las cuatro últimas son las métricas al estilo amae-koromo).
const PROFILE_STATS = [
  'avgRank', 'avgPoints', 'winRate', 'dealInRate', 'riichiRate', 'openRate',
  'damatenRate', 'avgWinPoints', 'avgDealInPoints', 'avgWinTurn',
];
