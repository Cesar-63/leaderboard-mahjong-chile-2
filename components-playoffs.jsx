// components-playoffs.jsx — vista de eliminatorias: cuadro y clasificados.
//
// El formato (cuántos clasifican, mesas y hanchan por ronda) viaja en
// `data.league.playoffs` y sale de `sync-config.json`: el mismo número que
// dibuja el cuadro pinta la zona de eliminatorias en la tabla.
//
// Los clasificados NO vienen en el JSON. Se derivan acá de la tabla ya
// publicada, como el resto de lo calculado: duplicarlos en el payload sería
// tener dos verdades para el mismo corte.

// Respaldo si el payload viene de una corrida anterior a las eliminatorias.
// Es el mismo default que `PLAYOFF_FORMAT_DEFAULT` en scripts/sync.py.
const PLAYOFF_FORMAT_FALLBACK = {
  qualifiers: 16,
  rounds: [
    { id: 'quarters', tables: 4, hanchan: 2, advancePerTable: 2, seats: 16 },
    { id: 'semis', tables: 2, hanchan: 2, advancePerTable: 2, seats: 8 },
    { id: 'final', tables: 1, hanchan: 3, advancePerTable: 1, seats: 4 },
  ],
};

const PLAYOFF_ROUND_JP = { quarters: '準々決勝', semis: '準決勝', final: '決勝' };

function playoffFormat(data) {
  const raw = (data.league && data.league.playoffs) || PLAYOFF_FORMAT_FALLBACK;
  const source = raw.rounds && raw.rounds.length ? raw.rounds : PLAYOFF_FORMAT_FALLBACK.rounds;
  const rounds = source.map(round => ({ ...round, seats: round.seats || round.tables * 4 }));
  return { qualifiers: raw.qualifiers || rounds[0].seats, rounds };
}

function playoffRoundLabel(id) {
  const key = 'playoffs_round_' + id;
  const label = tr(key);
  return label === key ? id : label;
}

// Sesiones de la división que ya están jugadas enteras. Mientras quede una,
// el cuadro es proyección y la vista lo dice en vez de mostrarlo como cerrado.
function playoffSeasonProgress(data, div) {
  const sessions = data.divisions[div].sessions || [];
  const played = sessions.filter(session => session.status === 'played').length;
  const total = data.league.sessionsTotal || sessions.length;
  return { played, total, left: Math.max(0, total - played), settled: played >= total && total > 0 };
}

function PlayoffTable({ round, number }) {
  return (
    <article className="playoff-table">
      <div className="pt-head">
        <b>{tr('playoffs_mesa', { n: number })}</b>
        <span>{round.hanchan} 半荘</span>
      </div>
      <ul className="pt-seats">
        {[0, 1, 2, 3].map(seat => (
          <li key={seat}><i aria-hidden="true"></i><span>{tr('playoffs_seat_pending')}</span></li>
        ))}
      </ul>
    </article>
  );
}

function PlayoffRound({ round, next, div }) {
  const advancing = round.tables * round.advancePerTable;
  return (
    <section className={`playoff-round div-${div}`}>
      <header className="playoff-round-head">
        <span className="pr-jp">{PLAYOFF_ROUND_JP[round.id] || '決勝'}</span>
        <h3>{playoffRoundLabel(round.id)}<small className="pr-draw">{tr('playoffs_draw_pending')}</small></h3>
        <p className="pr-meta">
          <b>{round.seats}</b> {tr('playoffs_round_enter')}
          <span>{round.tables > 1 ? tr('playoffs_tables_n', { n: round.tables }) : tr('playoffs_table_one')}</span>
          <span>{tr('playoffs_hanchan_each', { n: round.hanchan })}</span>
        </p>
      </header>
      <div className="playoff-tables">
        {Array.from({ length: round.tables }, (_, index) => (
          <PlayoffTable key={index} round={round} number={index + 1} />
        ))}
      </div>
      <footer className="playoff-round-foot">
        {next
          ? tr('playoffs_advance_to', { n: advancing, round: playoffRoundLabel(next.id) })
          : tr('playoffs_champion')}
      </footer>
    </section>
  );
}

function PlayoffSeed({ player, seed, onSelect, muted }) {
  const country = COUNTRIES[player.nat] || COUNTRIES.OT;
  return (
    <button
      className={`playoff-seed ${muted ? 'muted' : ''}`}
      style={{ '--nat': country.accent }}
      onClick={() => onSelect && onSelect(player)}
    >
      <span className="ps-seed">{seed}</span>
      <span className={`avatar div-${player.div} nat-ring`}>{initials(player.handle)}</span>
      <span className="ps-id">
        <b>{player.shortName}</b>
        <small><Flag nat={player.nat} size={12} /><span>{country.name}</span></small>
      </span>
      <span className="ps-figures">
        <b className={player.points >= 0 ? 'pos' : 'neg'}>{fmtPts(player.points)}</b>
        <small>{player.games} {tr('th_pj')}</small>
      </span>
    </button>
  );
}

