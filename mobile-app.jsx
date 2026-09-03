// mobile-app.jsx — smartphone version of the Liga Mahjong Chile dashboard

const MOB_TWEAKS = /*EDITMODE-BEGIN*/{
  "theme": "washi",
  "dark": false,
  "lang": "es"
}/*EDITMODE-END*/;

const MOB_TABS = [
  { id: 'standings', ji: '順', es: 'Tabla', en: 'Table', pt: 'Tabela', jp: '順位' },
  { id: 'detail',    ji: '選', es: 'Perfil', en: 'Player', pt: 'Perfil', jp: '選手' },
  { id: 'compare',   ji: '対', es: 'VS', en: 'VS', pt: 'VS', jp: '比較' },
  { id: 'log',       ji: '半', es: 'Hanchan', en: 'Log', pt: 'Log', jp: '半荘' },
  { id: 'more',      ji: '殿', es: 'Más', en: 'More', pt: 'Mais', jp: 'その他' },
];
const MOB_DIV_SCOPED = ['standings', 'log'];
// Dos primeras letras para el círculo del avatar (el handle completo se desborda)
function initials(h) { return (h || '').slice(0, 2); }

// ── Rutas por hash: #/<tab>/<div|jugador> (mismo esquema que la vista desktop) ──
const MOB_ROUTE_TABS = MOB_TABS.map(t => t.id);
const MOB_ROUTE_RE = /^#\/([a-z]+)(?:\/([A-Za-z0-9_!.\-]+))?/;

function parseRoute() {
  const m = window.location.hash.match(MOB_ROUTE_RE);
  let tab = m && MOB_ROUTE_TABS.includes(m[1]) ? m[1] : 'standings';
  let div = 'A';
  let pid = null;
  if (m && m[2]) {
    const second = m[2];
    if (tab === 'detail') {
      pid = second;
      div = second[0] === 'B' ? 'B' : 'A';
    } else if (second === 'A' || second === 'B') {
      div = second;
    } else {
      pid = second;
    }
  }
  return { tab, div, pid };
}

function routeToHash(tab, div, pid) {
  const val = pid || (div === 'B' ? 'B01' : 'A01');
  return '#/' + (tab === 'detail' ? `detail/${val}` : `${tab}/${div}`);
}

// Two-series radar for the mobile comparator — one chart instead of two
function DualRadar({ a, b, size = 250, color = 'var(--accent)' }) {
  const cx = size / 2, cy = size / 2, radius = size * 0.33, N = a.length;
  const angle = i => -Math.PI / 2 + (i / N) * Math.PI * 2;
  const poly = (set) => set.map((s, i) => {
    const ang = angle(i), r = radius * s.value;
    return `${cx + Math.cos(ang) * r},${cy + Math.sin(ang) * r}`;
  }).join(' ');
  const ring = f => a.map((_, i) => {
    const ang = angle(i);
    return `${cx + Math.cos(ang) * radius * f},${cy + Math.sin(ang) * radius * f}`;
  }).join(' ');
  const [on, setOn] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setOn(true), 50); return () => clearTimeout(t); }, []);
  const grow = { transformOrigin: `${cx}px ${cy}px`, transform: on ? 'scale(1)' : 'scale(0)', transition: 'transform .7s cubic-bezier(.4,0,.2,1)' };

  return (
    <svg className="mob-radar" viewBox={`-6 -20 ${size + 12} ${size + 40}`}>
      {[0.33, 0.66, 1].map((f, i) => <polygon key={i} points={ring(f)} fill="none" stroke="var(--line)" />)}
      {a.map((_, i) => {
        const ang = angle(i);
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(ang) * radius} y2={cy + Math.sin(ang) * radius} stroke="var(--line)" />;
      })}
      {b && <polygon points={poly(b)} fill="var(--accent-2)" fillOpacity=".2" stroke="var(--accent-2)" strokeWidth="2" style={grow} />}
      <polygon points={poly(a)} fill={color} fillOpacity=".18" stroke={color} strokeWidth="2" style={grow} />
      {a.map((s, i) => {
        const ang = angle(i), r = radius * s.value;
        return <circle key={i} cx={cx + Math.cos(ang) * r} cy={cy + Math.sin(ang) * r} r="2.5" fill={color}
          style={{ opacity: on ? 1 : 0, transition: `opacity .3s ${0.25 + i * 0.05}s` }} />;
      })}
      {a.map((s, i) => {
        const ang = angle(i);
        const lx = cx + Math.cos(ang) * (radius + 22), ly = cy + Math.sin(ang) * (radius + 22);
        return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fontFamily="var(--font-mono)" fontSize="8.5" fill="var(--ink-soft)" letterSpacing=".06em">{s.label}</text>;
      })}
    </svg>
  );
}

