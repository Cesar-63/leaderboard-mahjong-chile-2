// components-detail.jsx — player detail, comparator, hanchan log, calendar, hall of fame

function accentFor(div) { return div === 'B' ? 'var(--accent-2)' : 'var(--accent)'; }
// Dos primeras letras para el círculo del avatar (el handle completo se desborda)
function initials(h) { return (h || '').slice(0, 2); }

function metricsToRadar(p) {
  const hasStats = p.statsSample > 0;
  return [
    { label: 'WIN', display: hasStats ? p.winRate.toFixed(0) + '%' : '—', value: hasStats ? clamp01(p.winRate / 30) : 0 },
    { label: 'DEF', display: hasStats ? (100 - p.dealInRate).toFixed(0) + '%' : '—', value: hasStats ? clamp01((20 - p.dealInRate) / 14) : 0 },
    { label: 'RIICHI', display: hasStats ? p.riichiRate.toFixed(0) + '%' : '—', value: hasStats ? clamp01(p.riichiRate / 32) : 0 },
    { label: 'OPEN', display: hasStats ? p.openRate.toFixed(0) + '%' : '—', value: hasStats ? clamp01(p.openRate / 50) : 0 },
    { label: 'AVG#', display: p.avgRank.toFixed(2), value: clamp01((4 - p.avgRank) / 1.5) },
    { label: 'PTS', display: fmtPts(p.avgPoints), value: clamp01((p.avgPoints + 12) / 30) },
  ];
}

function placementSegments(p) {
  return [p.placements.p1, p.placements.p2, p.placements.p3, p.placements.p4]
    .map((v, i) => ({ place: i + 1, v }))
    .filter(s => s.v > 0);
}