function PlayoffsView({ data, div = 'A', onSelectPlayer }) {
  const format = playoffFormat(data);
  const rounds = format.rounds;
  const cut = format.qualifiers;
  const players = data.divisions[div].players;
  const progress = playoffSeasonProgress(data, div);
  const seeds = players.slice(0, cut);
  const bubble = players.slice(cut, cut + 3);
  const lastIn = seeds[seeds.length - 1];
  const firstOut = players[cut];
  const gap = lastIn && firstOut ? Math.round((lastIn.points - firstOut.points) * 10) / 10 : null;
  const uma = (data.league.rules[div].uma || []).map(v => (v >= 0 ? `+${v}` : `−${Math.abs(v)}`)).join(' / ');
  const finalRound = rounds[rounds.length - 1];

  return (
    <div className="tab-panel" style={{ '--playoff-accent': accentFor(div) }}>
      <div className="section-head">
        <div className="h-left">
          <span className="num">07 / {tr('playoffs_kicker')}</span>
          <h1>{tr('playoffs_title', { div })}</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>決勝</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'right' }}>
          {tr('playoffs_subtitle', { n: cut, h: rounds[0].hanchan, f: finalRound.hanchan })}
        </div>
      </div>

      <section className={`playoff-status ${progress.settled ? 'settled' : 'provisional'}`}>
        <div className="pst-copy">
          <span className="pst-badge">{progress.settled ? tr('playoffs_settled') : tr('playoffs_provisional')}</span>
          <p>{progress.settled
            ? tr('playoffs_settled_note')
            : progress.left === 1 ? tr('playoffs_provisional_note_one') : tr('playoffs_provisional_note', { n: progress.left })}</p>
        </div>
        <div className="pst-figures">
          <div><b>{cut}</b><span>{tr('playoffs_qualified_title')}</span></div>
          {lastIn && <div><b className={lastIn.points >= 0 ? 'pos' : 'neg'}>{fmtPts(lastIn.points)}</b><span>{tr('playoffs_cut_points')}</span></div>}
          {gap !== null && <div><b>{gap.toFixed(1)}</b><span>{tr('playoffs_gap', { n: cut + 1 })}</span></div>}
        </div>
      </section>

      <section className="playoff-format">
        <div className="calendar-panel-head">
          <div>
            <span className="block-label">{tr('playoffs_format_title')}</span>
            <h2>{rounds.map(round => playoffRoundLabel(round.id)).join(' · ')}</h2>
          </div>
          <span>{tr('playoffs_uma_note', { uma })}</span>
        </div>
        <p className="playoff-format-note">{tr('playoffs_format_note')}</p>
        <div className="playoff-bracket">
          {rounds.map((round, index) => (
            <React.Fragment key={round.id}>
              <PlayoffRound round={round} next={rounds[index + 1]} div={div} />
              {index < rounds.length - 1 && (
                <div className="playoff-arrow" aria-hidden="true">
                  <b>{round.tables * round.advancePerTable}</b>
                  <i></i>
                </div>
              )}
            </React.Fragment>
          ))}
          <div className="playoff-trophy">
            <i>優勝</i>
            <span>{tr('playoffs_champion')}</span>
          </div>
        </div>
        <p className="playoff-empty-note">{tr('playoffs_no_results')}</p>
      </section>

      <section className="playoff-qualified">
        <div className="calendar-panel-head">
          <div>
            <span className="block-label">{tr('playoffs_regular_phase')}</span>
            <h2>{tr('playoffs_qualified_title')}</h2>
          </div>
          <span>{tr('playoffs_qualified_note', { n: cut })}</span>
        </div>
        {seeds.length < cut
          ? <div className="calendar-empty"><strong>{tr('playoffs_not_enough', { n: cut })}</strong></div>
          : (
            <React.Fragment>
              <div className="playoff-seeds">
                {seeds.map((player, index) => (
                  <PlayoffSeed key={player.id} player={player} seed={index + 1} onSelect={onSelectPlayer} />
                ))}
              </div>
              {bubble.length > 0 && (
                <div className="playoff-bubble">
                  <span className="playoff-cut-line">{tr('playoffs_cut')}</span>
                  <div className="playoff-seeds">
                    {bubble.map((player, index) => (
                      <PlayoffSeed key={player.id} player={player} seed={cut + index + 1} onSelect={onSelectPlayer} muted />
                    ))}
                  </div>
                  <small>{tr('playoffs_bubble')}</small>
                </div>
              )}
            </React.Fragment>
          )}
      </section>
    </div>
  );
}

Object.assign(window, { PlayoffsView, playoffFormat, playoffSeasonProgress });
