// components-standings.jsx — standings table, hover preview, side rail

const { useState, useEffect, useRef, useMemo } = React;

function fmtPts(n) { return (n >= 0 ? '+' : '') + n.toFixed(1); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function fmtAdvanced(player, key, suffix = '', decimals = 1) {
  return player.statsSample > 0 ? player[key].toFixed(decimals) + suffix : '—';
}
// Dos primeras letras para el círculo del avatar (el handle completo se desborda)
function initials(h) { return (h || '').slice(0, 2); }

function HoverPreview({ player, anchor }) {
  if (!player || !anchor) return null;
  return (
    <div className="hover-preview visible" style={{ left: anchor.x + 18, top: Math.max(80, anchor.y - 80) }}>
      <div className="hp-head">
        <div className={`avatar div-${player.div}`}>{initials(player.handle)}</div>
        <div>
          <div className="hp-name">{player.shortName}{player.iormc === 'qualified' && <span className="iormc-star">★</span>}</div>
          <div className="hp-handle nat-line"><Flag nat={player.nat} size={14} /><span>{COUNTRIES[player.nat].name}</span><span className="dot-sep">·</span><span>Div {player.div} #{player.rank}</span></div>
        </div>
      </div>
      <div className="hp-stats">
        <div className="hp-stat"><div className="v">{fmtPts(player.points)}</div><div className="l">{tr('points')}</div></div>
        <div className="hp-stat"><div className="v">{player.avgRank.toFixed(2)}</div><div className="l">{tr('avg_rank')}</div></div>
        <div className="hp-stat"><div className="v">{fmtAdvanced(player, 'winRate', '%')}</div><div className="l">{tr('win_rate')}</div></div>
        <div className="hp-stat"><div className="v">{fmtAdvanced(player, 'dealInRate', '%')}</div><div className="l">{tr('deal_in')}</div></div>
        <div className="hp-stat"><div className="v">{fmtAdvanced(player, 'riichiRate', '%')}</div><div className="l">{tr('riichi')}</div></div>
        <div className="hp-stat"><div className="v">{fmtAdvanced(player, 'openRate', '%')}</div><div className="l">{tr('open')}</div></div>
      </div>
      <div style={{ marginTop: 14, height: 32 }}>
        <Sparkline values={player.cum} width={248} height={32} color={player.div === 'B' ? 'var(--accent-2)' : 'var(--accent)'} />
      </div>
    </div>
  );
}

function StandingsView({ data, div, layout, onSelectPlayer }) {
  const [hover, setHover] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [sortBy, setSortBy] = useState('rank');
  const [natFilter, setNatFilter] = useState(null);
  const divData = data.divisions[div];

  const natCounts = useMemo(() => {
    const m = {};
    divData.players.forEach(p => { m[p.nat] = (m[p.nat] || 0) + 1; });
    return m;
  }, [divData.players]);

  const sorted = useMemo(() => {
    let arr = [...divData.players];
    if (natFilter) arr = arr.filter(p => p.nat === natFilter);
    if (sortBy === 'win') return arr.sort((a, b) => b.winRate - a.winRate);
    if (sortBy === 'dealin') return arr.sort((a, b) => a.dealInRate - b.dealInRate);
    if (sortBy === 'avgRank') return arr.sort((a, b) => a.avgRank - b.avgRank);
    return arr.sort((a, b) => a.rank - b.rank);
  }, [divData.players, sortBy, natFilter]);

  const wrapClass = `standings-wrap ${layout === 'stacked' ? 'layout-stacked' : layout === 'split' ? 'layout-split' : ''}`;
  const th = (key, label, w) => (
    <th style={{ width: w, cursor: 'pointer' }} className={sortBy === key ? 'sorted' : ''} onClick={() => setSortBy(key)}>{label}</th>
  );

  return (
    <div className={wrapClass}>
      <div>
        <div className="nat-filter">
          <button className={`nf-btn ${!natFilter ? 'active' : ''}`} onClick={() => setNatFilter(null)}>
            <span className="nf-name">{tr('all')}</span><span className="nf-n">{divData.players.length}</span>
          </button>
          {COUNTRY_ORDER.filter(c => natCounts[c]).map(c => (
            <button key={c} className={`nf-btn ${natFilter === c ? 'active' : ''}`}
              style={{ '--nat': COUNTRIES[c].accent }} onClick={() => setNatFilter(natFilter === c ? null : c)}>
              <Flag nat={c} size={17} />
              <span className="nf-name">{COUNTRIES[c].name}</span>
              <span className="nf-n">{natCounts[c]}</span>
            </button>
          ))}
        </div>

        <div className={`standings-card div-${div}`}>
          <table className="standings-table">
            <thead>
              <tr>
                <th className="left" style={{ width: 56 }}>#</th>
                <th className="left">{tr('th_player')} <span style={{ fontFamily: 'var(--font-jp)', opacity: 0.5 }}>選手</span></th>
                <th style={{ width: 56 }} title={tr('th_pj')}>{tr('th_pj')}</th>
                {th('rank', tr('th_points'), 88)}
                {th('avgRank', tr('th_avg'), 74)}
                {th('win', tr('th_win'), 74)}
                {th('dealin', tr('th_dealin'), 82)}
                <th style={{ width: 74 }}>{tr('th_riichi')}</th>
                <th style={{ width: 74 }}>{tr('th_open')}</th>
                <th style={{ width: 96 }}>{tr('th_form')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.id}
                    className={`standings-row ${p.rank <= 3 ? 'top' + p.rank : ''} ${p.zone ? 'zone-' + p.zone : ''} ${p.iormc === 'qualified' ? 'iormc-q' : ''}`}
                    style={{ animationDelay: `${i * 16}ms`, cursor: 'pointer', '--nat': COUNTRIES[p.nat].accent }}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setHover(p); setAnchor({ x: r.right, y: r.top });
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelectPlayer(p)}
                >
                  <td className="left"><span className="rank-cell"><span className="rank-num">{p.rank}</span></span></td>
                  <td className="left">
                    <div className="player-cell">
                      <div className={`avatar div-${p.div} nat-ring`}>{initials(p.handle)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="player-name">
                          {p.shortName}
                          {p.iormc === 'qualified' && <span className="iormc-star" title="Clasificado al IORMC">★</span>}
                        </div>
                        <div className="player-handle nat-line">
                          <Flag nat={p.nat} size={15} />
                          <span>{COUNTRIES[p.nat].name}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{p.games}</td>
                  <td><span className={`points-big ${p.points >= 0 ? 'pos' : 'neg'}`}>{fmtPts(p.points)}</span></td>
                  <td>{p.avgRank.toFixed(2)}</td>
                  <td>{fmtAdvanced(p, 'winRate')}</td>
                  <td>{fmtAdvanced(p, 'dealInRate')}</td>
                  <td>{fmtAdvanced(p, 'riichiRate')}</td>
                  <td>{fmtAdvanced(p, 'openRate')}</td>
                  <td><Sparkline values={p.cum} color={p.div === 'B' ? 'var(--accent-2)' : 'var(--accent)'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="zone-key">
            {div === 'A'
              ? <React.Fragment><span className="zk title">{tr('zone_title_playoff')}</span><span className="zk iormc">{tr('zone_iormc')}</span><span className="zk releg">{tr('zone_relegation')}</span></React.Fragment>
              : <React.Fragment><span className="zk promo">{tr('zone_promotion')}</span><span className="zk">{tr('zone_bottom')}</span></React.Fragment>}
          </div>
        </div>
      </div>

      {layout !== 'stacked' && <SideRail data={data} div={div} />}
      <HoverPreview player={hover} anchor={anchor} />
    </div>
  );
}

function SideRail({ data, div }) {
  const divData = data.divisions[div];
  const next = data.calendar.find(c => c.div === div) || data.calendar[0];
  const recent = [...divData.matches].slice(-3).reverse();
  const L = data.league;
  const pct = Math.round((L.sessionsPlayed / L.sessionsTotal) * 100);

  const MONTHS = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
  const toDate = (s) => {
    if (!s || s === 'Por definir') return null;
    const parts = s.split(' ');
    const day = parseInt(parts[0], 10), mon = MONTHS[parts[1]];
    if (isNaN(day) || mon === undefined) return null;
    const d = new Date(new Date().getFullYear(), mon, day);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const nextDate = toDate(next.date);
  const past = nextDate && nextDate < today;
  const sessNum = parseInt((next.round || '').replace(/[^0-9]/g, ''), 10);
  const sess = divData.sessions.find(s => s.n === sessNum);
  const sessionDone = sess && sess.status === 'played';
  const seasonDone = L.sessionsPlayed >= L.sessionsTotal;
  const state = (seasonDone || sessionDone) ? 'waiting' : (past || !nextDate ? 'unscheduled' : 'ready');

  return (
    <div className="side-rail">
      <div className="rail-card">
        <div className="rc-head">
          <h3>{tr('next_match')} <span style={{ fontFamily: 'var(--font-jp)', opacity: 0.5 }}>次回</span></h3>
          <span className={`div-chip ${div}`}>DIV {div}</span>
        </div>
        {state === 'unscheduled' && (
          <div className="next-empty">{tr('next_unscheduled')}</div>
        )}
        {state === 'waiting' && (
          <div className="next-empty">{tr('next_waiting')}</div>
        )}
        {state === 'ready' && (
          <div className="next-match">
            <div className="date-block">
              <div className="day-num">{next.date.split(' ')[0]}</div>
              <div className="day-mon">{next.date.split(' ')[1]}</div>
            </div>
            <div>
              <div className="label">{next.round}</div>
              <div className="meta-line">{next.mesa}</div>
              <div className="meta-line">{next.time} · {next.day} · {L.hanchanPerSession} {tr('hanchan')}</div>
            </div>
          </div>
        )}
      </div>

      <div className="rail-card">
        <div className="rc-head">
          <h3>{tr('last_hanchan')} <span style={{ fontFamily: 'var(--font-jp)', opacity: 0.5 }}>結果</span></h3>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>DIV {div}</span>
        </div>
        <div className="recent-list">
          {recent.map(m => (
            <div className="recent-row" key={m.id}>
              <div>
                <div className="code">{m.sessionCode}·H{m.hanchan}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>M{m.table}</div>
              </div>
              <div className="four">
                {m.players.map((pl, i) => (
                  <div key={pl.id} className={`pp ${i === 0 ? 'first' : ''}`}>
                    <Flag nat={pl.nat} size={14} />
                    <div style={{ fontWeight: 700 }}>{fmtPts(pl.delta)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rail-card">
        <div className="rc-head">
          <h3>{tr('season')} <span style={{ fontFamily: 'var(--font-jp)', opacity: 0.5 }}>リーグ</span></h3>
        </div>
        <div className="mini-grid">
          <div>
            <div className="ml">{tr('sessions_lbl')}</div>
            <div className="mv">{L.sessionsPlayed}<span className="mf">/{L.sessionsTotal}</span></div>
          </div>
          <div>
            <div className="ml">{tr('hanchan_div', { div })}</div>
            <div className="mv">{divData.matches.length}</div>
          </div>
          <div>
            <div className="ml">{tr('players_lbl')}</div>
            <div className="mv">{L.playersPerDiv}<span className="mf">×2</span></div>
          </div>
          <div>
            <div className="ml">{tr('per_session')}</div>
            <div className="mv">{L.hanchanPerSession}<span className="mf"> {tr('hanchan')}</span></div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="prog-track"><div className={`prog-fill div-${div}`} style={{ width: pct + '%' }}></div></div>
          <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-soft)' }}>
            {tr('season_progress', { played: L.sessionsPlayed, total: L.sessionsTotal, pct })}
          </div>
        </div>
      </div>

      <div className="rail-card">
        <div className="rc-head">
          <h3>{tr('iormc_selection')} <span style={{ fontFamily: 'var(--font-jp)', opacity: .5 }}>代表</span></h3>
          <Flag nat="CL" size={18} />
        </div>
        <div className="iormc-mini">
          {data.iormc.qualified.map((p, i) => (
            <div className="im-row" key={p.id}>
              <span className="im-slot">{i + 1}</span>
              <span className="im-nm">{p.shortName}</span>
              <span className="im-pt">{fmtPts(p.points)}</span>
            </div>
          ))}
          <div className="im-cut">{tr('cut_margin', { cut: fmtPts(data.iormc.cutPoints), gap: data.iormc.gap.toFixed(1) })}</div>
        </div>
      </div>

      <div className="rail-card">
        <div className="rc-head">
          <h3>{tr('other_division')} <span style={{ fontFamily: 'var(--font-jp)', opacity: 0.5 }}>他部門</span></h3>
        </div>
        <div className="recent-list">
          {data.divisions[div === 'A' ? 'B' : 'A'].players.slice(0, 4).map(p => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '22px 20px 1fr auto', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, background: 'var(--bg-sunk)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>{p.rank}</span>
              <Flag nat={p.nat} size={17} />
              <span style={{ fontSize: 12 }}>{p.shortName}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: p.points >= 0 ? 'var(--good)' : 'var(--bad)' }}>{fmtPts(p.points)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { StandingsView, HoverPreview, SideRail, fmtPts, clamp01 });
