// components-detail.jsx — player detail, comparator, hanchan log, calendar, hall of fame

function accentFor(div) { return div === 'B' ? 'var(--accent-2)' : 'var(--accent)'; }
// Dos primeras letras para el círculo del avatar (el handle completo se desborda)
function initials(h) { return (h || '').slice(0, 2); }

// La planilla guarda el enlace como "Mahjong Soul Game Log:https://…" en algunas
// filas y pelado en otras: se limpia siempre antes de usarlo como href.
function paipuHref(url) {
  return String(url || '').replace(/^Mahjong Soul Game Log:/, '');
}

const HOF_KEYS = ['leader', 'wins', 'defense', 'riichi', 'consistency', 'recent'];
function hallOfFameCopy(record, index) {
  const key = record.key || HOF_KEYS[index];
  return {
    tag: tr(`hof_${key}_title`),
    sub: tr(`hof_${key}_subtitle`),
  };
}

function metricsToRadar(p, leaguePlayers = []) {
  const hasStats = p.statsSample > 0;
  const peers = leaguePlayers.length ? leaguePlayers : [p];
  const percentile = (value, getter, higherIsBetter = true) => {
    const values = peers.map(getter).filter(Number.isFinite);
    if (!Number.isFinite(value) || !values.length) return 0;
    const noWorse = values.filter(peerValue => higherIsBetter ? peerValue <= value : peerValue >= value).length;
    return clamp01(noWorse / values.length);
  };
  return [
    { label: tr('radar_wins'), display: hasStats ? p.winRate.toFixed(0) + '%' : '—', value: hasStats ? percentile(p.winRate, player => player.statsSample > 0 ? player.winRate : NaN) : 0 },
    { label: tr('radar_defense'), display: hasStats ? (100 - p.dealInRate).toFixed(0) + '%' : '—', value: hasStats ? percentile(p.dealInRate, player => player.statsSample > 0 ? player.dealInRate : NaN, false) : 0 },
    { label: tr('radar_placement'), display: p.avgRank.toFixed(2), value: percentile(p.avgRank, player => player.avgRank, false) },
    { label: tr('radar_points'), display: fmtPts(p.avgPoints), value: percentile(p.avgPoints, player => player.avgPoints) },
  ];
}

