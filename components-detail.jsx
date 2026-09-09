// components-detail.jsx — player detail, comparator, hanchan log, calendar, hall of fame

function accentFor(div) { return div === 'B' ? 'var(--accent-2)' : 'var(--accent)'; }
// Dos primeras letras para el círculo del avatar (el handle completo se desborda)
function initials(h) { return (h || '').slice(0, 2); }

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

function YakuProfile({ yakus, color }) {
  if (!yakus.length) return <div className="yaku-empty">{tr('yaku_empty')}</div>;
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
      <div className="yaku-top-three">{top.map((yaku, index) => <div className="yaku-top" key={yaku.name}>
        <span className="yaku-top-rank">{index === 0 ? tr('yaku_high') : tr('yaku_rank_n', { n: index + 1 })}</span>
        <i>{yakuGlyph(yaku.name)}</i><strong>{yaku.name}</strong><b>{yaku.count} · {pct(yaku.count)}%</b>
      </div>)}</div>
    </div>
    <div className="yaku-rest-label">{tr('yaku_other_title')}</div>
    <div className="yaku-ledger">
      {!!yakuhai.length && <div className="yaku-yakuhai-group">
        <div><strong>{tr('yaku_yakuhai_group')}</strong><span>{tr('yaku_yakuhai_hint')}</span></div>
        <div className="yaku-yakuhai-items">{yakuhai.map(yaku => <span key={yaku.name}>{yaku.name.replace(/^Yakuhai\s*/i, '')} <b>{yaku.count} · {pct(yaku.count)}%</b></span>)}</div>
        <div className="yaku-yakuhai-total"><strong>{yakuhaiTotal}</strong><span>{pct(yakuhaiTotal)}% {tr('yaku_total_suffix')}</span></div>
      </div>}
      {other.map(yaku => <div className="yaku-ledger-row" key={yaku.name}>
        <span>{yaku.name}</span><div><i style={{ width: `${Math.max(4, pct(yaku.count))}%` }} /></div><b>{yaku.count}</b><small>{pct(yaku.count)}%</small>
      </div>)}
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
            <YakuProfile yakus={yakus} color={color} />
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

  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">03 / Comparador</span>
          <h1>{tr('cara_a_cara')}</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>対戦比較</span>
        </div>
        <div className="vs-header">
          <span className={`div-chip ${a.div}`}>{a.handle}</span>
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>VS</span>
          <span className={`div-chip ${b.div}`}>{b.handle}</span>
          {crossDiv && <span className="cross-tag">{tr('inter_division')}</span>}
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
            <RadarChart key={side + animKey} stats={metricsToRadar(p, data.divisions[p.div].players)} color={side === 'a' ? 'var(--accent)' : 'var(--accent-2)'} size={260} />
          </div>
        ))}
      </div>

      <div className="metrics-card">
        <div className="metrics-head">
          <span className="block-label">{tr('metrics_title')} · 成績比較</span>
          <span className="metrics-note">{tr('metrics_note')}</span>
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

      <div className="hanchan-list">
        {matches.map((m, idx) => (
          <div className="hanchan-card" key={m.id} style={{ animation: 'rowin .35s ease both', animationDelay: `${Math.min(idx, 30) * 14}ms` }}>
            <div className="code-block">
              <div className="code">{m.code}</div>
              <div className="date">{m.sessionCode} · H{m.hanchan}</div>
              <div className="table">{tr('mesa', { n: m.table })} · {m.date}</div>
              {m.paipuUrl && <a href={m.paipuUrl.replace(/^Mahjong Soul Game Log:/, '')} target="_blank" rel="noopener noreferrer" className="paipu-link">{tr('view_paipu')}</a>}
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

function CalendarView({ data }) {
  const played = data.divisions.A.sessions;
  const [modal, setModal] = React.useState(null);
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
  // Próximas: con fecha válida y no pasada (>= hoy). Pasadas quedan ocultas.
  const upcoming = data.calendar.filter(c => { const d = toDate(c.date); return d && d >= today; }).sort(byDate);
  // Por definir: sin fecha.
  const porDef = data.calendar
    .filter(c => !toDate(c.date) && sessNum(c) === currentSession)
    .sort((a, b) => (a.table || 0) - (b.table || 0));
  const renderCard = (c, i) => (
    <button className={`cal-card ${c.status === 'highlight' ? 'highlight' : ''} div-${c.div}`} key={c.round + c.mesa + c.div}
         onClick={() => setModal(c)}
         style={{ animation: 'rowin .4s ease both', animationDelay: `${i * 30}ms`, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', width: '100%' }}>
      <div className="badge"><span className={`div-chip ${c.div}`}>{c.div === 'AB' ? 'A+B' : c.div === 'CL' ? 'CHILE' : 'DIV ' + c.div}</span>{c.div === 'CL' && <Flag nat="CL" size={16} />}</div>
      <div className="date-row">
        <span className="d">{c.date.split(' ')[0]}</span>
        <span className="dy">{c.date.split(' ')[1]} · {c.day}</span>
      </div>
      <div className="round-l">{c.round}</div>
      <div className="meta-l">{c.mesa}</div>
      <div className="meta-l">{c.date === 'Por definir' ? tr('por_definir') : <React.Fragment><TzTime date={c.date} time={c.time} tz={window.TZ} /> · {window.TZ}</React.Fragment>}</div>
      {c.players && c.players.length > 0 && (
        <div className="cal-players">
          {c.players.map(pl => (
            <span className="cal-p" key={pl.name}><Flag nat={pl.nat} size={10} />{pl.name}</span>
          ))}
        </div>
      )}
    </button>
  );
  return (
    <div className="tab-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">05 / Agenda</span>
          <h1>{tr('calendario_title')}</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>予定</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
          {tr('cal_subtitle', { total: data.league.sessionsTotal, per: data.league.hanchanPerSession })}
        </div>
      </div>

      {upcoming.length > 0 && (
        <React.Fragment>
          <div className="block-label" style={{ marginBottom: 12 }}>{tr('next_cal')} · 次回</div>
          <div className="cal-grid">{upcoming.map(renderCard)}</div>
        </React.Fragment>
      )}
      {porDef.length > 0 && (
        <React.Fragment>
          <div className="block-label" style={{ margin: '28px 0 12px' }}>{tr('por_definir')} · 未定</div>
          <div className="cal-grid">{porDef.map(renderCard)}</div>
        </React.Fragment>
      )}
      {modal && ReactDOM.createPortal(<CalModal entry={modal} onClose={() => setModal(null)} />, document.body)}

      <div className="block-label" style={{ margin: '28px 0 12px' }}>{tr('played_sessions')} · 実施済み</div>
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
          <h1>{tr('records_title')}</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>名誉殿堂</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>{tr('app_tagline')} · ambos</div>
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
            {data.divisions[d].hallOfFame.map((h, i) => {
              const copy = hallOfFameCopy(h, i);
              return <div className={`hof-card div-${d}`} key={h.key || i} style={{ animation: 'rowin .4s ease both', animationDelay: `${i * 45}ms` }}>
                <div className="jp-mark">{h.jp}</div>
                <div className="tag">{copy.tag}</div>
                <div className="value" style={{ color: accentFor(d) }}>{h.value}</div>
                <div className="sub">{copy.sub}</div>
                <div className="player-line">
                  <div className={`avatar div-${d}`}>{initials(h.player.handle)}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{h.player.shortName}</div>
                    <div className="nat-line" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
                      <Flag nat={h.player.nat} size={14} /><span>{COUNTRIES[h.player.nat].name}</span><span className="dot-sep">·</span><span>#{h.player.rank}</span>
                    </div>
                  </div>
                </div>
              </div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { PlayerDetail, Comparator, HanchanLog, CalendarView, HallOfFame, IORMCView, metricsToRadar, PlayerSelect, accentFor, placementSegments, metricScale });