function PlayerSelect({ value, onChange, data, style }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={style}>
      {['A', 'B'].map(d => (
        <optgroup key={d} label={`División ${d}`}>
          {data.divisions[d].players.map(pp => (
            <option key={pp.id} value={pp.id}>#{pp.rank} · {pp.shortName} · {COUNTRIES[pp.nat].name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function PlayerDetail({ playerId, data, onPick }) {
  const all = data.allPlayers;
  const p = all.find(x => x.id === playerId) || data.divisions.A.players[0];
  const divSize = data.divisions[p.div].players.length;
  const color = accentFor(p.div);

  const hasStats = p.statsSample > 0;
  const radar = [
    { label: 'WIN',     display: hasStats ? p.winRate.toFixed(1) + '%' : '—', value: hasStats ? clamp01(p.winRate / 30) : 0 },
    { label: 'DEFENSE', display: hasStats ? (100 - p.dealInRate).toFixed(1) + '%' : '—', value: hasStats ? clamp01((20 - p.dealInRate) / 14) : 0 },
    { label: 'RIICHI',  display: hasStats ? p.riichiRate.toFixed(1) + '%' : '—', value: hasStats ? clamp01(p.riichiRate / 32) : 0 },
    { label: 'OPEN',    display: hasStats ? p.openRate.toFixed(1) + '%' : '—', value: hasStats ? clamp01(p.openRate / 50) : 0 },
    { label: 'AVG #',   display: p.avgRank.toFixed(2), value: clamp01((4 - p.avgRank) / 1.5) },
    { label: 'POINTS',  display: fmtPts(p.avgPoints), value: clamp01((p.avgPoints + 12) / 30) },
  ];
  const maxYaku = Math.max(...p.topYaku.map(y => y.count), 1);

  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">02 / Perfil</span>
          <h1>{p.shortName}</h1>
          <span className={`div-chip ${p.div}`}>DIV {p.div}</span>
          <NatTag nat={p.nat} showName size={17} />
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>選手詳細</span>
        </div>
        <PlayerSelect value={p.id} onChange={onPick} data={data}
          style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', font: 'inherit', color: 'inherit' }} />
      </div>

      <div className="detail-grid">
        <div className={`detail-hero div-${p.div}`} style={{ '--nat': COUNTRIES[p.nat].accent, '--nat-alt': COUNTRIES[p.nat].alt }}>
          <div className="nat-wash"></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
            <div className={`avatar div-${p.div}`} style={{ width: 80, height: 80, fontSize: 22, borderRadius: 18 }}>{initials(p.handle)}</div>
            <div>
              <div className="name">{p.shortName}</div>
              <div className="sub nat-line"><Flag nat={p.nat} size={18} /><span>{COUNTRIES[p.nat].name}</span><span className="dot-sep">·</span><span>Div {p.div}</span><span className="dot-sep">·</span><span>{p.arch.toUpperCase()}</span></div>
            </div>
          </div>

          <div className="rank-big">
            <span className="n" style={{ color }}>#{p.rank}</span>
            <span className="of">de {divSize} · Div {p.div}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: p.points >= 0 ? 'var(--good)' : 'var(--bad)' }}>{fmtPts(p.points)}</span>
          </div>

          {p.iormc && (
            <div className={`iormc-banner ${p.iormc}`}>
              <Flag nat="CL" size={20} />
              <div>
                <div className="ib-t">
                  {p.iormc === 'qualified' && `Clasificado IORMC · cupo ${p.natRank}`}
                  {p.iormc === 'contention' && `En carrera IORMC · ${p.natRank}° chileno`}
                  {p.iormc === 'out' && `${p.natRank}° chileno de División A`}
                </div>
                <div className="ib-s">Top 4 chileno de División A · corte {fmtPts(data.iormc.cutPoints)}</div>
              </div>
            </div>
          )}

          {p.zone && (
            <div className={`zone-banner ${p.zone}`}>
              {p.zone === 'title' && 'Zona de Playoff por el Título'}
              {p.zone === 'relegation' && 'Zona de Descenso a División B'}
              {p.zone === 'promotion' && 'Zona de Promoción a División A'}
              {p.zone === 'bottom' && 'Zona baja de División B'}
            </div>
          )}

          <div className="stat-block">
            <div className="stat-cell"><div className="l">Avg Rank · 平均順位</div><div className="v">{p.avgRank.toFixed(2)}</div></div>
            <div className="stat-cell"><div className="l">Avg ± · 平均得点</div><div className="v" style={{ color: p.avgPoints >= 0 ? 'var(--good)' : 'var(--bad)' }}>{fmtPts(p.avgPoints)}</div></div>
            <div className="stat-cell"><div className="l">Win Rate · 和了率</div><div className="v">{fmtAdvanced(p, 'winRate', '%')}</div></div>
            <div className="stat-cell"><div className="l">Deal-in · 放銃率</div><div className="v" style={{ color: 'var(--bad)' }}>{fmtAdvanced(p, 'dealInRate', '%')}</div></div>
            <div className="stat-cell"><div className="l">Riichi · 立直率</div><div className="v">{fmtAdvanced(p, 'riichiRate', '%')}</div></div>
            <div className="stat-cell"><div className="l">Open · 副露率</div><div className="v">{fmtAdvanced(p, 'openRate', '%')}</div></div>
          </div>

          <div>
            <div className="block-label">Distribución de Puestos · 順位率</div>
            <div className="placement-bar">
              {placementSegments(p).map(s => (
                <div key={s.place} className={`pl${s.place}`} style={{ flex: s.v }}>{s.v >= 0.08 ? Math.round(s.v * 100) + '%' : ''}</div>
              ))}
            </div>
            <div className="placement-legend">
              {placementSegments(p).map(s => (
                <span key={s.place} style={{ flex: s.v }}>{s.place}°</span>
              ))}
            </div>
          </div>
        </div>

        <div className="detail-right">
          <div className="chart-card">
            <div className="ch-head"><h3>Perfil de Juego</h3><span className="jp">プレイスタイル</span></div>
            <div className="radar-wrap">
              <RadarChart key={p.id} stats={radar} color={color} size={300} />
              <div className="radar-legend">
                {radar.map(s => (
                  <div className="rl" key={s.label}><span>{s.label}</span><span className="v" style={{ color }}>{s.display}</span></div>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-card line-card">
            <div className="ch-head"><h3>Evolución de Puntos · {p.games} hanchan</h3><span className="jp">スコア推移</span></div>
            <LineChart key={p.id} values={p.cum} color={color} />
          </div>

          <div className="chart-card">
            <div className="ch-head"><h3>Yaku Más Jugados</h3><span className="jp">役の頻度</span></div>
            <div className="yaku-list">
              {p.topYaku.map((y, i) => (
                <div className="yaku-row" key={y.name}>
                  <div className="name">{y.name}</div>
                  <div className="bar"><div style={{ width: `${(y.count / maxYaku) * 100}%`, background: color, animationDelay: `${i * 80}ms` }} /></div>
                  <div className="count">{y.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IORMCView({ data, onPick }) {
  const io = data.iormc;
  const cl = COUNTRIES.CL;
  const maxAbs = Math.max(...io.all.map(p => Math.abs(p.points)), 1);

  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">06 / Selección</span>
          <h1>Camino al IORMC</h1>
          <Flag nat="CL" size={22} />
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>代表選抜</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'right' }}>
          <div>International Online Riichi Mahjong Championship</div>
          <div style={{ color: 'var(--ink-faint)' }}>{io.slots} cupos · {io.eligible} chilenos en División A</div>
        </div>
      </div>

      <div className="iormc-podium">
        {io.qualified.map((p, i) => (
          <button className="iq-card" key={p.id} onClick={() => onPick(p)}
            style={{ animation: 'rowin .4s ease both', animationDelay: `${i * 60}ms` }}>
            <div className="iq-flagwash"></div>
            <div className="iq-slot">Cupo {i + 1}</div>
            <div className="iq-av"><div className="avatar div-A" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 12 }}>{initials(p.handle)}</div></div>
            <div className="iq-nm">{p.shortName}</div>
            <div className="iq-meta">#{p.rank} División A · {p.games} hanchan</div>
            <div className="iq-pts">{fmtPts(p.points)}</div>
            <div className="iq-stats">
              <span>Avg {p.avgRank.toFixed(2)}</span><span>Win {p.winRate.toFixed(1)}%</span><span>Deal-in {p.dealInRate.toFixed(1)}%</span>
            </div>
          </button>
        ))}
      </div>

      <div className="iormc-grid">
        <div className="chart-card">
          <div className="ch-head"><h3>Carrera chilena · División A</h3><span className="jp">チリ代表予選</span></div>
          <div className="race-list">
            {io.all.map((p, i) => {
              const isCut = i === io.slots;
              return (
                <React.Fragment key={p.id}>
                  {isCut && <div className="race-cut"><span>Corte · {fmtPts(io.cutPoints)}</span></div>}
                  <button className={`race-row ${p.iormc}`} onClick={() => onPick(p)}>
                    <span className="rr-pos">{p.natRank}</span>
                    <div className="avatar div-A" style={{ width: 28, height: 28, borderRadius: 9, fontSize: 8.5 }}>{initials(p.handle)}</div>
                    <span className="rr-nm">{p.shortName}<span className="rr-sub">#{p.rank} liga</span></span>
                    <div className="rr-bar">
                      <div style={{ width: `${(Math.abs(p.points) / maxAbs) * 100}%`, marginLeft: p.points < 0 ? 'auto' : 0, background: p.points >= 0 ? cl.accent : 'var(--ink-faint)' }} />
                    </div>
                    <span className={`rr-pt ${p.points >= 0 ? 'pos' : 'neg'}`}>{fmtPts(p.points)}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="chart-card">
            <div className="ch-head"><h3>Margen del corte</h3><span className="jp">差</span></div>
            <div className="cut-stat">
              <div className="cs-big">{io.gap.toFixed(1)}</div>
              <div className="cs-lb">puntos entre el 4° y el 5° chileno</div>
            </div>
            <div className="cut-pair">
              <div className="cp in"><span className="cp-l">Dentro · 4°</span><span className="cp-n">{io.qualified[3].shortName}</span><span className="cp-p">{fmtPts(io.qualified[3].points)}</span></div>
              <div className="cp out"><span className="cp-l">Fuera · 5°</span><span className="cp-n">{io.contention[0].shortName}</span><span className="cp-p">{fmtPts(io.contention[0].points)}</span></div>
            </div>
            <div className="cut-note">Queda 1 sesión · 2 hanchan por jugador</div>
          </div>

          <div className="chart-card">
            <div className="ch-head"><h3>Composición de la liga</h3><span className="jp">国籍別</span></div>
            <div className="nat-breakdown">
              {data.nationalities.map(n => (
                <div className="nb-row" key={n.code}>
                  <Flag nat={n.code} size={20} />
                  <span className="nb-nm">{COUNTRIES[n.code].name}</span>
                  <div className="nb-bar">
                    <div style={{ width: `${(n.count / 48) * 100}%`, background: COUNTRIES[n.code].accent }} />
                  </div>
                  <span className="nb-ct">{n.count}</span>
                  <span className="nb-div">{n.inA}A / {n.inB}B</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Bar length in the comparator always means "better", scaled across the real
// roster range for that metric — no hardcoded ceilings to saturate against.
function metricScale(allPlayers, key, lowerIsBetter) {
  const vals = allPlayers.map(p => p[key]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = (hi - lo) || 1;
  return (v) => {
    const t = (v - lo) / span;
    return 0.06 + 0.94 * clamp01(lowerIsBetter ? 1 - t : t);
  };
}

function Comparator({ data }) {
  const all = data.allPlayers;
  const [aId, setAId] = React.useState(data.divisions.A.players[0].id);
  const [bId, setBId] = React.useState(data.divisions.B.players[0].id);
  const a = all.find(p => p.id === aId);
  const b = all.find(p => p.id === bId);
  const [animKey, setAnimKey] = React.useState(0);
  React.useEffect(() => { setAnimKey(k => k + 1); }, [aId, bId]);

  const metrics = [
    { key: 'points', label: 'Puntos', jp: '総合', lower: false, fmt: fmtPts },
    { key: 'avgRank', label: 'Avg Rank', jp: '平均順位', lower: true, fmt: v => v.toFixed(2) },
    { key: 'winRate', label: 'Win Rate', jp: '和了率', lower: false, fmt: v => v.toFixed(1) + '%' },
    { key: 'dealInRate', label: 'Deal-in', jp: '放銃率', lower: true, fmt: v => v.toFixed(1) + '%' },
    { key: 'riichiRate', label: 'Riichi', jp: '立直率', lower: false, fmt: v => v.toFixed(1) + '%' },
    { key: 'openRate', label: 'Open Hand', jp: '副露率', lower: false, fmt: v => v.toFixed(1) + '%' },
    { key: 'avgPoints', label: 'Avg ±', jp: '平均得点', lower: false, fmt: fmtPts },
    { key: 'firstRate', label: '1° Rate', jp: 'トップ率', lower: false, fmt: v => (v * 100).toFixed(0) + '%' },
  ];
  const scales = React.useMemo(() => {
    const enriched = data.allPlayers.map(p => ({ ...p, firstRate: p.placements.p1 }));
    const m = {};
    metrics.forEach(mt => { m[mt.key] = metricScale(enriched, mt.key, mt.lower); });
    return m;
  }, [data.allPlayers]);
  const readVal = (p, key) => key === 'firstRate' ? p.placements.p1 : p[key];

  const crossDiv = a.div !== b.div;

  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">03 / Comparador</span>
          <h1>Cara a Cara</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>対戦比較</span>
        </div>
        <div className="vs-header">
          <span className={`div-chip ${a.div}`}>{a.handle}</span>
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>VS</span>
          <span className={`div-chip ${b.div}`}>{b.handle}</span>
          {crossDiv && <span className="cross-tag">Inter-división</span>}
        </div>
      </div>

      <div className="comp-wrap">
        {[{ p: a, side: 'a', set: setAId }, { p: b, side: 'b', set: setBId }].map(({ p, side, set }) => (
          <div className={`comp-col ${side} div-${p.div}`} key={side}>
            <div className="comp-pick">
              <div className={`avatar div-${p.div}`} style={{ width: 48, height: 48, fontSize: 13, borderRadius: 12 }}>{initials(p.handle)}</div>
              <PlayerSelect value={p.id} onChange={set} data={data} />
            </div>
            <div className="comp-sub">
              <span className={`div-chip ${p.div}`}>DIV {p.div}</span>
              <NatTag nat={p.nat} showName size={16} />
              <span>#{p.rank} · {p.games} han</span>
            </div>
            <RadarChart key={side + animKey} stats={metricsToRadar(p)} color={side === 'a' ? 'var(--accent)' : 'var(--accent-2)'} size={260} />
          </div>
        ))}
      </div>

      <div className="metrics-card">
        <div className="metrics-head">
          <span className="block-label">Métricas · 成績比較</span>
          <span className="metrics-note">Barra más larga = mejor, escalada al rango de la liga</span>
        </div>
        {metrics.map(m => {
          const av = readVal(a, m.key), bv = readVal(b, m.key);
          const aBetter = m.lower ? av < bv : av > bv;
          const bBetter = m.lower ? bv < av : bv > av;
          const sc = scales[m.key];
          return (
            <div key={m.key} className={`versus-row ${aBetter ? 'win-a' : ''} ${bBetter ? 'win-b' : ''}`}>
              <div className="val-a">
                <span style={{ flex: 1, textAlign: 'right' }}>{m.fmt(av)}</span>
                <div className="bar-a"><div key={animKey + 'a' + m.key} style={{ transform: `scaleX(${sc(av)})` }} /></div>
              </div>
              <div className="vs-label">{m.label}<span className="jp">{m.jp}</span></div>
              <div className="val-b">
                <div className="bar-b"><div key={animKey + 'b' + m.key} style={{ transform: `scaleX(${sc(bv)})` }} /></div>
                <span style={{ flex: 1, textAlign: 'left' }}>{m.fmt(bv)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HanchanLog({ data, div }) {
  const [filter, setFilter] = React.useState('all');
  const divData = data.divisions[div];
  const sessions = divData.sessions;
  const matches = React.useMemo(() => {
    const arr = [...divData.matches].reverse();
    return filter === 'all' ? arr : arr.filter(m => m.sessionCode === filter);
  }, [divData.matches, filter]);

  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">04 / Log</span>
          <h1>Historial de Hanchan</h1>
          <span className={`div-chip ${div}`}>DIV {div}</span>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>半荘記録</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
          {matches.length} de {divData.matches.length} hanchan
        </div>
      </div>

      <div className="session-filter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todas</button>
        {sessions.map(s => (
          <button key={s.code} className={filter === s.code ? 'active' : ''} onClick={() => setFilter(s.code)}>
            {s.code} <span className="sf-date">{s.date}</span>
          </button>
        ))}
      </div>

      <div className="hanchan-list">
        {matches.map((m, idx) => (
          <div className="hanchan-card" key={m.id} style={{ animation: 'rowin .35s ease both', animationDelay: `${Math.min(idx, 30) * 14}ms` }}>
            <div className="code-block">
              <div className="code">{m.code}</div>
              <div className="date">{m.sessionCode} · H{m.hanchan}</div>
              <div className="table">Mesa {m.table} · {m.date}</div>
              {m.paipuUrl && <a href={m.paipuUrl.replace(/^Mahjong Soul Game Log:/, '')} target="_blank" rel="noopener noreferrer" className="paipu-link">Ver paipu ↗</a>}
            </div>
            <div className="four-results">
              {m.players.map((pl, i) => (
                <div key={pl.id} className={`pos p${i + 1}`}>
                  <div className="place">{i + 1}°</div>
                  <Flag nat={pl.nat} size={16} />
                  <div className="nm">{pl.name}<span className="h">{pl.handle}</span></div>
                  <div className={`dl ${pl.delta >= 0 ? 'pos' : 'neg'}`}>{fmtPts(pl.delta)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarView({ data }) {
  const played = data.divisions.A.sessions;
  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">05 / Agenda</span>
          <h1>Calendario de Temporada</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>予定</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
          {data.league.sessionsTotal} sesiones · {data.league.hanchanPerSession} hanchan cada una
        </div>
      </div>

      <div className="block-label" style={{ marginBottom: 12 }}>Próximo · 次回</div>
      <div className="cal-grid">
        {data.calendar.map((c, i) => (
          <div className={`cal-card ${c.status === 'highlight' ? 'highlight' : ''} div-${c.div}`} key={i}
               style={{ animation: 'rowin .4s ease both', animationDelay: `${i * 30}ms` }}>
            {c.status === 'highlight' && <div className="ribbon">FINAL</div>}
            <div className="badge"><span className={`div-chip ${c.div}`}>{c.div === 'AB' ? 'A+B' : c.div === 'CL' ? 'CHILE' : 'DIV ' + c.div}</span>{c.div === 'CL' && <Flag nat="CL" size={16} />}</div>
            <div className="date-row">
              <span className="d">{c.date.split(' ')[0]}</span>
              <span className="dy">{c.date.split(' ')[1]} · {c.day}</span>
            </div>
            <div className="round-l">{c.round}</div>
            <div className="meta-l">{c.mesa}</div>
            <div className="meta-l">{c.time} · Santiago</div>
          </div>
        ))}
      </div>

      <div className="block-label" style={{ margin: '28px 0 12px' }}>Sesiones Jugadas · 実施済み</div>
      <div className="session-strip">
        {played.map((s, i) => (
          <div className="session-pill done" key={s.code} style={{ animation: 'rowin .35s ease both', animationDelay: `${i * 30}ms` }}>
            <div className="sp-code">{s.code}</div>
            <div className="sp-date">{s.date}</div>
            <div className="sp-meta">{s.matches} hanchan × 2 div</div>
          </div>
        ))}
        <div className="session-pill pending">
          <div className="sp-code">{data.league.nextSession.code}</div>
          <div className="sp-date">{data.league.nextSession.date}</div>
          <div className="sp-meta">pendiente</div>
        </div>
      </div>
    </div>
  );
}

function HallOfFame({ data }) {
  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">06 / Records</span>
          <h1>Hall of Fame</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>名誉殿堂</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>Temporada 2026 · ambas divisiones</div>
      </div>

      {['A', 'B'].map(d => (
        <div key={d} style={{ marginBottom: 32 }}>
          <div className="hof-div-head">
            <span className={`div-chip ${d}`}>DIVISIÓN {d}</span>
            <span className="hof-div-line"></span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em' }}>
              {data.divisions[d].players.length} JUGADORES
            </span>
          </div>
          <div className="hof-grid">
            {data.divisions[d].hallOfFame.map((h, i) => (
              <div className={`hof-card div-${d}`} key={i} style={{ animation: 'rowin .4s ease both', animationDelay: `${i * 45}ms` }}>
                <div className="jp-mark">{h.jp}</div>
                <div className="tag">{h.tag}</div>
                <div className="value" style={{ color: accentFor(d) }}>{h.value}</div>
                <div className="sub">{h.sub}</div>
                <div className="player-line">
                  <div className={`avatar div-${d}`}>{initials(h.player.handle)}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{h.player.shortName}</div>
                    <div className="nat-line" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
                      <Flag nat={h.player.nat} size={14} /><span>{COUNTRIES[h.player.nat].name}</span><span className="dot-sep">·</span><span>#{h.player.rank}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { PlayerDetail, Comparator, HanchanLog, CalendarView, HallOfFame, IORMCView, metricsToRadar, PlayerSelect, accentFor, placementSegments, metricScale });