function ProfileStyleTendencies({ player, leaguePlayers }) {
  const median = (key) => {
    const values = leaguePlayers.filter(peer => peer.statsSample > 0).map(peer => peer[key]).filter(Number.isFinite).sort((a, b) => a - b);
    if (!values.length) return 0;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  const metrics = [
    { label: tr('radar_riichi'), value: player.riichiRate, median: median('riichiRate') },
    { label: tr('radar_open'), value: player.openRate, median: median('openRate') },
  ];
  return <div className="profile-tendencies">
    <div className="profile-tendencies-title">{tr('play_tendency')}</div>
    {metrics.map(metric => <div className="profile-tendency" key={metric.label}>
      <span>{metric.label}</span>
      <div className="profile-tendency-track" style={{ '--value': `${clamp01(metric.value / 100) * 100}%`, '--median': `${clamp01(metric.median / 100) * 100}%` }}>
        <i className="median" title={`${tr('league_median')}: ${metric.median.toFixed(0)}%`} />
        <i className="value" />
      </div>
      <strong>{player.statsSample > 0 ? `${metric.value.toFixed(0)}%` : '—'}</strong>
    </div>)}
    <div className="profile-tendencies-legend"><i />{tr('league_median')}</div>
  </div>;
}

const PREVIEW_YAKUS = [
  { name: 'Riichi', count: 11 }, { name: 'Tanyao', count: 5 }, { name: 'Ippatsu', count: 4 },
  { name: 'Yakuhai Bakaze', count: 4 }, { name: 'Yakuhai Jikaze', count: 4 }, { name: 'Menzen Tsumo', count: 3 },
  { name: 'Yakuhai Haku', count: 3 }, { name: 'Pinfu', count: 3 }, { name: 'Yakuhai Hatsu', count: 3 },
  { name: 'Honitsu', count: 2 }, { name: 'Toitoi', count: 2 }, { name: 'Sanshoku Doujun', count: 2 },
  { name: 'Chanta', count: 2 }, { name: 'Yakuhai Chun', count: 1 }, { name: 'Iipeikou', count: 1 }, { name: 'Haitei', count: 1 },
];

function yakuGlyph(name) {
  const glyphs = { Riichi: '立', Tanyao: '断', Ippatsu: '一', Pinfu: '平', 'Menzen Tsumo': '門' };
  return glyphs[name] || '役';
}

function yakuStory(top) {
  const names = top.map(yaku => yaku.name);
  const has = name => names.some(candidate => candidate.toLowerCase().includes(name));
  const args = { first: names[0], second: names[1], third: names[2] };
  const yakuhaiCount = names.filter(name => /^yakuhai\b/i.test(name)).length;
  if (names.length < 3) return { title: tr('yaku_story_varied_title'), text: tr('yaku_story_limited_text', { first: names[0] }) };
  if (yakuhaiCount >= 2) return { title: tr('yaku_story_honors_title'), text: tr('yaku_story_honors_text', args) };
  if (has('riichi') && has('ippatsu')) return { title: tr('yaku_story_pressure_title'), text: tr('yaku_story_pressure_text', args) };
  if (has('riichi') && has('menzen tsumo') && has('pinfu')) return { title: tr('yaku_story_structure_title'), text: tr('yaku_story_structure_text', args) };
  if (has('riichi') && has('menzen tsumo') && has('tanyao')) return { title: tr('yaku_story_light_title'), text: tr('yaku_story_light_text', args) };
  if (has('riichi') && has('pinfu') && has('tanyao')) return { title: tr('yaku_story_efficiency_title'), text: tr('yaku_story_efficiency_text', args) };
  if (has('riichi') && yakuhaiCount >= 1) return { title: tr('yaku_story_hybrid_title'), text: tr('yaku_story_hybrid_text', args) };
  if (has('honitsu') || has('chinitsu') || has('toitoi') || has('chiitoitsu')) return { title: tr('yaku_story_identity_title'), text: tr('yaku_story_identity_text', args) };
  if (has('tanyao') && has('pinfu')) return { title: tr('yaku_story_simple_title'), text: tr('yaku_story_simple_text', args) };
  return { title: tr('yaku_story_varied_title'), text: tr('yaku_story_varied_text', args) };
}

// `canOpen`/`onOpen` son opcionales: sin manos ganadas en los datos el perfil se
// ve igual, sólo que nada abre. Cada yaku que sí las tiene se vuelve un botón,
// en las tres formas en que aparece: top 3, grupo de yakuhai y ledger.
function YakuProfile({ yakus, color, canOpen, onOpen }) {
  if (!yakus.length) return <div className="yaku-empty">{tr('yaku_empty')}</div>;
  // Envuelve un yaku en botón si tiene manos que mostrar; si no, lo deja tal cual.
  const openable = (name, className, key, children, Tag = 'div') => (canOpen && canOpen(name)
    ? <button type="button" className={`${className} clickable`} key={key}
        onClick={() => onOpen(name)} title={tr('yaku_open_hands', { yaku: name })}>{children}</button>
    : <Tag className={className} key={key}>{children}</Tag>);
  const sorted = [...yakus].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const total = sorted.reduce((sum, yaku) => sum + yaku.count, 0);
  const top = sorted.slice(0, 3);
  const remaining = sorted.slice(3);
  const yakuhai = remaining.filter(yaku => /^yakuhai\b/i.test(yaku.name));
  const other = remaining.filter(yaku => !/^yakuhai\b/i.test(yaku.name));
  const yakuhaiTotal = yakuhai.reduce((sum, yaku) => sum + yaku.count, 0);
  const story = yakuStory(top);
  const pct = count => total ? Math.round(count / total * 100) : 0;
  return <div className="yaku-profile" style={{ '--yaku-accent': color }}>
    <div className="yaku-signature">
      <div className="yaku-story"><div className="block-label">{tr('yaku_story_label')}</div><h4>{story.title}</h4><p>{story.text}</p></div>
      <div className="yaku-top-three">{top.map((yaku, index) => openable(yaku.name, 'yaku-top', yaku.name, <React.Fragment>
        <span className="yaku-top-rank">{index === 0 ? tr('yaku_high') : tr('yaku_rank_n', { n: index + 1 })}</span>
        <i>{yakuGlyph(yaku.name)}</i><strong>{yaku.name}</strong><b>{yaku.count} · {pct(yaku.count)}%</b>
      </React.Fragment>))}</div>
    </div>
    <div className="yaku-rest-label">{tr('yaku_other_title')}</div>
    <div className="yaku-ledger">
      {!!yakuhai.length && <div className="yaku-yakuhai-group">
        <div><strong>{tr('yaku_yakuhai_group')}</strong><span>{tr('yaku_yakuhai_hint')}</span></div>
        <div className="yaku-yakuhai-items">{yakuhai.map(yaku => openable(yaku.name, 'yaku-yakuhai-item', yaku.name, <React.Fragment><span>{yaku.name.replace(/^Yakuhai\s*/i, '')}</span> <b>{yaku.count} · {pct(yaku.count)}%</b></React.Fragment>, 'span'))}</div>
        <div className="yaku-yakuhai-total"><strong>{yakuhaiTotal}</strong><span>{pct(yakuhaiTotal)}% {tr('yaku_total_suffix')}</span></div>
      </div>}
      {other.map(yaku => openable(yaku.name, 'yaku-ledger-row', yaku.name, <React.Fragment>
        <span>{yaku.name}</span><div><i style={{ width: `${Math.max(4, pct(yaku.count))}%` }} /></div><b>{yaku.count}</b><small>{pct(yaku.count)}%</small>
      </React.Fragment>))}
    </div>
  </div>;
}

function placementSegments(p) {
  return [p.placements.p1, p.placements.p2, p.placements.p3, p.placements.p4]
    .map((v, i) => ({ place: i + 1, v }))
    .filter(s => s.v > 0);
}

function QuickProfileSummary({ player }) {
  const history = player.history || [];
  const recent = history.slice(-5);
  const best = Math.max(...history, 0);
  const worst = Math.min(...history, 0);
  const mostCommon = [player.placements.p1, player.placements.p2, player.placements.p3, player.placements.p4]
    .reduce((bestIndex, value, index, all) => value > all[bestIndex] ? index : bestIndex, 0) + 1;
  return (
    <div className="quick-profile-summary">
      <div className="block-label">{tr('quick_summary')}</div>
      <div className="quick-profile-grid">
        <div><span>{tr('quick_played')}</span><strong>{player.games}</strong></div>
        <div><span>{tr('quick_common_place')}</span><strong>{mostCommon}°</strong></div>
        <div><span>{tr('quick_best_game')}</span><strong className="positive">{best >= 0 ? '+' : ''}{best.toFixed(1)}</strong></div>
        <div><span>{tr('quick_worst_game')}</span><strong className="negative">{worst.toFixed(1)}</strong></div>
      </div>
      <div className="quick-form">
        <span>{tr('quick_recent')}</span>
        <div className="quick-form-dots">
          {recent.map((value, index) => <span key={index} className={value >= 0 ? 'positive' : 'negative'} title={`${value >= 0 ? '+' : ''}${value.toFixed(1)}`}>{value >= 0 ? '+' : '−'}</span>)}
        </div>
        <strong className={history.at(-1) >= 0 ? 'positive' : 'negative'}>{history.length ? `${history.at(-1) >= 0 ? '+' : ''}${history.at(-1).toFixed(1)}` : '—'}</strong>
      </div>
    </div>
  );
}

function PlayerSelect({ value, onChange, data, style }) {
  return <select value={value} onChange={event => onChange(event.target.value)} style={style}>
    {['A', 'B'].map(division => <optgroup key={division} label={`División ${division}`}>
      {data.divisions[division].players.map(player => <option key={player.id} value={player.id}>#{player.rank} · {player.shortName} · {COUNTRIES[player.nat].name}</option>)}
    </optgroup>)}
  </select>;
}

function ComparePlayerSelect({ value, onChange, data, side }) {
  const current = data.allPlayers.find(player => player.id === value);
  const [open, setOpen] = React.useState(false);
  const [division, setDivision] = React.useState(current.div);
  const [query, setQuery] = React.useState('');
  const rootRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const normalized = query.trim().toLocaleLowerCase();
  const players = data.divisions[division].players.filter(player => !normalized || `${player.shortName} ${player.handle} ${COUNTRIES[player.nat].name}`.toLocaleLowerCase().includes(normalized));
  React.useEffect(() => {
    const close = event => rootRef.current && !rootRef.current.contains(event.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  React.useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery('');
  }, [open]);
  const pick = player => { onChange(player.id); setDivision(player.div); setOpen(false); };
  return <div className={`compare-picker ${side} ${open ? 'open' : ''}`} ref={rootRef}>
    <button className="compare-picker-trigger" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span className={`avatar div-${current.div}`}>{initials(current.handle)}</span>
      <span className="compare-picker-current"><small>{tr(side === 'a' ? 'compare_player_a' : 'compare_player_b')} · DIV {current.div}</small><strong>{current.shortName}</strong><em><Flag nat={current.nat} size={14} /> {COUNTRIES[current.nat].name} · #{current.rank} · {fmtPts(current.points)}</em></span>
      <i className="compare-picker-chevron">⌄</i>
    </button>
    {open && <div className="compare-picker-menu">
      <div className="compare-picker-tools">
        <div className="compare-picker-divisions">{['A','B'].map(div => <button key={div} className={division === div ? 'active' : ''} onClick={() => setDivision(div)}>DIV {div}<small>{data.divisions[div].players.length}</small></button>)}</div>
        <label><span>⌕</span><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Escape' && setOpen(false)} placeholder={tr('compare_search_player')} /></label>
      </div>
      <div className="compare-picker-list">{players.map(player => <button key={player.id} className={player.id === current.id ? 'active' : ''} onClick={() => pick(player)}><span className={`avatar div-${player.div}`}>{initials(player.handle)}</span><span><strong>{player.shortName}</strong><small><Flag nat={player.nat} size={12} /> {COUNTRIES[player.nat].name}</small></span><span><b>#{player.rank}</b><small>{fmtPts(player.points)}</small></span></button>)}{!players.length && <p>{tr('player_no_results')}</p>}</div>
    </div>}
  </div>;
}

function DivisionPlayerSelect({ value, onChange, data, division }) {
  const players = data.divisions[division].players;
  const currentIndex = Math.max(0, players.findIndex(player => player.id === value));
  const current = players[currentIndex];
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const rootRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const normalized = query.trim().toLocaleLowerCase();
  const visiblePlayers = players.filter(player => !normalized || `${player.shortName} ${player.handle} ${COUNTRIES[player.nat].name}`.toLocaleLowerCase().includes(normalized));
  React.useEffect(() => {
    const close = event => rootRef.current && !rootRef.current.contains(event.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  React.useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery('');
  }, [open]);
  const pick = id => { onChange(id); setOpen(false); };
  const move = step => pick(players[(currentIndex + step + players.length) % players.length].id);
  React.useEffect(() => {
    const navigateWithArrows = event => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
      if (open || isEditing || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', navigateWithArrows);
    return () => window.removeEventListener('keydown', navigateWithArrows);
  }, [open, currentIndex, players]);
  return <div className="player-navigator" ref={rootRef}>
    <button className="player-nav-arrow" onClick={() => move(-1)} aria-label={tr('player_previous')}>‹</button>
    <div className="player-picker-position"><b>{String(currentIndex + 1).padStart(2, '0')} / {players.length}</b><small>{tr('player_ranking')}</small></div>
    <button className={`player-picker-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(value => !value)} aria-expanded={open}><span>{tr('player_view_all')}</span><i>▦</i></button>
    <button className="player-nav-arrow" onClick={() => move(1)} aria-label={tr('player_next')}>›</button>
    {open && <div className="player-picker-menu">
      <div className="player-picker-search"><span>⌕</span><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Escape' && setOpen(false)} placeholder={tr('player_search', { d: division })} /></div>
      <div className="player-picker-list" aria-label={tr('division', { d: division })}>
        {visiblePlayers.map(player => <button key={player.id} className={player.id === current.id ? 'active' : ''} onClick={() => pick(player.id)}>
          <span className={`avatar div-${division}`}>{initials(player.handle)}</span><span><strong>{player.shortName}</strong><small><Flag nat={player.nat} size={13} /> {COUNTRIES[player.nat].name}</small></span><span className="player-picker-rank"><b>#{player.rank}</b><small>{fmtPts(player.points)}</small></span>
        </button>)}
        {!visiblePlayers.length && <p className="player-picker-empty">{tr('player_no_results')}</p>}
      </div>
    </div>}
  </div>;
}

function PlayerDetail({ playerId, data, onPick }) {
  const all = data.allPlayers;
  const p = all.find(x => x.id === playerId) || data.divisions.A.players[0];
  const divSize = data.divisions[p.div].players.length;
  const color = accentFor(p.div);

  const radar = metricsToRadar(p, data.divisions[p.div].players);
  // La lista completa se genera a partir de los paipus de Mahjong Soul en
  // scripts/sync.py. No debe recortarse ni completarse en el cliente: si un
  // jugador muestra pocos yakus significa que faltan datos de partidas
  // procesadas, no que la interfaz deba inventarlos.
  // `yakus` es el formato nuevo del pipeline. Los datos versionados de ramas
  // anteriores todavía usan `topYaku`; ambos contienen registros reales.
  const sourceYakus = Array.isArray(p.yakus)
    ? p.yakus
    : Array.isArray(p.topYaku) ? p.topYaku : [];
  const yakus = sourceYakus.length || !window.__LOCAL_PREVIEW__ ? sourceYakus : PREVIEW_YAKUS;
  const usingPreviewYakus = !sourceYakus.length && yakus.length > 0;
  const yakumanNames = new Set([
    'Tenhou', 'Chiihou', 'Daisangen', 'Suuankou', 'Tsuuiisou', 'Ryuuiisou',
    'Chinroutou', 'Kokushi Musou', 'Shousuushii', 'Suukantsu', 'Chuuren Poutou',
    'Suuankou Tanki', 'Kokushi 13-men', 'Daisuushii', 'Junsei Chuuren',
  ]);
  const derivedYakumans = yakus.filter(y => yakumanNames.has(y.name));
  const yakumans = Array.isArray(p.yakumans) ? p.yakumans : derivedYakumans;
  const recordAchievements = (data.divisions[p.div].hallOfFame || [])
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.player && record.player.id === p.id)
    .map(({ record, index }) => { const key = record.key || ['leader', 'wins', 'defense', 'riichi', 'consistency', 'recent'][index] || 'record'; return { name: tr(`hof_${key}_title`), detail: tr(`hof_${key}_subtitle`), key, value: record.value }; });
  const closestToZero = data.divisions[p.div].players
    .filter(player => Number.isFinite(player.points))
    .sort((a, b) => Math.abs(a.points) - Math.abs(b.points))[0];
  if (closestToZero && closestToZero.id === p.id) {
    recordAchievements.push({ name: tr('achievement_saki'), detail: tr('achievement_saki_hint'), key: 'saki', value: fmtPts(p.points) });
  }
  const yakumanBadge = name => {
    if (name === 'Kokushi Musou') return { key: 'kokushi', glyph: '十三' };
    if (name === 'Daisangen') return { key: 'daisangen', glyph: '中發白' };
    if (name === 'Suuankou') return { key: 'suuankou', glyph: '四暗' };
    return { key: 'generic', glyph: '✦' };
  };
  const recordIcons = { leader: '王', wins: '和', defense: '守', riichi: '立', consistency: '均', recent: '昇', kans: '槓', doras: '輝', ura_doras: '運', renchan: '連', saki: '咲' };
  const distinctionKeys = new Set(['saki', 'kans', 'doras', 'ura_doras', 'renchan']);
  const leagueRecords = recordAchievements.filter(record => !distinctionKeys.has(record.key));
  const distinctions = recordAchievements.filter(record => distinctionKeys.has(record.key));
  const totalYaku = yakus.reduce((sum, y) => sum + y.count, 0);
  // Las manos ganadas sólo existen después de correr scripts/sync.py sobre los
  // paipus: sin ellas el perfil de yakus se ve igual, pero sin abrir nada.
  const wonHands = (data.yakuHands || {})[p.id] || [];
  const [openYaku, setOpenYaku] = React.useState(null);
  React.useEffect(() => { setOpenYaku(null); }, [p.id]);
  const yakuHands = openYaku ? wonHands.filter(h => (h.yaku || []).includes(openYaku)) : [];

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
        <DivisionPlayerSelect value={p.id} onChange={onPick} data={data} division={p.div} />
      </div>

      <div className="detail-grid">
        <div className={`detail-hero div-${p.div}`} style={{ '--nat': COUNTRIES[p.nat].accent, '--nat-alt': COUNTRIES[p.nat].alt }}>
          <div className="nat-wash"></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
            <div className={`avatar div-${p.div}`} style={{ width: 80, height: 80, fontSize: 22, borderRadius: 18 }}>{initials(p.handle)}</div>
            <div>
              <div className="name">{p.shortName}</div>
              <div className="sub nat-line"><Flag nat={p.nat} size={18} /><span>{COUNTRIES[p.nat].name}</span><span className="dot-sep">·</span><span>Div {p.div}</span></div>
            </div>
          </div>

          <div className="rank-big">
            <span className="n" style={{ color }}>#{p.rank}</span>
            <span className="of">{tr('of_rank', { n: divSize, div: p.div })}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: p.points >= 0 ? 'var(--good)' : 'var(--bad)' }}>{fmtPts(p.points)}</span>
          </div>

          {p.iormc && (
            <div className={`iormc-banner ${p.iormc}`}>
              <Flag nat="CL" size={20} />
              <div>
                <div className="ib-t">
                  {p.iormc === 'qualified' && tr('iormc_qualified', { n: p.natRank })}
                  {p.iormc === 'contention' && tr('iormc_contention', { n: p.natRank })}
                  {p.iormc === 'out' && tr('iormc_out', { n: p.natRank })}
                </div>
                <div className="ib-s">{tr('iormc_cut_line', { cut: fmtPts(data.iormc.cutPoints) })}</div>
              </div>
            </div>
          )}

          {p.zone && (
            <div className={`zone-banner ${p.zone}`}>
              {p.zone === 'playoff' && tr('zone_playoff')}
              {p.zone === 'title' && tr('zone_playoff')}
              {p.zone === 'relegation' && tr('zone_releg')}
              {p.zone === 'promotion' && tr('zone_promo')}
              {p.zone === 'bottom' && tr('zone_bottom')}
            </div>
          )}

          <div>
            <div className="block-label">{tr('placement_title')} · 順位率</div>
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
          <QuickProfileSummary player={p} />
        </div>

        <div className="chart-card detail-full achievements-card">
          <div className="ch-head yaku-head"><div><h3>{tr('achievements_title')}</h3><p>{tr('achievements_hint')}</p></div><span className="jp">勲章</span></div>
          <div className="achievement-map">
            <div className="achievement-family family-yakuman"><div className="achievement-family-head"><strong>{tr('yakuman_title')}</strong><small>{yakumans.length}</small></div><div className="achievement-emblems">{yakumans.map(y => { const badge = yakumanBadge(y.name); return <div className="achievement-emblem-wrap" key={y.name}><div className={`achievement-emblem ${badge.key}`} tabIndex="0">{badge.glyph}</div><div className="achievement-tooltip"><em>YAKUMAN</em><strong>{y.name}</strong><span>{tr('achievement_yakuman_detail', { n: y.count })}</span><b>×{y.count}</b></div></div>; })}{Array.from({ length: Math.max(0, 3 - yakumans.length) }, (_, i) => <div className="achievement-emblem-wrap locked" key={`yakuman-locked-${i}`}><div className="achievement-emblem">◇</div><div className="achievement-tooltip"><strong>{tr('achievement_locked')}</strong><span>{tr('achievement_locked_yakuman')}</span></div></div>)}</div></div>
            <div className="achievement-family family-record"><div className="achievement-family-head"><strong>{tr('records_title')}</strong><small>{leagueRecords.length}</small></div><div className="achievement-emblems">{leagueRecords.map(record => <div className="achievement-emblem-wrap" key={`${record.key}-${record.name}`}><div className={`achievement-emblem record-${record.key}`} tabIndex="0">{recordIcons[record.key] || '賞'}</div><div className="achievement-tooltip"><em>{tr('records_title')}</em><strong>{record.name}</strong><span>{record.detail}</span><b>{record.value}</b></div></div>)}{Array.from({ length: Math.max(0, 3 - leagueRecords.length) }, (_, i) => <div className="achievement-emblem-wrap locked" key={`record-locked-${i}`}><div className="achievement-emblem">◇</div><div className="achievement-tooltip"><strong>{tr('achievement_locked')}</strong><span>{tr('achievement_locked_record')}</span></div></div>)}</div></div>
            <div className="achievement-family family-distinction"><div className="achievement-family-head"><strong>{tr('achievement_distinctions')}</strong><small>{distinctions.length}</small></div><div className="achievement-emblems">{distinctions.map(record => <div className="achievement-emblem-wrap" key={record.key}><div className={`achievement-emblem distinction-${record.key}`} tabIndex="0">{recordIcons[record.key] || '賞'}</div><div className="achievement-tooltip"><em>{tr('achievement_distinctions')}</em><strong>{record.name}</strong><span>{record.detail}</span><b>{record.value}</b></div></div>)}{Array.from({ length: Math.max(0, 3 - distinctions.length) }, (_, i) => <div className="achievement-emblem-wrap locked" key={`distinction-locked-${i}`}><div className="achievement-emblem">◇</div><div className="achievement-tooltip"><strong>{tr('achievement_locked')}</strong><span>{tr('achievement_locked_distinction')}</span></div></div>)}</div></div>
          </div>
        </div>

          <div className="chart-card detail-summary">
            <div className="ch-head stats-overview-head"><div><h3>{tr('stats_overview')}</h3><p>{tr('stats_overview_hint')}</p></div></div>
            <div className="stats-overview-layout">
              <div className="profile-radar" style={{ '--profile-accent': color }}>
                <div className="profile-radar-label">{tr('radar_competitive')}</div>
                <RadarChart key={p.id} stats={radar} color={color} size={340} />
                <div className="profile-radar-caption">{tr('radar_relative_caption')}</div>
                <ProfileStyleTendencies player={p} leaguePlayers={data.divisions[p.div].players} />
              </div>
              <ProfileStatGroups player={p} data={data} />
            </div>
          </div>

          <div className="chart-card line-card detail-full">
            <div className="ch-head"><h3>{tr('evolution_title')} · {tr('evolution_accumulated')} · {p.games} {tr('hanchan')}</h3><span className="jp">スコア推移</span></div>
            <LineChart key={p.id} values={p.cum} color={color} playerId={p.id} matches={data.divisions[p.div].matches.filter(match => match.players.some(player => player.id === p.id))} />
          </div>

          <div className="chart-card detail-full yaku-card">
            <div className="ch-head yaku-head"><div><h3>{tr('yaku_title')}</h3><p>{tr('yaku_summary', { types: yakus.length, total: totalYaku })}{usingPreviewYakus ? ` · ${tr('preview_data')}` : ''}</p></div><span className="jp">役一覧</span></div>
            <YakuProfile yakus={yakus} color={color}
              canOpen={name => wonHands.some(h => (h.yaku || []).includes(name))}
              onOpen={setOpenYaku} />
        </div>
      </div>
      {openYaku && (
        <YakuHandsModal yaku={openYaku} hands={yakuHands} player={p} data={data} color={color}
          onClose={() => setOpenYaku(null)} />
      )}
    </div>
  );
}

// Popup con cada mano ganada que incluyó un yaku. Se cierra con Escape, con el
// fondo o con la X; mientras está abierto el fondo no scrollea.
function YakuHandsModal({ yaku, hands, player, data, color, onClose }) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [activeMilestone, setActiveMilestone] = React.useState('all');
  const handListRef = React.useRef(null);
  React.useEffect(() => {
    // El perfil navega entre jugadores con las flechas (DivisionPlayerSelect
    // escucha en window). Con el popup abierto esas teclas no pueden llegar
    // allá: cambiarían de jugador por detrás y cerrarían esto de rebote. Se
    // atajan en la fase de captura, que corre antes que cualquier otro
    // listener, y sin preventDefault para que el popup siga scrolleando con el
    // teclado.
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.stopPropagation();
        e.preventDefault();
        if (!hands.length) return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          setSelectedIndex(index => e.key === 'ArrowUp'
            ? (index - 1 + hands.length) % hands.length
            : (index + 1) % hands.length);
          setActiveMilestone('all');
          return;
        }
        const choices = ['all', ...milestones.map(item => item.key)];
        const current = Math.max(0, choices.indexOf(activeMilestone));
        const next = e.key === 'ArrowLeft'
          ? (current - 1 + choices.length) % choices.length
          : (current + 1) % choices.length;
        const nextKey = choices[next];
        setActiveMilestone(nextKey);
        if (nextKey !== 'all') setSelectedIndex(milestones.find(item => item.key === nextKey).index);
      }
    };
    window.addEventListener('keydown', onKey, true);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = previo; };
  }, [onClose, hands.length, activeMilestone]);

  React.useEffect(() => { setSelectedIndex(0); setActiveMilestone('all'); }, [yaku]);
  React.useEffect(() => {
    const list = handListRef.current;
    const active = list?.querySelector(`[data-hand-index="${selectedIndex}"]`);
    if (!list || !active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < list.scrollTop) list.scrollTo({ top, behavior: 'smooth' });
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTo({ top: bottom - list.clientHeight, behavior: 'smooth' });
  }, [selectedIndex]);

  const total = hands.reduce((sum, h) => sum + (h.points || 0), 0);
  const promedio = hands.length ? Math.round(total / hands.length) : 0;
  const indexOf = compare => hands.reduce((best, hand, index) => best < 0 || compare(hand, hands[best]) ? index : best, -1);
  const milestones = hands.length ? [
    { key: 'valuable', icon: '◆', label: tr('hand_most_valuable'), index: indexOf((a, b) => (a.points || 0) > (b.points || 0)) },
    { key: 'fast', icon: '⚡', label: tr('hand_fastest'), index: indexOf((a, b) => (a.turn || Infinity) < (b.turn || Infinity)) },
    { key: 'recent', icon: '◷', label: tr('hand_most_recent'), index: indexOf((a, b) => (a.session || 0) > (b.session || 0) || ((a.session || 0) === (b.session || 0) && (a.hanchan || 0) > (b.hanchan || 0))) },
    { key: 'cheap', icon: '◇', label: tr('hand_cheapest'), index: indexOf((a, b) => (a.points || Infinity) < (b.points || Infinity)) },
  ] : [];
  const selected = hands[selectedIndex] || hands[0];
  const selectedMilestones = milestones.filter(item => item.index === selectedIndex);
  const chooseMilestone = milestone => { setActiveMilestone(milestone.key); setSelectedIndex(milestone.index); };
  return ReactDOM.createPortal(
    <div className="cal-modal-backdrop" onClick={onClose}>
      <div className="cal-modal yaku-modal" role="dialog" aria-modal="true" aria-label={yaku}
        style={{ '--modal-accent': color }} onClick={e => e.stopPropagation()}>
        <div className="cm-head">
          <div>
            <div className="cm-kicker">{player.shortName} · {tr('yaku_title')}</div>
            <div className="cm-title">{yaku}</div>
            <div className="cm-sub">{tr('yaku_modal_summary', { n: hands.length, avg: promedio.toLocaleString('es-CL') })}</div>
          </div>
          <button className="cm-close" onClick={onClose} aria-label={tr('cerrar')}>✕</button>
        </div>
        <div className="hand-milestone-tabs" role="tablist" aria-label={tr('hand_highlights')}>
          <button className={activeMilestone === 'all' ? 'active' : ''} onClick={() => setActiveMilestone('all')}>{tr('hand_all')} · {hands.length}</button>
          {milestones.map(item => <button key={item.key} className={activeMilestone === item.key ? 'active' : ''} onClick={() => chooseMilestone(item)}><i>{item.icon}</i>{item.label}</button>)}
        </div>
        <div className="hand-keyboard-hint"><span>↑ ↓</span> {tr('hand_keys_hands')} <i>·</i> <span>← →</span> {tr('hand_keys_highlights')}</div>
        {activeMilestone !== 'all' && selected && <div className="hand-milestone-reason"><strong>{milestones.find(item => item.key === activeMilestone)?.label}</strong><span>{tr(`hand_${activeMilestone}_reason`, { points: (selected.points || 0).toLocaleString('es-CL'), turn: selected.turn, session: selected.session, hanchan: selected.hanchan })}</span></div>}
        <div className="yaku-gallery">
          <div className="yaku-gallery-list" ref={handListRef} role="tablist" aria-label={tr('hand_all')}>
            {hands.map((hand, index) => <button key={index} data-hand-index={index} role="tab" aria-selected={selectedIndex === index} className={selectedIndex === index ? 'active' : ''} onClick={() => { setSelectedIndex(index); setActiveMilestone('all'); }}><span>{tr('sesion_n', { n: hand.session })} · H{hand.hanchan}</span><strong>{(hand.points || 0).toLocaleString('es-CL')}</strong><small>{hand.tsumo ? tr('by_tsumo') : tr('by_ron')} · {tr('hand_turn', { n: hand.turn })}</small>{milestones.filter(item => item.index === index).length > 0 && <em>{milestones.filter(item => item.index === index).map(item => item.icon).join(' ')}</em>}</button>)}
          </div>
          <div className="yaku-mobile-nav">
            <button onClick={() => { setSelectedIndex((selectedIndex - 1 + hands.length) % hands.length); setActiveMilestone('all'); }} aria-label={tr('hand_previous')}>‹</button>
            <div><span>{selectedIndex + 1} / {hands.length}</span><strong>{tr('sesion_n', { n: selected?.session })} · {tr('hanchan_n', { n: selected?.hanchan })}</strong><small>{(selected?.points || 0).toLocaleString('es-CL')} · {selected?.tsumo ? tr('by_tsumo') : tr('by_ron')}</small></div>
            <button onClick={() => { setSelectedIndex((selectedIndex + 1) % hands.length); setActiveMilestone('all'); }} aria-label={tr('hand_next')}>›</button>
          </div>
          {selected && <YakuHandRow hand={selected} yaku={yaku} player={player} data={data} milestones={selectedMilestones} average={promedio} featured />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function YakuHandRow({ hand, yaku, player, data, milestones = [], average = 0, featured = false }) {
  const otros = (hand.yaku || []).filter(y => y !== yaku);
  // La mano no guarda el enlace: se llega a la partida por su código, que es lo
  // mismo que ya guarda (sesión, mesa, hanchan). Así no se duplica la URL 1.285
  // veces en el payload.
  const code = `${player.div}-S${hand.session}-M${hand.table}-G${hand.hanchan}`;
  const match = (data.divisions[player.div].matches || []).find(m => m.id === code);
  return (
    <div className={`yaku-hand ${featured ? 'featured' : ''}`}>
      {milestones.length > 0 && <div className="yaku-hand-milestones">{milestones.map(item => <span key={item.key}><i>{item.icon}</i>{item.label}</span>)}</div>}
      <div className="yaku-hand-head">
        <span className="where">{tr('sesion_n', { n: hand.session })} · {tr('mesa', { n: hand.table })} · {tr('hanchan_n', { n: hand.hanchan })}</span>
        <span className={`how ${hand.tsumo ? 'tsumo' : 'ron'}`}>
          {hand.tsumo ? tr('by_tsumo') : (hand.loser ? tr('by_ron_from', { rival: hand.loser }) : tr('by_ron'))}
        </span>
        {match && match.paipuUrl && (
          <a className="paipu-link" href={paipuHref(match.paipuUrl)} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}>{tr('view_paipu')}</a>
        )}
        <span className="pts">{(hand.points || 0).toLocaleString('es-CL')}</span>
      </div>
      <HandTiles hand={hand.hand} win={hand.win} melds={hand.melds} />
      <div className="yaku-hand-foot">
        {otros.length > 0 && <span className="others">{otros.join(' · ')}</span>}
        <span className="meta">
          {hand.riichi && <em className="badge-riichi">{tr('badge_riichi')}</em>}
          <span className="nw han">{hand.yakuman
            ? (hand.han > 1 ? tr('hand_yakuman_n', { n: hand.han }) : tr('hand_yakuman'))
            : tr('hand_han', { n: hand.han })}</span>
          <span className="nw">{tr('hand_fu', { n: hand.fu })}</span>
          <span className="nw">{tr('hand_turn', { n: hand.turn })}</span>
          {hand.dora && (
            <span className="nw dora-group">
              {tr('hand_dora')}
              {(hand.dora.match(/.{2}/g) || []).map((c, i) => <Tile key={i} code={c} size={18} />)}
            </span>
          )}
        </span>
      </div>
      {featured && average > 0 && <div className="yaku-hand-comparison">{tr('hand_vs_average', { delta: Math.round(((hand.points || 0) / average - 1) * 100), average: average.toLocaleString('es-CL') })}</div>}
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
          <h1>{tr('camino_iormc')}</h1>
          <Flag nat="CL" size={22} />
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>代表選抜</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'right' }}>
          <div>International Online Riichi Mahjong Championship</div>
          <div style={{ color: 'var(--ink-faint)' }}>{tr('io_cupos', { slots: io.slots, eligible: io.eligible })}</div>
        </div>
      </div>

      <div className="iormc-podium">
        {io.qualified.map((p, i) => (
          <button className="iq-card" key={p.id} onClick={() => onPick(p)}
            style={{ animation: 'rowin .4s ease both', animationDelay: `${i * 60}ms` }}>
            <div className="iq-flagwash"></div>
            <div className="iq-slot">{tr('cupo_lbl', { n: i + 1 })}</div>
            <div className="iq-av"><div className="avatar div-A" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 12 }}>{initials(p.handle)}</div></div>
            <div className="iq-nm">{p.shortName}</div>
            <div className="iq-meta">{tr('iormc_meta', { rank: p.rank, games: p.games })}</div>
            <div className="iq-pts">{fmtPts(p.points)}</div>
            <div className="iq-stats">
              <span>{tr('lbl_avgrank')} {p.avgRank.toFixed(2)}</span><span>{tr('win_rate')} {p.winRate.toFixed(1)}%</span><span>{tr('deal_in')} {p.dealInRate.toFixed(1)}%</span>
            </div>
          </button>
        ))}
      </div>

      <div className="iormc-grid">
        <div className="chart-card">
          <div className="ch-head"><h3>{tr('carrera_chilena')}</h3><span className="jp">チリ代表予選</span></div>
          <div className="race-list">
            {io.all.map((p, i) => {
              const isCut = i === io.slots;
              return (
                <React.Fragment key={p.id}>
                  {isCut && <div className="race-cut"><span>{tr('iormc_cut_lbl', { cut: fmtPts(io.cutPoints) })}</span></div>}
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
            <div className="ch-head"><h3>{tr('margen_corte')}</h3><span className="jp">差</span></div>
            <div className="cut-stat">
              <div className="cs-big">{io.gap.toFixed(1)}</div>
              <div className="cs-lb">{tr('cut_stat_lb')}</div>
            </div>
            <div className="cut-pair">
              <div className="cp in"><span className="cp-l">{tr('dentro_lbl')}</span><span className="cp-n">{io.qualified[3].shortName}</span><span className="cp-p">{fmtPts(io.qualified[3].points)}</span></div>
              <div className="cp out"><span className="cp-l">{tr('fuera_lbl')}</span><span className="cp-n">{io.contention[0].shortName}</span><span className="cp-p">{fmtPts(io.contention[0].points)}</span></div>
            </div>
            <div className="cut-note">{tr('cut_note', { s: 1, h: 2 })}</div>
          </div>

          <div className="chart-card">
            <div className="ch-head"><h3>{tr('comp_liga')}</h3><span className="jp">国籍別</span></div>
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

function ComparisonRadar({ aStats, bStats }) {
  const size = 340, center = size / 2, radius = 105, count = aStats.length;
  const point = (index, value = 1) => { const angle = -Math.PI / 2 + index / count * Math.PI * 2; return [center + Math.cos(angle) * radius * value, center + Math.sin(angle) * radius * value]; };
  const polygon = (stats, scale = 1) => stats.map((stat, index) => point(index, stat.value * scale).join(',')).join(' ');
  return <svg className="comparison-radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={tr('compare_profiles')}>
    {[.25,.5,.75,1].map(level => <polygon key={level} points={aStats.map((_, index) => point(index, level).join(',')).join(' ')} fill="none" stroke="var(--line)" />)}
    {aStats.map((stat, index) => { const [x,y] = point(index); return <line key={stat.label} x1={center} y1={center} x2={x} y2={y} stroke="var(--line)"/>; })}
    <polygon points={polygon(aStats)} fill="var(--accent)" fillOpacity=".13" stroke="var(--accent)" strokeWidth="2"/>
    <polygon points={polygon(bStats)} fill="var(--accent-2)" fillOpacity=".13" stroke="var(--accent-2)" strokeWidth="2"/>
    {aStats.map((stat,index) => { const [x,y] = point(index,1.32); const anchor = x > center + 10 ? 'start' : x < center - 10 ? 'end' : 'middle'; return <g key={stat.label}><text x={x} y={y} textAnchor={anchor} fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink-soft)">{stat.label.toUpperCase()}</text><text x={x} y={y+16} textAnchor={anchor} fontFamily="var(--font-mono)" fontSize="11" fontWeight="700" fill="var(--ink)">{stat.display} / {bStats[index].display}</text></g>; })}
  </svg>;
}

function CompareMatchChart({ a, b }) {
  const width = 900, height = 230, pad = { l: 42, r: 22, t: 24, b: 34 };
  const series = [a.history || [], b.history || []], length = Math.max(...series.map(values => values.length), 1);
  const low = Math.min(0, ...series.flat()), high = Math.max(0, ...series.flat()), span = high - low || 1;
  const x = index => pad.l + index / Math.max(1, length - 1) * (width - pad.l - pad.r);
  const y = value => pad.t + (high - value) / span * (height - pad.t - pad.b);
  const path = values => values.map((value,index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`).join(' ');
  return <svg className="compare-match-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={tr('compare_match_results')}>
    <line x1={pad.l} y1={y(0)} x2={width-pad.r} y2={y(0)} stroke="var(--line-strong)"/>
    {series.map((values,seriesIndex) => <g key={seriesIndex}><path d={path(values)} fill="none" stroke={seriesIndex ? 'var(--accent-2)' : 'var(--accent)'} strokeWidth="2"/>{values.map((value,index) => <circle key={index} cx={x(index)} cy={y(value)} r="3" fill={seriesIndex ? 'var(--accent-2)' : 'var(--accent)'}><title>{`${seriesIndex ? b.shortName : a.shortName} · H${index+1}: ${fmtPts(value)}`}</title></circle>)}</g>)}
    {Array.from({length},(_,index) => <text key={index} x={x(index)} y={height-10} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink-faint)">H{index+1}</text>)}
  </svg>;
}

function comparisonStory(a, b) {
  const args = { a: a.shortName, b: b.shortName };
  if (Math.abs(a.openRate - b.openRate) >= 8 && Math.abs(a.dealInRate - b.dealInRate) >= 4) return { title: tr('compare_story_contrast_title'), text: tr('compare_story_contrast_text', { ...args, open: a.openRate > b.openRate ? a.shortName : b.shortName, safe: a.dealInRate < b.dealInRate ? a.shortName : b.shortName }) };
  if (Math.abs(a.riichiRate - b.riichiRate) >= 8) return { title: tr('compare_story_riichi_title'), text: tr('compare_story_riichi_text', { ...args, pressure: a.riichiRate > b.riichiRate ? a.shortName : b.shortName, patient: a.riichiRate > b.riichiRate ? b.shortName : a.shortName }) };
  if (a.openRate >= 38 && b.openRate >= 38) return { title: tr('compare_story_open_title'), text: tr('compare_story_open_text', args) };
  if (a.riichiRate >= 25 && b.riichiRate >= 25) return { title: tr('compare_story_closed_title'), text: tr('compare_story_closed_text', args) };
  if (Math.abs(a.avgRank - b.avgRank) >= .3) return { title: tr('compare_story_control_title'), text: tr('compare_story_control_text', { ...args, leader: a.avgRank < b.avgRank ? a.shortName : b.shortName }) };
  return { title: tr('compare_story_balanced_title'), text: tr('compare_story_balanced_text', args) };
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
    { key: 'points', label: tr('points'), jp: '総合', lower: false, fmt: fmtPts },
    { key: 'avgRank', label: tr('lbl_avgrank'), jp: '平均順位', lower: true, fmt: v => v.toFixed(2) },
    { key: 'winRate', label: tr('lbl_winrate'), jp: '和了率', lower: false, fmt: v => v.toFixed(1) + '%' },
    { key: 'dealInRate', label: tr('lbl_dealin'), jp: '放銃率', lower: true, fmt: v => v.toFixed(1) + '%' },
    { key: 'riichiRate', label: tr('lbl_riichi'), jp: '立直率', lower: false, fmt: v => v.toFixed(1) + '%' },
    { key: 'openRate', label: tr('lbl_open'), jp: '副露率', lower: false, fmt: v => v.toFixed(1) + '%' },
    { key: 'avgPoints', label: tr('lbl_avgpts'), jp: '平均得点', lower: false, fmt: fmtPts },
    { key: 'firstRate', label: tr('top_rate'), jp: 'トップ率', lower: false, fmt: v => (v * 100).toFixed(0) + '%' },
  ];
  const scales = React.useMemo(() => {
    const enriched = data.allPlayers.map(p => ({ ...p, firstRate: p.placements.p1 }));
    const m = {};
    metrics.forEach(mt => { m[mt.key] = metricScale(enriched, mt.key, mt.lower); });
    return m;
  }, [data.allPlayers]);
  const readVal = (p, key) => key === 'firstRate' ? p.placements.p1 : p[key];
  const crossDiv = a.div !== b.div;
  const results = metrics.map(metric => {
    const av = readVal(a, metric.key), bv = readVal(b, metric.key);
    const winner = av === bv ? null : (metric.lower ? (av < bv ? 'a' : 'b') : (av > bv ? 'a' : 'b'));
    return { ...metric, av, bv, winner };
  });
  const winsA = results.filter(metric => metric.winner === 'a').length;
  const winsB = results.filter(metric => metric.winner === 'b').length;
  const topYakus = player => [...(Array.isArray(player.yakus) ? player.yakus : Array.isArray(player.topYaku) ? player.topYaku : [])].sort((x, y) => y.count - x.count).slice(0, 4);
  const yakumanNames = new Set(['Tenhou','Chiihou','Daisangen','Suuankou','Tsuuiisou','Ryuuiisou','Chinroutou','Kokushi Musou','Shousuushii','Suukantsu','Chuuren Poutou','Suuankou Tanki','Kokushi 13-men','Daisuushii','Junsei Chuuren']);
  const yakumanIcon = name => ({ 'Kokushi Musou': '十三', 'Kokushi 13-men': '十三', Daisangen: '大三', Suuankou: '四暗', 'Suuankou Tanki': '四暗', Daisuushii: '大四', Shousuushii: '小四', Suukantsu: '四槓', 'Chuuren Poutou': '九蓮', 'Junsei Chuuren': '純九', Tsuuiisou: '字一', Ryuuiisou: '緑一', Chinroutou: '清老', Tenhou: '天和', Chiihou: '地和' }[name] || '役満');
  const yakumans = player => (Array.isArray(player.yakumans) ? player.yakumans : (player.yakus || []).filter(yaku => yakumanNames.has(yaku.name)));
  const achievements = player => (data.divisions[player.div].hallOfFame || []).filter(record => record.player?.id === player.id).slice(0, 3);
  const recentDelta = player => {
    const history = player.history || [];
    return history.slice(-5).reduce((sum, value) => sum + value, 0);
  };
  const placement = (player, place) => Math.round((player.placements?.[`p${place}`] || 0) * 100);
  const radar = player => metricsToRadar(player, data.divisions[player.div].players);
  const story = comparisonStory(a, b);

  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">03 / Comparador</span>
          <h1>{tr('cara_a_cara')}</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>対戦比較</span>
        </div>
        {crossDiv && <span className="cross-tag">{tr('inter_division')}</span>}
      </div>
      <div className="compare-duel-card">
        <div className="compare-duel-head">
        {[{ p: a, side: 'a', set: setAId }, { p: b, side: 'b', set: setBId }].map(({ p, side, set }) => (
          <div className={`compare-player ${side}`} key={side}>
            <ComparePlayerSelect value={p.id} onChange={set} data={data} side={side} />
          </div>
        ))}
          <div className="compare-score"><b>{winsA} — {winsB}</b><span>{tr('compare_metrics_won')}</span></div>
        </div>
        <div className="compare-story"><span>{tr('compare_reading')}</span><b>{story.title}</b><p>{story.text}</p></div>
        <div className="compare-main-grid">
          <section className="compare-radars"><h3>{tr('compare_profiles')}</h3><ComparisonRadar key={animKey} aStats={radar(a)} bStats={radar(b)} /><div className="compare-radar-legend"><span className="a">{a.shortName}</span><span className="b">{b.shortName}</span></div></section>
          <section className="compare-metrics">
        <div className="metrics-head">
          <span className="block-label">{tr('metrics_title')} · 成績比較</span>
          <span className="metrics-note">{tr('metrics_note')}</span>
        </div>
        {results.map(m => {
          const sc = scales[m.key];
          return (
            <div key={m.key} className={`versus-row ${m.winner === 'a' ? 'win-a' : ''} ${m.winner === 'b' ? 'win-b' : ''}`}>
              <div className="val-a">
                <span style={{ flex: 1, textAlign: 'right' }}>{m.fmt(m.av)}</span>
                <div className="bar-a"><div key={animKey + 'a' + m.key} style={{ transform: `scaleX(${sc(m.av)})` }} /></div>
              </div>
              <div className="vs-label">{m.label}<span className="jp">{m.jp}</span></div>
              <div className="val-b">
                <div className="bar-b"><div key={animKey + 'b' + m.key} style={{ transform: `scaleX(${sc(m.bv)})` }} /></div>
                <span style={{ flex: 1, textAlign: 'left' }}>{m.fmt(m.bv)}</span>
              </div>
            </div>
          );
        })}
          </section>
          <section className="compare-outcomes"><h3>{tr('compare_results_form')}</h3>{[a, b].map(player => <div className="compare-outcome" key={player.id}><div className="compare-placement">{[1,2,3,4].map(place => { const pct = placement(player, place); return pct > 0 && <i key={place} className={`p${place} ${pct <= 10 ? 'compact' : ''}`} style={{ width: `${pct}%` }} title={`${place}º · ${pct}%`}>{pct >= 10 ? <><span>{place}º</span> <b>{pct}%</b></> : ''}</i>; })}</div><div className="compare-outcome-meta"><b>{player.shortName}</b><span>{tr('lbl_avgrank')} {player.avgRank.toFixed(2)}</span></div><div className="compare-form">{(player.history || []).slice(-5).map((value, i) => <i key={i} className={value >= 0 ? 'up' : 'down'}>{value >= 0 ? '+' : '−'}</i>)}<b className={recentDelta(player) >= 0 ? 'pos' : 'neg'}>{fmtPts(recentDelta(player))}</b></div></div>)}</section>
        </div>
        <div className="compare-detail-grid">
          <section><h3>{tr('compare_match_results')}</h3><CompareMatchChart key={animKey} a={a} b={b}/><div className="compare-chart-legend"><span className="a">{a.shortName}</span><span className="b">{b.shortName}</span></div></section>
          <section><h3>{tr('compare_signature_yaku')}</h3>{[a,b].map(player => <div className="compare-yakus" key={player.id}><b>{player.shortName}</b><div>{topYakus(player).map(yaku => <span key={yaku.name}>{yakuGlyph(yaku.name)} {yaku.name} <i>×{yaku.count}</i></span>)}{!topYakus(player).length && <small>{tr('yaku_empty')}</small>}</div></div>)}</section>
          <section><h3>{tr('compare_achievements')}</h3>{[a,b].map(player => { const playerYakuman = yakumans(player); const playerAchievements = achievements(player); return <div className="compare-honors" key={player.id}><b>{player.shortName}</b><div>{playerYakuman.map(yaku => <span className="yakuman" key={yaku.name}><i>{yakuGlyph(yaku.name)}</i>{yaku.name} ×{yaku.count}</span>)}{playerAchievements.map((record,index) => { const copy = hallOfFameCopy(record,index); return <span key={record.key || index}><i>{['王','和','守','立','均','昇'][index] || '賞'}</i>{copy.tag}</span>; })}{!playerYakuman.length && !playerAchievements.length && <small>{tr('compare_no_achievements')}</small>}</div></div>; })}</section>
        </div>
        {crossDiv && <p className="compare-context">{tr('compare_cross_context')}</p>}
      </div>
    </div>
  );
}

function HanchanReplay({ match }) {
  const roundNames = ['history_round_east', 'history_round_south', 'history_round_west', 'history_round_north'];
  const windNames = ['history_wind_east', 'history_wind_south', 'history_wind_west', 'history_wind_north'];
  const rounds = match.rounds || [];
  return <div className="hanchan-replay">
    <div className="hanchan-replay-head"><div><span>{tr('history_replay_kicker')}</span><h3>{tr('history_replay_title')}</h3></div><small>{rounds.length} {tr('history_hands')}</small></div>
    {!rounds.length && <div className="hanchan-replay-empty">{tr('history_replay_unavailable')}</div>}
    <div className="hanchan-rounds">{rounds.map(round => {
      const outcomes = round.outcomes || [];
      const outcome = outcomes[0];
      const label = tr(roundNames[round.chang] || 'history_round', { n: (round.ju || 0) + 1 });
      const settlement = round.settlement || [];
      const tenpai = settlement.filter(player => player.tenpai);
      const noten = settlement.filter(player => !player.tenpai);
      return <article className={`hanchan-round ${round.result}`} key={round.index}>
        <header><div className="round-marker"><b>{label}</b><span>{round.honba ? `${round.honba} ${tr('history_honba')}` : tr('history_no_honba')}</span></div><div className="round-result"><strong>{round.result === 'tsumo' ? tr('by_tsumo') : round.result === 'ron' ? tr('by_ron') : round.result === 'draw' ? tr('history_draw') : tr('history_abortive')}</strong>{outcome && <span>{outcomes.map(item => `${item.winner}${item.loser ? ` ← ${item.loser}` : ''}`).join(' · ')}</span>}</div>{outcome && <b className="round-points">{outcomes.length > 1 ? `${outcomes.length}×` : (outcome.points || 0).toLocaleString('es-CL')}</b>}</header>
        {outcome ? <div className="round-outcomes">{outcomes.map((item, outcomeIndex) => <div className="round-body" key={`${item.winnerSeat}-${outcomeIndex}`}><div className="round-outcome-title"><strong>{item.winner}</strong><b>{(item.points || 0).toLocaleString('es-CL')}</b></div><HandTiles hand={item.hand} win={item.win} melds={item.melds} /><div className="round-meta"><span>{(item.yaku || []).join(' · ')}</span><div>{item.riichi && <em className="badge-riichi">{tr('badge_riichi')}</em>}<b>{item.yakuman ? tr('hand_yakuman') : tr('hand_han', { n: item.han })}</b><b>{tr('hand_fu', { n: item.fu })}</b><b>{tr('hand_turn', { n: item.turn })}</b></div></div></div>)}</div>
        : <div className="round-draw"><strong>{round.result === 'draw' ? tr('history_draw') : tr('history_abortive')}</strong><div><p>{round.result === 'draw' ? tr('history_draw_detail') : tr('history_abortive_detail')}</p>{round.result === 'draw' && settlement.length > 0 && <div className="draw-status"><span className="tenpai"><b>{tr('history_tenpai')}</b>{tenpai.length ? tenpai.map(player => `${player.player} ${player.delta > 0 ? '+' : ''}${Number(player.delta).toLocaleString('es-CL')}`).join(' · ') : tr('history_nobody')}</span><span className="noten"><b>{tr('history_noten')}</b>{noten.length ? noten.map(player => `${player.player} ${player.delta > 0 ? '+' : ''}${Number(player.delta).toLocaleString('es-CL')}`).join(' · ') : tr('history_nobody')}</span></div>}</div></div>}
        {settlement.length === 4 && <footer className="round-settlement"><div className="settlement-title">{tr('history_score_after')}</div>{settlement.map(player => { const wind = (player.seat - (round.ju || 0) + 4) % 4; return <span key={player.seat}><i>{player.player}</i><small>{tr(windNames[wind])}</small><strong>{Number(player.score).toLocaleString('es-CL')}</strong><b className={player.delta > 0 ? 'pos' : player.delta < 0 ? 'neg' : ''}>{player.delta > 0 ? '+' : ''}{Number(player.delta).toLocaleString('es-CL')}</b></span>; })}</footer>}
      </article>;
    })}</div>
  </div>;
}

function HanchanLog({ data, div }) {
  const [filter, setFilter] = React.useState('all');
  const [playerFilter, setPlayerFilter] = React.useState('');
  const [countryFilter, setCountryFilter] = React.useState('');
  const [dateFilter, setDateFilter] = React.useState('');
  const [expanded, setExpanded] = React.useState(null);
  const divData = data.divisions[div];
  const sessions = divData.sessions;
  const allMatches = React.useMemo(() => [...divData.matches].reverse(), [divData.matches]);
  const playerOptions = (() => {
    const players = new Map();
    allMatches.flatMap(match => match.players || []).forEach(player => players.set(player.name, player));
    return [{ value: '', label: tr('calendar_all_players') }, ...[...players.values()].sort((a, b) => a.name.localeCompare(b.name)).map(player => ({ value: player.name, label: player.name, nat: player.nat }))];
  })();
  const countryOptions = (() => {
    const countries = [...new Set(allMatches.flatMap(match => match.players || []).map(player => player.nat).filter(Boolean))].sort();
    return [{ value: '', label: tr('calendar_all_countries') }, ...countries.map(nat => ({ value: nat, label: COUNTRIES[nat]?.name || nat, nat }))];
  })();
  const dateOptions = (() => {
    const dates = new Map();
    allMatches.forEach(match => dates.set(match.dateISO || match.date, match.date));
    return [{ value: '', label: tr('history_all_dates') }, ...[...dates].map(([value, label]) => ({ value, label }))];
  })();
  const matches = React.useMemo(() => {
    return allMatches.filter(match => (filter === 'all' || match.sessionCode === filter)
      && (!playerFilter || match.players.some(player => player.name === playerFilter))
      && (!countryFilter || match.players.some(player => player.nat === countryFilter))
      && (!dateFilter || (match.dateISO || match.date) === dateFilter));
  }, [allMatches, filter, playerFilter, countryFilter, dateFilter]);
  const filtersActive = filter !== 'all' || playerFilter || countryFilter || dateFilter;
  const resetFilters = () => { setFilter('all'); setPlayerFilter(''); setCountryFilter(''); setDateFilter(''); };
  const sessionDate = (session) => {
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dated = [];
    const addDisplayDate = (value) => {
      const match = String(value || '').match(/^(\d{1,2})\s+([a-záéíóú]{3})$/i);
      const month = match && months.indexOf(match[2].toLowerCase());
      if (match && month >= 0) dated.push(new Date(new Date().getFullYear(), month, Number(match[1])));
    };
    data.calendar.filter(c => c.div === div && (c.session || 0) === session.n).forEach(c => addDisplayDate(c.date));
    divData.matches.filter(m => m.session === session.n).forEach(m => {
      addDisplayDate(m.date);
      const uuidDate = String(m.paipuUrl || '').match(/[?&]paipu=(\d{2})(\d{2})(\d{2})-/);
      if (uuidDate) dated.push(new Date(2000 + Number(uuidDate[1]), Number(uuidDate[2]) - 1, Number(uuidDate[3])));
    });
    if (!dated.length) return 'Por definir';
    const earliest = new Date(Math.min(...dated));
    return `${String(earliest.getDate()).padStart(2, '0')} ${months[earliest.getMonth()]}`;
  };

  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">04 / Log</span>
          <h1>{tr('historial_title')}</h1>
          <span className={`div-chip ${div}`}>DIV {div}</span>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>半荘記録</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
          {tr('log_count', { shown: matches.length, total: divData.matches.length })}
        </div>
      </div>

      <div className="session-filter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{tr('all')}</button>
        {sessions.map(s => (
          <button key={s.code} className={filter === s.code ? 'active' : ''} onClick={() => setFilter(s.code)}>
            {s.code} <span className="sf-date">{sessionDate(s)}</span>
          </button>
        ))}
      </div>

      <div className="history-filter-bar">
        <CalendarFilterDropdown label={tr('calendar_filter_player')} icon="◉" value={playerFilter} options={playerOptions} onChange={setPlayerFilter} searchable />
        <CalendarFilterDropdown label={tr('calendar_filter_country')} icon="◎" value={countryFilter} options={countryOptions} onChange={setCountryFilter} />
        <CalendarFilterDropdown label={tr('history_filter_date')} icon="□" value={dateFilter} options={dateOptions} onChange={setDateFilter} />
        {filtersActive && <button className="history-clear-filters" onClick={resetFilters}>{tr('calendar_clear_filters')}</button>}
      </div>

      <div className="hanchan-list">
        {matches.map((m, idx) => (
          <div className={`hanchan-card ${expanded === m.id ? 'expanded' : ''}`} key={m.id} style={{ animation: 'rowin .35s ease both', animationDelay: `${Math.min(idx, 30) * 14}ms` }}>
            <div className="code-block">
              <div className="code">{m.code}</div>
              <div className="date">{m.sessionCode} · H{m.hanchan}</div>
              <div className="table">{tr('mesa', { n: m.table })} · {m.date}</div>
              <div className="hanchan-round-count"><strong>{m.rounds?.length || 0}</strong><span>{tr('history_hands')}</span></div>
              <div className="hanchan-outcome-summary">
                <span className="tsumo">{tr('history_tsumo_count')} <b>{(m.rounds || []).filter(round => round.result === 'tsumo').length}</b></span>
                <span className="ron">{tr('history_ron_count')} <b>{(m.rounds || []).filter(round => round.result === 'ron').length}</b></span>
                <span className="draw">{tr('history_draw_count')} <b>{(m.rounds || []).filter(round => round.result === 'draw' || round.result === 'abortive').length}</b></span>
              </div>
              <button className="hanchan-replay-toggle" onClick={() => setExpanded(expanded === m.id ? null : m.id)} aria-expanded={expanded === m.id}><span>{expanded === m.id ? tr('history_hide_replay') : tr('history_open_replay')}</span><i>{expanded === m.id ? '−' : '▶'}</i></button>
              {m.paipuUrl && <a href={paipuHref(m.paipuUrl)} target="_blank" rel="noopener noreferrer" className="paipu-link">{tr('view_paipu')}</a>}
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
            {expanded === m.id && <HanchanReplay match={m} />}
          </div>
        ))}
        {!matches.length && <div className="history-empty"><strong>{tr('history_no_results')}</strong><span>{tr('history_no_results_detail')}</span><button onClick={resetFilters}>{tr('calendar_clear_filters')}</button></div>}
      </div>
    </div>
  );
}

// Hora en una zona, con la marca de salto de día. Sin la marca, una sesión de
// las 22:00 en Chile se ve como "11:00" en Tokio y no queda dicho que es el día
// siguiente.
function TzTime({ date, time, tz }) {
  const { time: t, shift } = window.fmtTzParts(date, time, tz);
  if (!shift) return <React.Fragment>{t}</React.Fragment>;
  return (
    <React.Fragment>
      {t}
      <sup className="tz-shift" title={tr(shift > 0 ? 'dia_sig' : 'dia_ant')}>
        {shift > 0 ? '+1' : '−1'}
      </sup>
    </React.Fragment>
  );
}

function CalModal({ entry, onClose }) {
  const players = entry.players || [];
  const baseTz = 'America/Santiago';
  const natTz = window.NAT_TZ || {};
  return (
    <div className="cal-modal-backdrop" onClick={onClose}>
      <div className="cal-modal" onClick={e => e.stopPropagation()}>
        <div className="cm-head">
          <div>
            <div className="cm-title">{entry.round} · {entry.mesa}</div>
            {entry.date !== 'Por definir' && <div className="cm-sub">{entry.date} · {entry.day} · <TzTime date={entry.date} time={entry.time} tz={window.TZ} /> · {window.TZ}</div>}
          </div>
          <button className="cm-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {players.length > 0 && (
          <div className="cm-players">
            <div className="cm-block">{tr('hora_local')} · {tr('jugadores')}</div>
            {players.map((pl, i) => {
              const tz = natTz[pl.nat] || baseTz;
              return (
                <div className="cm-player" key={i}>
                  <div className="cm-name"><Flag nat={pl.nat} size={15} />{pl.name}</div>
                  <div className="cm-tz"><b><TzTime date={entry.date} time={entry.time} tz={tz} /></b><span>{tz}</span></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarFilterDropdown({ label, icon, value, options, onChange, searchable = false }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const selected = options.find(option => option.value === value) || options[0];
  const visible = options.filter((option, index) => index === 0 || !query || option.label.toLowerCase().includes(query.toLowerCase()));
  const pick = option => { onChange(option.value); setOpen(false); setQuery(''); };
  return <div className={`calendar-filter-dropdown ${open ? 'open' : ''}`} ref={rootRef}>
    <span className="calendar-filter-label"><i>{icon}</i>{label}</span>
    <button className="calendar-filter-trigger" onClick={() => setOpen(current => !current)} aria-expanded={open} aria-haspopup="listbox">
      <span>{selected.nat && <Flag nat={selected.nat} size={15} />}{selected.mark && <i className={`calendar-filter-mark ${selected.mark}`}></i>}<strong>{selected.label}</strong></span><b>⌄</b>
    </button>
    {open && <div className="calendar-filter-menu" role="listbox">
      {searchable && <label className="calendar-filter-search"><span>⌕</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => event.key === 'Escape' && setOpen(false)} placeholder={tr('calendar_filter_search')} /></label>}
      <div className="calendar-filter-options">{visible.map(option => <button className={option.value === value ? 'active' : ''} key={option.value || 'all'} onClick={() => pick(option)} role="option" aria-selected={option.value === value}><span>{option.nat ? <Flag nat={option.nat} size={16} /> : option.mark ? <i className={`calendar-filter-mark ${option.mark}`}></i> : <i className="calendar-filter-all">◇</i>}<strong>{option.label}</strong></span>{option.value === value && <b>✓</b>}</button>)}</div>
    </div>}
  </div>;
}

function CalendarView({ data, div = 'A' }) {
  const [modal, setModal] = React.useState(null);
  const [view, setView] = React.useState('week');
  const [playerFilter, setPlayerFilter] = React.useState('');
  const [countryFilter, setCountryFilter] = React.useState('');
  const [timeFilter, setTimeFilter] = React.useState('all');
  const MONTHS = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
  const toDate = (s) => {
    const parts = String(s || '').split(' ');
    const day = parseInt(parts[0], 10), mon = MONTHS[parts[1]];
    if (isNaN(day) || mon === undefined) return null;
    const d = new Date(new Date().getFullYear(), mon, day);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sessNum = (c) => c.session || parseInt((c.round || '').replace(/\D/g, ''), 10) || 0;
  const currentSession = currentSessionNumber(data);
  const byDate = (a, b) => (toDate(a.date) - toDate(b.date)) || (a.div === 'B' ? 1 : 0) - (b.div === 'B' ? 1 : 0);
  const divisionEntries = data.calendar.filter(c => c.div === div && sessNum(c) === currentSession);
  const namedPlayers = [...new Set(divisionEntries.flatMap(c => c.players || []).map(p => p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const countries = [...new Set(divisionEntries.flatMap(c => c.players || []).map(p => p.nat).filter(nat => nat && nat !== 'OT'))].sort();
  const playerOptions = [{ value: '', label: tr('calendar_all_players') }, ...namedPlayers.map(name => ({ value: name, label: name, nat: divisionEntries.flatMap(c => c.players || []).find(player => player.name === name)?.nat }))];
  const countryOptions = [{ value: '', label: tr('calendar_all_countries') }, ...countries.map(nat => ({ value: nat, label: COUNTRIES[nat]?.name || nat, nat }))];
  const timeOptions = [{ value: 'all', label: tr('calendar_all_times'), mark: 'all' }, { value: 'defined', label: tr('calendar_defined'), mark: 'defined' }, { value: 'pending', label: tr('calendar_undefined'), mark: 'pending' }];
  const matchesFilters = entry => {
    const players = entry.players || [];
    const hasTime = Boolean(toDate(entry.date)) && entry.time !== 'Por definir';
    return (!playerFilter || players.some(p => p.name === playerFilter))
      && (!countryFilter || players.some(p => p.nat === countryFilter))
      && (timeFilter === 'all' || (timeFilter === 'defined' ? hasTime : !hasTime));
  };
  const filtered = divisionEntries.filter(matchesFilters);
  const scheduled = filtered.filter(c => toDate(c.date)).sort(byDate);
  const pending = filtered.filter(c => !toDate(c.date)).sort((a, b) => sessNum(a) - sessNum(b) || (a.table || 0) - (b.table || 0));
  const nextEntry = scheduled.find(c => toDate(c.date) >= today);
  const focusDate = toDate(nextEntry?.date) || toDate(data.league.nextSession.date) || today;
  const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  const firstOffset = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 0).getDate();
  const monthCells = Array.from({ length: Math.ceil((firstOffset + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstOffset + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const datedForDay = day => scheduled.filter(entry => { const d = toDate(entry.date); return d && d.getMonth() === focusDate.getMonth() && d.getDate() === day; });
  const weekStart = new Date(focusDate); weekStart.setDate(focusDate.getDate() - ((focusDate.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + index); return d; });
  const hours = [...new Set(scheduled.map(entry => entry.time).filter(time => time && time !== 'Por definir'))].sort();
  const visibleHours = hours.length ? hours : ['—:—'];
  const sameDate = (entry, date) => { const d = toDate(entry.date); return d && d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate(); };
  const resetFilters = () => { setPlayerFilter(''); setCountryFilter(''); setTimeFilter('all'); };
  const renderCalendarPlayers = entry => <span className="calendar-event-players">{(entry.players || []).filter(player => player.name).map(player => <span key={player.name}><Flag nat={player.nat} size={11} /><em>{player.name}</em><small>{player.nat && player.nat !== 'OT' ? (COUNTRIES[player.nat]?.name || player.nat) : ''}</small></span>)}</span>;
  const renderPendingCard = entry => (
    <button className={`calendar-pending-card div-${div}`} key={`${entry.round}-${entry.table}`} onClick={() => setModal(entry)}>
      <div className="cpc-head"><span>{entry.round} · {tr('mesa', { n: entry.table })}</span><b>{tr('calendar_needs_coordination')}</b></div>
      <div className="cpc-time">—:—</div><small>{tr('calendar_time_undefined')}</small>
      {renderCalendarPlayers(entry)}
      <div className="cpc-format">2 hanchan · {tr('division', { d: div })}</div>
    </button>
  );
  return (
    <div className="tab-panel" style={{ '--calendar-accent': accentFor(div) }}>
      <div className="section-head">
        <div className="h-left">
          <span className="num">05 / Agenda</span>
          <h1>{tr('calendario_title')}</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>予定</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
          {tr('cal_subtitle', { total: data.league.sessionsTotal, per: data.league.hanchanPerSession })} · {tr('division', { d: div })}
        </div>
      </div>

      <div className="calendar-season-line">{Array.from({ length: data.league.sessionsTotal }, (_, index) => { const n = index + 1; return <div className={`calendar-season-step ${n < currentSession ? 'done' : n === currentSession ? 'current' : ''}`} key={n}><i>{n < currentSession ? '✓' : n}</i><span>{n === currentSession ? tr('calendar_current') : `S${n}`}</span></div>; })}</div>

      <div className="calendar-toolbar">
        <div className="calendar-view-switch"><button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>▦ {tr('calendar_month_view')}</button><button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>◫ {tr('calendar_week_view')}</button></div>
        <div className="calendar-filters">
          <CalendarFilterDropdown label={tr('calendar_filter_player')} icon="選" value={playerFilter} options={playerOptions} onChange={setPlayerFilter} searchable />
          <CalendarFilterDropdown label={tr('calendar_filter_country')} icon="国" value={countryFilter} options={countryOptions} onChange={setCountryFilter} />
          <CalendarFilterDropdown label={tr('calendar_filter_time')} icon="時" value={timeFilter} options={timeOptions} onChange={setTimeFilter} />
          {(playerFilter || countryFilter || timeFilter !== 'all') && <button onClick={resetFilters}>{tr('calendar_clear_filters')}</button>}
        </div>
      </div>

      {nextEntry ? <button className={`calendar-next-feature div-${div}`} onClick={() => setModal(nextEntry)}><div className="cnf-date"><strong>{nextEntry.date.split(' ')[0]}</strong><span>{nextEntry.date.split(' ')[1]} · {nextEntry.day}</span></div><div className="cnf-copy"><span>{tr('calendar_next_session')}</span><h2>{nextEntry.round} · {tr('mesa', { n: nextEntry.table })}</h2><p>{(nextEntry.players || []).filter(player => player.name).map(player => player.name).join(' · ')}</p></div><div className="cnf-time"><strong><TzTime date={nextEntry.date} time={nextEntry.time} tz={window.TZ} /></strong><span>{window.TZ}</span></div></button>
      : <div className={`calendar-next-feature undefined div-${div}`}><div className="cnf-date"><strong>—</strong><span>{tr('por_definir')}</span></div><div className="cnf-copy"><span>{tr('calendar_next_session')}</span><h2>{tr('calendar_still_undefined')}</h2><p>{tr('calendar_no_scheduled_session')}</p></div><div className="cnf-time pending"><strong>—:—</strong><span>{tr('calendar_needs_coordination')}</span></div></div>}

      {view === 'month' ? <section className="calendar-month-panel"><div className="calendar-panel-head"><div><span className="block-label">{tr('calendar_month_view')}</span><h2>{monthNames[focusDate.getMonth()]} {focusDate.getFullYear()}</h2></div><span>{scheduled.length} {tr('calendar_scheduled_count')}</span></div><div className="calendar-month-grid">{['L','M','X','J','V','S','D'].map(day => <div className="calendar-weekday" key={day}>{day}</div>)}{monthCells.map((day, index) => <div className={`calendar-day ${day === focusDate.getDate() ? 'focus' : ''}`} key={index}>{day && <span>{day}</span>}{day && datedForDay(day).map(entry => <button className={`calendar-day-event div-${div}`} key={`${entry.session}-${entry.table}`} onClick={() => setModal(entry)}><span className="calendar-mobile-date">{entry.day} · {entry.date}</span><span>{entry.round} · M{entry.table}</span><strong><TzTime date={entry.date} time={entry.time} tz={window.TZ} /></strong>{renderCalendarPlayers(entry)}</button>)}</div>)}</div></section>
      : <section className="calendar-week-panel"><div className="calendar-panel-head"><div><span className="block-label">{tr('calendar_week_view')}</span><h2>{tr('calendar_week_of', { date: `${weekDays[0].getDate()} ${monthNames[weekDays[0].getMonth()]}` })}</h2></div><span>{window.TZ}</span></div><div className="calendar-week-grid"><div className="calendar-week-corner"></div>{weekDays.map(day => <div className="calendar-week-day" key={day.toISOString()}><strong>{['L','M','X','J','V','S','D'][(day.getDay() + 6) % 7]}</strong><span>{day.getDate()}</span></div>)}{visibleHours.map(hour => <React.Fragment key={hour}><div className="calendar-hour">{hour}</div>{weekDays.map(day => { const entries = scheduled.filter(entry => entry.time === hour && sameDate(entry, day)); return <div className="calendar-week-slot" key={day.toISOString() + hour}>{entries.map(entry => <button className={`calendar-week-event div-${div}`} key={entry.table} onClick={() => setModal(entry)}><span className="calendar-mobile-date">{entry.day} · {entry.date}</span><span>{entry.round} · {tr('mesa', { n: entry.table })}</span><strong><TzTime date={entry.date} time={entry.time} tz={window.TZ} /></strong>{renderCalendarPlayers(entry)}</button>)}</div>; })}</React.Fragment>)}</div></section>}

      {pending.length > 0 && <section className="calendar-pending-section"><div className="calendar-panel-head"><div><span className="block-label">{tr('calendar_coordination')}</span><h2>{tr('calendar_undefined')}</h2></div><span>{pending.length} {tr('calendar_tables')}</span></div><div className="calendar-pending-grid">{pending.map(renderPendingCard)}</div></section>}
      {!filtered.length && <div className="calendar-empty"><strong>{tr('calendar_no_results')}</strong><button onClick={resetFilters}>{tr('calendar_clear_filters')}</button></div>}
      {modal && ReactDOM.createPortal(<CalModal entry={modal} onClose={() => setModal(null)} />, document.body)}

    </div>
  );
}

function HallOfFame({ data, div = 'A' }) {
  const division = data.divisions[div];
  const recordKeys = new Set(['leader', 'wins', 'defense', 'riichi', 'consistency', 'recent']);
  const distinctionKeys = new Set(['kans', 'doras', 'ura_doras', 'renchan']);
  const yakumanNames = new Set(['Tenhou','Chiihou','Daisangen','Suuankou','Tsuuiisou','Ryuuiisou','Chinroutou','Kokushi Musou','Shousuushii','Suukantsu','Chuuren Poutou','Suuankou Tanki','Kokushi 13-men','Daisuushii','Junsei Chuuren']);
  const yakumanIcon = name => ({ 'Kokushi Musou': '十三', 'Kokushi 13-men': '十三', Daisangen: '大三', Suuankou: '四暗', 'Suuankou Tanki': '四暗', Daisuushii: '大四', Shousuushii: '小四', Suukantsu: '四槓', 'Chuuren Poutou': '九蓮', 'Junsei Chuuren': '純九', Tsuuiisou: '字一', Ryuuiisou: '緑一', Chinroutou: '清老', Tenhou: '天和', Chiihou: '地和' }[name] || '役満');
  const icons = { leader: '王', wins: '和', defense: '守', riichi: '立', consistency: '均', recent: '昇', kans: '槓', doras: '輝', ura_doras: '運', renchan: '連', saki: '咲' };
  const records = division.hallOfFame.filter(item => recordKeys.has(item.key));
  const sakiPlayer = [...division.players].sort((a, b) => Math.abs(a.points) - Math.abs(b.points))[0];
  const distinctions = [
    { key: 'saki', value: fmtPts(sakiPlayer.points), player: sakiPlayer, jp: '咲' },
    ...division.hallOfFame.filter(item => distinctionKeys.has(item.key)),
  ];
  const yakumans = division.players.flatMap(player => (player.yakus || []).filter(yaku => yakumanNames.has(yaku.name)).map(yaku => ({ ...yaku, player })));
  const yakumanEvents = division.players.flatMap(player => (data.yakuHands?.[player.id] || []).filter(hand => hand.yakuman).map(hand => ({ ...hand, player }))).sort((a, b) => b.session - a.session || b.hanchan - a.hanchan);
  const latestSession = Math.max(0, ...(division.sessions || []).map(session => session.n || Number(String(session.code || '').replace(/\D/g, '')) || 0));
  const feature = records[0];
  const distinctionCopy = item => ({
    saki: [tr('achievement_saki'), tr('achievement_saki_hint')],
    kans: [tr('achievement_kans'), tr('achievement_kans_hint')],
    doras: [tr('achievement_doras'), tr('achievement_doras_hint')],
    ura_doras: [tr('achievement_ura_doras'), tr('achievement_ura_doras_hint')],
    renchan: [tr('achievement_renchan'), tr('achievement_renchan_hint')],
  }[item.key] || [item.key, '']);
  const HonorPlayer = ({ player }) => <span className="museum-player"><span className={`avatar div-${div}`}>{initials(player.handle)}</span><span><strong>{player.shortName}</strong><small><Flag nat={player.nat} size={13} /> {COUNTRIES[player.nat].name} · #{player.rank}</small></span></span>;
  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">06 / Records</span>
          <h1>{tr('museum_title')}</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>名誉殿堂</span>
        </div>
        <div className="museum-meta">{tr('division', { d: div })} · {tr('app_tagline')}</div>
      </div>
      <div className={`museum-summary div-${div}`}><div><span className="block-label">{tr('museum_kicker')}</span><h2>{tr('museum_division_title', { d: div })}</h2><p>{tr('museum_intro')}</p></div><div className="museum-counts"><span><b>{records.length}</b>{tr('records_title')}</span><span><b>{distinctions.length}</b>{tr('achievement_distinctions')}</span><span><b>{yakumans.reduce((sum, item) => sum + item.count, 0)}</b>{tr('yakuman_title')}</span></div></div>
      <div className="museum-layout">
        <main className="museum-gallery">
          {feature && <article className={`museum-feature div-${div}`}><div><span className="museum-eyebrow">{tr('museum_feature')}</span><h2>{feature.player.shortName}</h2><p>{hallOfFameCopy(feature, 0).tag}</p><strong>{feature.value}</strong><small>{hallOfFameCopy(feature, 0).sub}</small><HonorPlayer player={feature.player} /></div><i>{icons[feature.key]}</i></article>}
          <section className="museum-family"><div className="museum-family-head"><div><span>{tr('records_title')}</span><small>{tr('museum_records_hint')}</small></div><b>{records.length}</b></div><div className="museum-items">{records.slice(1).map((item, index) => { const copy = hallOfFameCopy(item, index + 1); return <article className="museum-item" key={item.key}><i className="record">{icons[item.key]}</i><div><h3>{copy.tag}</h3><p>{copy.sub}</p><HonorPlayer player={item.player} /></div><strong>{item.value}</strong></article>; })}</div></section>
          <section className="museum-family"><div className="museum-family-head"><div><span>{tr('achievement_distinctions')}</span><small>{tr('museum_distinctions_hint')}</small></div><b>{distinctions.length}</b></div><div className="museum-items">{distinctions.map(item => { const copy = distinctionCopy(item); return <article className="museum-item" key={item.key}><i className="distinction">{icons[item.key]}</i><div><h3>{copy[0]}</h3><p>{copy[1]}</p><HonorPlayer player={item.player} /></div><strong>{item.value}</strong></article>; })}</div></section>
          <section className="museum-family"><div className="museum-family-head"><div><span>{tr('yakuman_title')}</span><small>{tr('museum_yakuman_hint')}</small></div><b>{yakumans.reduce((sum, item) => sum + item.count, 0)}</b></div>{yakumans.length ? <div className="museum-items">{yakumans.map(item => <article className="museum-item" key={`${item.player.id}-${item.name}`}><i className="yakuman">{yakumanIcon(item.name)}</i><div><h3>{item.name}</h3><p>{tr('achievement_yakuman_detail', { n: item.count })}</p><HonorPlayer player={item.player} /></div><strong>×{item.count}</strong></article>)}</div> : <div className="museum-empty">◇ <span>{tr('yakuman_empty')}</span></div>}</section>
        </main>
        <aside className="museum-chronicle"><div className="museum-chronicle-head"><span className="block-label">{tr('museum_chronicle')}</span><h2>{tr('museum_latest')}</h2></div>{yakumanEvents.slice(0, 3).map(event => { const name = event.yaku.find(yaku => yakumanNames.has(yaku)) || event.yaku[0]; return <article className="museum-event" key={`${event.player.id}-${event.session}-${event.hanchan}-${event.yaku.join('-')}`}><i>{yakumanIcon(name)}</i><div><span>{tr('museum_new_yakuman')}</span><h3>{event.player.shortName}</h3><p>{event.yaku.filter(yaku => yakumanNames.has(yaku)).join(' · ')}</p><small>S{event.session} · H{event.hanchan}</small></div></article>; })}{feature && <article className="museum-event current"><i>{icons.leader}</i><div><span>{tr('museum_current_record')}</span><h3>{feature.player.shortName}</h3><p>{hallOfFameCopy(feature, 0).tag} · {feature.value}</p><small>{tr('museum_after_session', { n: latestSession })}</small></div></article>}<article className="museum-event current"><i>{icons.saki}</i><div><span>{tr('museum_current_distinction')}</span><h3>{sakiPlayer.shortName}</h3><p>{tr('achievement_saki')} · {fmtPts(sakiPlayer.points)}</p><small>{tr('museum_after_session', { n: latestSession })}</small></div></article></aside>
      </div>
    </div>
  );
}

Object.assign(window, { PlayerDetail, Comparator, HanchanLog, CalendarView, HallOfFame, IORMCView, metricsToRadar, PlayerSelect, accentFor, placementSegments, metricScale });