function MobHeader({ title, jp, aside, children }) {
  const data = window.MJC_DATA;
  return (
    <div className="mob-head">
      <div className="mob-brand">
        <div className="mob-crest"></div>
        <div className="mob-wm">
          <div className="l1">Liga Mahjong Chile</div>
          <div className="l2">Riichi · 2026</div>
        </div>
        <div className="mob-live"><span className="dot"></span><span>Vivo</span></div>
      </div>
      <div className="mob-title">
        <h1>{title}</h1>
        <span className="jp">{jp}</span>
        {aside && <span className="aside">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

function MobDivSwitch({ div, onChange, data, disabled }) {
  const refs = React.useRef({});
  const [ind, setInd] = React.useState({ left: 0, width: 0 });
  React.useLayoutEffect(() => {
    const n = refs.current[div]; if (!n) return;
    const r = n.getBoundingClientRect(), p = n.parentElement.getBoundingClientRect();
    setInd({ left: r.left - p.left, width: r.width });
  }, [div]);
  return (
    <div className={`mob-divsw sel-${div} ${disabled ? 'disabled' : ''}`}>
      <div className={`mob-dsthumb div-${div}`} style={{ left: ind.left, width: ind.width }} />
      {['A', 'B'].map(d => {
        const lead = data.divisions[d].players[0];
        return (
          <button key={d} ref={el => (refs.current[d] = el)} className={`mob-dsbtn ${div === d ? 'active' : ''}`} onClick={() => onChange(d)}>
            <span className="l">División {d}</span>
            <span className="m">{lead.handle} · {fmtPts(lead.points)}</span>
          </button>
        );
      })}
    </div>
  );
}

function MobStandings({ data, div, onPick }) {
  const [sort, setSort] = React.useState('rank');
  const [nat, setNat] = React.useState(null);
  const dd = data.divisions[div];
  const natCounts = React.useMemo(() => {
    const m = {}; dd.players.forEach(p => { m[p.nat] = (m[p.nat] || 0) + 1; }); return m;
  }, [dd.players]);
  const rows = React.useMemo(() => {
    let a = [...dd.players];
    if (nat) a = a.filter(p => p.nat === nat);
    if (sort === 'win') return a.sort((x, y) => y.winRate - x.winRate);
    if (sort === 'dealin') return a.sort((x, y) => x.dealInRate - y.dealInRate);
    if (sort === 'avg') return a.sort((x, y) => x.avgRank - y.avgRank);
    return a.sort((x, y) => x.rank - y.rank);
  }, [dd.players, sort, nat]);
  const podium = dd.players.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]];
  const col = div === 'B' ? 'var(--accent-2)' : 'var(--accent)';
  const SORTS = [
    { k: 'rank', l: 'Puntos' }, { k: 'avg', l: 'Avg #' },
    { k: 'win', l: 'Win %' }, { k: 'dealin', l: 'Deal-in %' },
  ];
  const secondary = (p) => sort === 'win' ? `${p.winRate.toFixed(1)}% win`
    : sort === 'dealin' ? `${p.dealInRate.toFixed(1)}% deal-in`
    : sort === 'avg' ? `avg ${p.avgRank.toFixed(2)}`
    : `${p.games} han · avg ${p.avgRank.toFixed(2)}`;

  return (
    <div className="mob-screen">
      <div className="mob-podium">
        {order.map((p, i) => (
          <button key={p.id} className={`mob-pod p${p.rank} div-${div}`} onClick={() => onPick(p)} style={{ '--nat': COUNTRIES[p.nat].accent }}>
            <span className="medal">{p.rank}°</span>
            <div className={`avatar div-${div}`} style={{ width: p.rank === 1 ? 38 : 32, height: p.rank === 1 ? 38 : 32, borderRadius: 11, fontSize: 9 }}>{initials(p.handle)}</div>
            <Flag nat={p.nat} size={17} />
            <span className="nm">{p.shortName}{p.iormc === 'qualified' && <span className="iormc-star">★</span>}</span>
            <span className={`pt ${p.points >= 0 ? 'pos' : 'neg'}`}>{fmtPts(p.points)}</span>
          </button>
        ))}
      </div>

      <div className="mob-chips">
        <button className={`mob-chip ${!nat ? 'active' : ''}`} onClick={() => setNat(null)}>Todas <span className="cd">{dd.players.length}</span></button>
        {COUNTRY_ORDER.filter(c => natCounts[c]).map(c => (
          <button key={c} className={`mob-chip nat ${nat === c ? 'active' : ''}`} style={{ '--nat': COUNTRIES[c].accent }}
            onClick={() => setNat(nat === c ? null : c)}>
            <Flag nat={c} size={16} /><span className="cd">{natCounts[c]}</span>
          </button>
        ))}
      </div>

      <div className="mob-chips">
        {SORTS.map(s => (
          <button key={s.k} className={`mob-chip ${sort === s.k ? 'active' : ''}`} onClick={() => setSort(s.k)}>{s.l}</button>
        ))}
      </div>

      <div className="mob-rows">
        {rows.map((p, i) => (
          <button key={p.id} className={`mob-row ${p.rank <= 3 ? 'top' + p.rank : ''} ${p.zone ? 'zone-' + p.zone : ''} ${p.iormc === 'qualified' ? 'iormc-q' : ''}`}
            style={{ animationDelay: `${Math.min(i, 18) * 20}ms`, '--nat': COUNTRIES[p.nat].accent }} onClick={() => onPick(p)}>
            <span className="rk">{p.rank}</span>
            <div className={`avatar div-${div}`} style={{ width: 34, height: 34, borderRadius: 10, fontSize: 9 }}>{initials(p.handle)}</div>
            <div className="who">
              <div className="n">{p.shortName}{p.iormc === 'qualified' && <span className="iormc-star">★</span>}</div>
              <div className="s"><Flag nat={p.nat} size={14} /><span>{COUNTRIES[p.nat].name}</span><span>{secondary(p)}</span></div>
            </div>
            <div className="right">
              <span className={`p ${p.points >= 0 ? 'pos' : 'neg'}`}>{fmtPts(p.points)}</span>
              <Sparkline values={p.cum} width={54} height={16} color={col} />
            </div>
          </button>
        ))}
      </div>

      <div className="mob-zonekey">
        {div === 'A'
          ? <React.Fragment><span className="title">1-4 Playoff</span><span className="iormc">★ Top 4 CL → IORMC</span><span className="releg">21-24 Descenso</span></React.Fragment>
          : <React.Fragment><span className="promo">1-4 Promoción</span><span>21-24 Zona baja</span></React.Fragment>}
      </div>
    </div>
  );
}

function MobDetail({ data, playerId, onPick }) {
  const p = data.allPlayers.find(x => x.id === playerId) || data.divisions.A.players[0];
  const col = accentFor(p.div);
  const size = data.divisions[p.div].players.length;
  const radar = metricsToRadar(p);
  const maxY = Math.max(...p.topYaku.map(y => y.count), 1);
  const ZONE = { title: 'Zona de Playoff', relegation: 'Zona de Descenso', promotion: 'Zona de Promoción', bottom: 'Zona baja' };

  return (
    <div className="mob-screen">
      <div className="mob-picker">
        <div className={`avatar div-${p.div}`}>{initials(p.handle)}</div>
        <PlayerSelect value={p.id} onChange={onPick} data={data} />
      </div>

      <div className={`mob-card div-${p.div}`} style={{ '--nat': COUNTRIES[p.nat].accent, '--nat-alt': COUNTRIES[p.nat].alt }}>
        <div className="nat-wash"></div>
        <div className="mob-hero">
          <div className={`avatar div-${p.div}`}>{initials(p.handle)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="hn">{p.shortName}</div>
            <div className="hs nat-line"><Flag nat={p.nat} size={16} /><span>{COUNTRIES[p.nat].name}</span><span className="dot-sep">·</span><span>Div {p.div}</span><span className="dot-sep">·</span><span>{p.arch.toUpperCase()}</span></div>
          </div>
        </div>
        <div className="mob-rankrow">
          <span className="n" style={{ color: col }}>#{p.rank}</span>
          <span className="of">de {size}</span>
          <span className="pts" style={{ color: p.points >= 0 ? 'var(--good)' : 'var(--bad)' }}>{fmtPts(p.points)}</span>
        </div>
        {p.iormc && (
          <div className={`mob-iormc ${p.iormc}`}>
            <Flag nat="CL" size={18} />
            <div>
              <div className="t">
                {p.iormc === 'qualified' && `Clasificado IORMC · cupo ${p.natRank}`}
                {p.iormc === 'contention' && `En carrera · ${p.natRank}° chileno`}
                {p.iormc === 'out' && `${p.natRank}° chileno de Div A`}
              </div>
              <div className="s">Corte {fmtPts(data.iormc.cutPoints)}</div>
            </div>
          </div>
        )}
        {p.zone && <div className={`mob-zoneb ${p.zone}`}>{ZONE[p.zone]}</div>}
        <div className="mob-statgrid">
          <div className="c"><div className="l">Avg Rank</div><div className="v">{p.avgRank.toFixed(2)}</div></div>
          <div className="c"><div className="l">Avg ±</div><div className="v" style={{ color: p.avgPoints >= 0 ? 'var(--good)' : 'var(--bad)' }}>{fmtPts(p.avgPoints)}</div></div>
          <div className="c"><div className="l">Win Rate</div><div className="v">{p.winRate.toFixed(1)}%</div></div>
          <div className="c"><div className="l">Deal-in</div><div className="v" style={{ color: 'var(--bad)' }}>{p.dealInRate.toFixed(1)}%</div></div>
          <div className="c"><div className="l">Riichi</div><div className="v">{p.riichiRate.toFixed(1)}%</div></div>
          <div className="c"><div className="l">Open</div><div className="v">{p.openRate.toFixed(1)}%</div></div>
        </div>
        <div className="mob-ch" style={{ marginBottom: 6 }}><h3>Puestos</h3><span className="jp">順位率</span></div>
        <div className="mob-placebar">
          {placementSegments(p).map(s => (
            <div key={s.place} className={`pl${s.place}`} style={{ flex: s.v }}>{s.v >= 0.1 ? Math.round(s.v * 100) + '%' : ''}</div>
          ))}
        </div>
        <div className="mob-placelabels">
          {placementSegments(p).map(s => <span key={s.place} style={{ flex: s.v }}>{s.place}°</span>)}
        </div>
      </div>

      <div className="mob-card">
        <div className="mob-ch"><h3>Perfil de Juego</h3><span className="jp">プレイスタイル</span></div>
        <DualRadar key={p.id} a={radar} size={240} color={col} />
        <div className="mob-legend">
          {radar.map(s => <div className="r" key={s.label}><span>{s.label}</span><span className="v" style={{ color: col }}>{s.display}</span></div>)}
        </div>
      </div>

      <div className="mob-card">
        <div className="mob-ch"><h3>Evolución · {p.games} hanchan</h3><span className="jp">推移</span></div>
        <LineChart key={p.id} values={p.cum} color={col} height={150} />
      </div>

      <div className="mob-card">
        <div className="mob-ch"><h3>Yaku Más Jugados</h3><span className="jp">役の頻度</span></div>
        <div className="mob-yaku">
          {p.topYaku.map((y, i) => (
            <div className="r" key={y.name}>
              <span>{y.name}</span>
              <div className="bar"><div style={{ width: `${(y.count / maxY) * 100}%`, background: col, animationDelay: `${i * 70}ms` }} /></div>
              <span className="ct">{y.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobCompare({ data }) {
  const [aId, setAId] = React.useState(data.divisions.A.players[0].id);
  const [bId, setBId] = React.useState(data.divisions.B.players[0].id);
  const a = data.allPlayers.find(p => p.id === aId);
  const b = data.allPlayers.find(p => p.id === bId);
  const [k, setK] = React.useState(0);
  React.useEffect(() => { setK(v => v + 1); }, [aId, bId]);

  const metrics = [
    { key: 'points', l: 'Puntos', jp: '総合', low: false, f: fmtPts },
    { key: 'avgRank', l: 'Avg #', jp: '平均順位', low: true, f: v => v.toFixed(2) },
    { key: 'winRate', l: 'Win', jp: '和了率', low: false, f: v => v.toFixed(1) },
    { key: 'dealInRate', l: 'Deal-in', jp: '放銃率', low: true, f: v => v.toFixed(1) },
    { key: 'riichiRate', l: 'Riichi', jp: '立直率', low: false, f: v => v.toFixed(1) },
    { key: 'openRate', l: 'Open', jp: '副露率', low: false, f: v => v.toFixed(1) },
    { key: 'avgPoints', l: 'Avg ±', jp: '平均得点', low: false, f: fmtPts },
    { key: 'firstRate', l: '1° Rate', jp: 'トップ率', low: false, f: v => (v * 100).toFixed(0) + '%' },
  ];
  const scales = React.useMemo(() => {
    const enriched = data.allPlayers.map(p => ({ ...p, firstRate: p.placements.p1 }));
    const m = {};
    metrics.forEach(mt => { m[mt.key] = metricScale(enriched, mt.key, mt.low); });
    return m;
  }, [data.allPlayers]);
  const readVal = (p, key) => key === 'firstRate' ? p.placements.p1 : p[key];

  return (
    <div className="mob-screen">
      {[{ p: a, set: setAId }, { p: b, set: setBId }].map(({ p, set }, i) => (
        <div className="mob-picker" key={i}>
          <div className={`avatar div-${p.div}`}>{initials(p.handle)}</div>
          <PlayerSelect value={p.id} onChange={set} data={data} />
          <Flag nat={p.nat} size={18} />
          <span className={`div-chip ${p.div}`}>{p.div}</span>
        </div>
      ))}

      {a.div !== b.div && <div style={{ marginBottom: 12 }}><span className="mob-crosstag">Inter-división</span></div>}

      <div className="mob-card">
        <div className="mob-vsbar">
          <div className="side">
            <div className={`avatar div-${a.div}`} style={{ width: 38, height: 38, borderRadius: 11, fontSize: 9 }}>{initials(a.handle)}</div>
            <Flag nat={a.nat} size={18} />
            <span className="nm" style={{ color: 'var(--accent)' }}>{a.shortName}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>#{a.rank} Div {a.div}</span>
          </div>
          <span className="vs">VS</span>
          <div className="side">
            <div className={`avatar div-${b.div}`} style={{ width: 38, height: 38, borderRadius: 11, fontSize: 9 }}>{initials(b.handle)}</div>
            <Flag nat={b.nat} size={18} />
            <span className="nm" style={{ color: 'var(--accent-2)' }}>{b.shortName}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>#{b.rank} Div {b.div}</span>
          </div>
        </div>
        <DualRadar key={k} a={metricsToRadar(a)} b={metricsToRadar(b)} size={250} />
      </div>

      <div className="mob-card">
        <div className="mob-ch"><h3>Métricas</h3><span className="jp">成績比較</span></div>
        <div className="mob-metnote">Barra más larga = mejor</div>
        {metrics.map(m => {
          const av = readVal(a, m.key), bv = readVal(b, m.key);
          const aw = m.low ? av < bv : av > bv, bw = m.low ? bv < av : bv > av;
          const sc = scales[m.key];
          return (
            <div key={m.key} className={`mob-metric ${aw ? 'wa' : ''} ${bw ? 'wb' : ''}`}>
              <div className="va">
                <span>{m.f(av)}</span>
                <div className="tr"><div key={k + 'a' + m.key} style={{ transform: `scaleX(${sc(av)})` }} /></div>
              </div>
              <div className="lbl">{m.l}<span className="jp">{m.jp}</span></div>
              <div className="vb">
                <span>{m.f(bv)}</span>
                <div className="tr"><div key={k + 'b' + m.key} style={{ transform: `scaleX(${sc(bv)})` }} /></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobLog({ data, div }) {
  const [f, setF] = React.useState('all');
  const dd = data.divisions[div];
  const list = React.useMemo(() => {
    const a = [...dd.matches].reverse();
    return f === 'all' ? a.slice(0, 24) : a.filter(m => m.sessionCode === f);
  }, [dd.matches, f]);

  return (
    <div className="mob-screen">
      <div className="mob-chips">
        <button className={`mob-chip ${f === 'all' ? 'active' : ''}`} onClick={() => setF('all')}>Todas</button>
        {dd.sessions.map(s => (
          <button key={s.code} className={`mob-chip ${f === s.code ? 'active' : ''}`} onClick={() => setF(s.code)}>
            {s.code}<span className="cd">{s.date}</span>
          </button>
        ))}
      </div>
      {list.map((m, i) => (
        <div className="mob-hanchan" key={m.id} style={{ animationDelay: `${Math.min(i, 14) * 20}ms` }}>
          <div className="mob-hh">
            <span className="sc">{m.sessionCode} · H{m.hanchan}</span>
            <span className="mt">Mesa {m.table}</span>
            <span className="dt">{m.date}</span>
          </div>
          <div className="mob-hres">
            {m.players.map((pl, j) => (
              <div className={`r p${j + 1}`} key={pl.id}>
                <span className="pl">{j + 1}°</span>
                <Flag nat={pl.nat} size={15} />
                <span className="nm">{pl.name}<span className="h">{pl.handle}</span></span>
                <span className={`dl ${pl.delta >= 0 ? 'pos' : 'neg'}`}>{fmtPts(pl.delta)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MobMore({ data, onPick }) {
  const L = data.league;
  const io = data.iormc;
  const maxAbs = Math.max(...io.all.map(p => Math.abs(p.points)), 1);
  return (
    <div className="mob-screen">
      <div className="mob-sechead">
        <span className="div-chip CL">IORMC</span><span className="ln"></span>
        <Flag nat="CL" size={17} />
      </div>
      <div className="mob-card" style={{ borderTop: '3px solid #d52b1e' }}>
        <div className="mob-ch"><h3>Selección Chile · {io.slots} cupos</h3><span className="jp">代表選抜</span></div>
        <div className="mob-race">
          {io.all.map((p, i) => (
            <React.Fragment key={p.id}>
              {i === io.slots && <div className="mob-cut"><span>Corte {fmtPts(io.cutPoints)}</span></div>}
              <button className={`mob-rrow ${p.iormc}`} onClick={() => onPick(p)}>
                <span className="pos">{p.natRank}</span>
                <span className="nm">{p.shortName}<span className="sub">#{p.rank} liga</span></span>
                <div className="bar"><div style={{ width: `${(Math.abs(p.points) / maxAbs) * 100}%`, marginLeft: p.points < 0 ? 'auto' : 0, background: p.points >= 0 ? '#d52b1e' : 'var(--ink-faint)' }} /></div>
                <span className={`pt ${p.points >= 0 ? 'pos' : 'neg'}`}>{fmtPts(p.points)}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="mob-cutnote">Margen {io.gap.toFixed(1)} pts entre 4° y 5° · queda 1 sesión</div>
      </div>

      <div className="mob-card">
        <div className="mob-ch"><h3>Nacionalidades</h3><span className="jp">国籍別</span></div>
        <div className="mob-nats">
          {data.nationalities.map(n => (
            <div className="r" key={n.code}>
              <Flag nat={n.code} size={19} />
              <span className="nm">{COUNTRIES[n.code].name}</span>
              <div className="bar"><div style={{ width: `${(n.count / 48) * 100}%`, background: COUNTRIES[n.code].accent }} /></div>
              <span className="ct">{n.count}</span>
              <span className="dv">{n.inA}A/{n.inB}B</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mob-sechead">
        <span className="block-label">Próximas Fechas</span><span className="ln"></span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>予定</span>
      </div>
      {data.calendar.map((c, i) => (
        <div className={`mob-cal div-${c.div}`} key={i} style={{ animationDelay: `${i * 25}ms` }}>
          <div className="db">
            <div className="d">{c.date.split(' ')[0]}</div>
            <div className="m">{c.date.split(' ')[1]}</div>
          </div>
          <div className="info">
            <div className="r">{c.round}</div>
            <div className="m">{c.mesa}</div>
            <div className="m">{c.time} · {c.day}</div>
          </div>
          {c.div === 'CL' ? <Flag nat="CL" size={18} /> : <span className={`div-chip ${c.div}`}>{c.div === 'AB' ? 'A+B' : c.div}</span>}
        </div>
      ))}

      <div className="mob-sechead">
        <span className="block-label">Sesiones</span><span className="ln"></span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>{L.sessionsPlayed}/{L.sessionsTotal}</span>
      </div>
      <div className="mob-sessions">
        {data.divisions.A.sessions.map(s => (
          <div className="mob-sess done" key={s.code}><div className="c">{s.code}</div><div className="d">{s.date}</div></div>
        ))}
        <div className="mob-sess pending"><div className="c">{L.nextSession.code}</div><div className="d">{L.nextSession.date}</div></div>
      </div>

      {['A', 'B'].map(d => (
        <React.Fragment key={d}>
          <div className="mob-sechead">
            <span className={`div-chip ${d}`}>DIVISIÓN {d}</span><span className="ln"></span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>殿堂</span>
          </div>
          {data.divisions[d].hallOfFame.map((h, i) => (
            <div className={`mob-hof div-${d}`} key={i} style={{ animationDelay: `${i * 30}ms` }}>
              <div className="jpm">{h.jp}</div>
              <div className="tg">{h.tag}</div>
              <div className="vl" style={{ color: accentFor(d) }}>{h.value}</div>
              <div className="sb">{h.sub}</div>
              <div className="pl">
                <div className={`avatar div-${d}`}>{initials(h.player.handle)}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{h.player.shortName}</div>
                  <div className="nat-line" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-soft)' }}>
                    <Flag nat={h.player.nat} size={13} /><span>{COUNTRIES[h.player.nat].name}</span><span className="dot-sep">·</span><span>#{h.player.rank}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

function MobileApp() {
  const [t, setTweak] = useTweaks(MOB_TWEAKS);
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setTick(x => x + 1);
    window.addEventListener('langchange', bump);
    window.addEventListener('tzchange', bump);
    window.addEventListener('darkchange', bump);
    return () => { window.removeEventListener('langchange', bump); window.removeEventListener('tzchange', bump); window.removeEventListener('darkchange', bump); };
  }, []);
  const [route, setRoute] = React.useState(parseRoute);
  const data = window.MJC_DATA;
  const L = data.league;
  const bodyRef = React.useRef(null);
  const { tab, div, pid } = route;

  React.useEffect(() => {
    if (!window.location.hash) window.location.hash = routeToHash(tab, div, pid);
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next) => {
    const hash = routeToHash(next.tab ?? tab, next.div ?? div, next.pid ?? pid);
    if (window.location.hash !== hash) window.location.hash = hash;
    else setRoute(parseRoute());
  };

  React.useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-theme', t.theme);
    el.setAttribute('data-dark', String(!!window.DARK));
    el.setAttribute('data-density', 'regular');
    el.setAttribute('data-lang', window.LANG);
    el.setAttribute('data-div', div);
  }, [t.theme, div]);

  React.useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [tab]);

  const pick = (p) => navigate({ tab: 'detail', pid: p.id });
  const currentPid = pid || data.divisions[div].players[0].id;
  const scoped = MOB_DIV_SCOPED.includes(tab);
  const lang = window.LANG;

  const HEAD = {
    standings: { title: tr('division', { d: div }), jp: '順位表', aside: `Sesión ${L.sessionsPlayed}/${L.sessionsTotal}
uma ${L.rules[div].uma.map(v => v >= 0 ? '+' + v : '−' + Math.abs(v)).join('/')}` },
    detail: { title: tr('perfil'), jp: '選手詳細', aside: null },
    compare: { title: tr('cara_a_cara'), jp: '対戦比較', aside: null },
    log: { title: 'Hanchan', jp: '半荘記録', aside: tr('records_count', { n: data.divisions[div].matches.length }) },
    more: { title: tr('liga_lbl'), jp: '代表・殿堂', aside: `${L.playersPerDiv * 2} ${tr('jugadores')}` },
  }[tab];

  return (
    <div className="stage">
      <IOSDevice dark={!!window.DARK || t.theme === 'neon'}>
        <div className="mob">
          <div className="mob-bg"></div>
          <MobHeader title={HEAD.title} jp={HEAD.jp} aside={HEAD.aside}>
            <MobDivSwitch div={div} onChange={(d) => navigate({ div: d })} data={data} disabled={!scoped} />
          </MobHeader>

          <div className="mob-body" ref={bodyRef}>
            {tab === 'standings' && <MobStandings data={data} div={div} onPick={pick} />}
            {tab === 'detail' && <MobDetail data={data} playerId={currentPid} onPick={(id) => navigate({ pid: id })} />}
            {tab === 'compare' && <MobCompare data={data} />}
            {tab === 'log' && <MobLog data={data} div={div} />}
            {tab === 'more' && <MobMore data={data} onPick={pick} />}
          </div>

          <nav className="mob-tabbar">
            {MOB_TABS.map(mt => (
              <button key={mt.id} className={`mob-tab ${tab === mt.id ? 'active' : ''}`} onClick={() => navigate({ tab: mt.id })}>
                <span className="ji">{mt.ji}</span>
                <span className="tl">{lang === 'jp' ? mt.jp : lang === 'en' ? mt.en : lang === 'pt' ? mt.pt : mt.es}</span>
              </button>
            ))}
          </nav>
        </div>
      </IOSDevice>

      <div className="stage-cap">
        <h2>Versión smartphone</h2>
        <p>Navegación por barra inferior, tabla en tarjetas, comparador con radar superpuesto. Toca cualquier jugador para abrir su perfil.</p>
      </div>

      <TweaksPanel>
        <TweakSection label="Tema" />
        <TweakRadio label="Estilo" value={t.theme}
          options={[{ value: 'washi', label: 'Washi' }, { value: 'neon', label: 'Neon' }]}
          onChange={v => setTweak('theme', v)} />
        <TweakToggle label={tr('oscuro')} value={window.DARK} onChange={v => setDark(v)} />
        <TweakSection label="Idioma" />
        <TweakRadio label="Display" value={window.LANG}
          options={[
            { value: 'es', label: 'ES · Español' },
            { value: 'en', label: 'EN · English' },
            { value: 'pt', label: 'PT · Português (BR)' },
          ]}
          onChange={v => setLang(v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<MobileApp />);
