// components-playoffs.jsx — vista de eliminatorias: cuadro y clasificados.
//
// **El cuadro es uno solo para toda la liga.** Cada división clasifica a sus
// mejores y los dos grupos se mezclan en las mismas mesas, así que esta vista
// no está scopeada por división: no hay eliminatorias de A y de B.
//
// El formato (cuántos clasifican por división, mesas y hanchan por ronda)
// viaja en `data.league.playoffs` y sale de `sync-config.json`: el mismo
// número por división que arma el cuadro pinta la zona de eliminatorias en la
// tabla.
//
// Los clasificados NO vienen en el JSON. Se derivan acá de la tabla ya
// publicada, como el resto de lo calculado: duplicarlos en el payload sería
// tener dos verdades para el mismo corte.

const PLAYOFF_DIVISIONS = ['A', 'B'];

// Respaldo si el payload viene de una corrida anterior a las eliminatorias.
// Es el mismo default que `PLAYOFF_FORMAT_DEFAULT` en scripts/sync.py.
const PLAYOFF_FORMAT_FALLBACK = {
  qualifiersPerDivision: 8,
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
  const qualifiers = raw.qualifiers || rounds[0].seats;
  return {
    qualifiers,
    perDivision: raw.qualifiersPerDivision || Math.floor(qualifiers / PLAYOFF_DIVISIONS.length),
    rounds,
  };
}

function playoffRoundLabel(id) {
  const key = 'playoffs_round_' + id;
  const label = tr(key);
  return label === key ? id : label;
}

function playoffRoundShort(id) {
  const key = 'playoffs_short_' + id;
  const label = tr(key);
  return label === key ? playoffRoundLabel(id) : label;
}

// Sesiones jugadas enteras en las DOS divisiones: el cuadro las mezcla, así
// que no está cerrado hasta que las dos terminaron. Mientras quede una, la
// vista muestra los clasificados como proyección.
function playoffSeasonProgress(data) {
  const total = data.league.sessionsTotal || 0;
  const played = Math.min(...PLAYOFF_DIVISIONS.map(division =>
    (data.divisions[division].sessions || []).filter(session => session.status === 'played').length));
  return { played, total, left: Math.max(0, total - played), settled: total > 0 && played >= total };
}

// Siembra de la primera ronda: A de arriba hacia abajo contra B de abajo hacia
// arriba. Con 8 por división y 4 mesas son dos de cada una por mesa, así que
// la mesa 1 junta a A1 y A2 con B7 y B8, la 2 a A3 y A4 con B5 y B6, y así
// hasta la 4, que enfrenta a A7 y A8 con B1 y B2: el mejor de una división
// siempre arranca contra los últimos que entraron de la otra.
//
// Devuelve null si el reparto no da un número entero por mesa; ahí la vista
// muestra los asientos pendientes en vez de inventar un emparejamiento.
function playoffSeeding(data, format) {
  const tables = format.rounds[0].tables;
  const perTable = format.perDivision / tables;
  if (!Number.isInteger(perTable) || perTable < 1) return null;
  const rosters = {};
  for (const division of PLAYOFF_DIVISIONS) {
    rosters[division] = data.divisions[division].players.slice(0, format.perDivision);
    if (rosters[division].length < format.perDivision) return null;
  }
  return Array.from({ length: tables }, (_, table) => {
    const seats = [];
    PLAYOFF_DIVISIONS.forEach((division, index) => {
      // La primera división se reparte de arriba hacia abajo y la segunda al
      // revés, para que las mesas queden parejas.
      const from = index === 0 ? table * perTable : format.perDivision - (table + 1) * perTable;
      for (let offset = 0; offset < perTable; offset++) {
        const seed = from + offset;
        seats.push({ player: rosters[division][seed], code: `${division}${seed + 1}` });
      }
    });
    return seats;
  });
}

// Asientos de una mesa que no es la primera ronda: cada uno dice de qué mesa
// de la ronda anterior sale y con qué puesto. Las mesas se reparten en orden
// —las dos primeras de cuartos alimentan la semifinal 1— así que el árbol no
// se cruza.
function playoffFeederSeats(rounds, roundIndex, table) {
  const round = rounds[roundIndex];
  const previous = rounds[roundIndex - 1];
  const ratio = previous.tables / round.tables;
  const seats = [];
  for (let offset = 0; offset < ratio; offset++) {
    const source = table * ratio + offset;
    for (let place = 1; place <= previous.advancePerTable; place++) {
      seats.push({
        label: tr('playoffs_from_seat', { place, round: playoffRoundShort(previous.id), n: source + 1 }),
        source,
      });
    }
  }
  return seats;
}

function PlayoffTrophy() {
  return (
    <svg className="playoff-cup" viewBox="0 0 64 64" width="58" height="58" aria-hidden="true">
      <defs>
        <linearGradient id="mjc-cup-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--champion-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--champion)' }} />
        </linearGradient>
      </defs>
      <path d="M18 15h-6a9 9 0 0 0 9 12" fill="none" stroke="url(#mjc-cup-gold)" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 15h6a9 9 0 0 1-9 12" fill="none" stroke="url(#mjc-cup-gold)" strokeWidth="3" strokeLinecap="round" />
      <path d="M17 9h30v13a15 15 0 0 1-30 0z" fill="url(#mjc-cup-gold)" />
      <path d="M29.5 37h5v8h-5z" fill="url(#mjc-cup-gold)" />
      <path d="M21 50h22l2.5 6h-27z" fill="url(#mjc-cup-gold)" />
      <path d="m32 14 2.3 4.8 5.2.8-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.8z" fill="var(--bg-elev)" opacity=".92" />
    </svg>
  );
}

function PlayoffSeat({ seat, onSelect }) {
  if (!seat || !seat.player) {
    return (
      <li className="pt-seat">
        <i aria-hidden="true"></i>
        <span>{(seat && seat.label) || tr('playoffs_seat_pending')}</span>
      </li>
    );
  }
  const player = seat.player;
  return (
    <li className="pt-seat filled">
      <b className={`pt-code div-${player.div}`}>{seat.code}</b>
      <span className={`avatar div-${player.div}`}>{initials(player.handle)}</span>
      <button onClick={() => onSelect && onSelect(player)}>
        <Flag nat={player.nat} size={11} />
        <em>{player.shortName}</em>
      </button>
    </li>
  );
}

function PlayoffTable({ round, number, seats, isFinal, innerRef, onSelectPlayer }) {
  return (
    <article className={`playoff-table ${isFinal ? 'final' : ''}`} ref={innerRef}>
      <div className="pt-head">
        <b>{tr('playoffs_mesa', { n: number })}</b>
        <span>{round.hanchan} 半荘</span>
      </div>
      <ul className="pt-seats">
        {[0, 1, 2, 3].map(index => (
          <PlayoffSeat key={index} seat={seats && seats[index]} onSelect={onSelectPlayer} />
        ))}
      </ul>
    </article>
  );
}

function PlayoffRound({ round, next, seatsByTable, registerTable, onSelectPlayer }) {
  const advancing = round.tables * round.advancePerTable;
  const isFinal = !next;
  return (
    <section className={`playoff-round ${isFinal ? 'final' : ''}`}>
      {isFinal && <span className="playoff-round-mark" aria-hidden="true">決勝</span>}
      <header className="playoff-round-head">
        <span className="pr-jp">{PLAYOFF_ROUND_JP[round.id] || '決勝'}</span>
        <h3>{playoffRoundLabel(round.id)}</h3>
        <p className="pr-meta">
          <b>{round.seats}</b> {tr('playoffs_round_enter')}
          <span>{round.tables > 1 ? tr('playoffs_tables_n', { n: round.tables }) : tr('playoffs_table_one')}</span>
          <span>{tr('playoffs_hanchan_each', { n: round.hanchan })}</span>
        </p>
      </header>
      <div className="playoff-tables">
        {Array.from({ length: round.tables }, (_, index) => (
          <PlayoffTable key={index} round={round} number={index + 1} isFinal={isFinal}
            seats={seatsByTable && seatsByTable[index]} onSelectPlayer={onSelectPlayer}
            innerRef={node => registerTable(index, node)} />
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

// El árbol: una línea por cada mesa que alimenta a otra, medida sobre las
// posiciones reales de las tarjetas. Se dibuja en JS y no con CSS porque las
// mesas no están en una grilla regular —cada ronda tiene su propia cabecera y
// su propia cantidad de mesas— y las alturas cambian con el idioma, el tema y
// el ancho de la ventana.
function PlayoffBracket({ rounds, seeding, onSelectPlayer }) {
  const wrapRef = React.useRef(null);
  const trophyRef = React.useRef(null);
  const tables = React.useRef({});
  const [links, setLinks] = React.useState({ paths: [], width: 0, height: 0 });

  const register = React.useCallback((roundIndex, tableIndex, node) => {
    tables.current[`${roundIndex}-${tableIndex}`] = node;
  }, []);

  React.useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = () => {
      const base = wrap.getBoundingClientRect();
      const center = node => {
        const box = node.getBoundingClientRect();
        return { left: box.left - base.left, right: box.right - base.left, y: box.top + box.height / 2 - base.top };
      };
      const paths = [];
      const elbow = (from, to) => {
        const mid = from.right + (to.left - from.right) / 2;
        return `M${from.right.toFixed(1)} ${from.y.toFixed(1)} H${mid.toFixed(1)} V${to.y.toFixed(1)} H${to.left.toFixed(1)}`;
      };
      rounds.forEach((round, roundIndex) => {
        if (roundIndex === 0) return;
        const ratio = rounds[roundIndex - 1].tables / round.tables;
        for (let table = 0; table < round.tables; table++) {
          const target = tables.current[`${roundIndex}-${table}`];
          if (!target) continue;
          for (let offset = 0; offset < ratio; offset++) {
            const source = tables.current[`${roundIndex - 1}-${table * ratio + offset}`];
            if (source) paths.push(elbow(center(source), center(target)));
          }
        }
      });
      const last = tables.current[`${rounds.length - 1}-0`];
      if (last && trophyRef.current) paths.push(elbow(center(last), center(trophyRef.current)));
      setLinks({ paths, width: base.width, height: base.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    Object.values(tables.current).forEach(node => node && observer.observe(node));
    return () => observer.disconnect();
  }, [rounds, seeding]);

  return (
    <div className="playoff-bracket" ref={wrapRef}>
      {links.width > 0 && (
        <svg className="playoff-links" width={links.width} height={links.height} aria-hidden="true">
          {links.paths.map((path, index) => (
            <path key={index} d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
          ))}
        </svg>
      )}
      {rounds.map((round, index) => (
        <React.Fragment key={round.id}>
          <PlayoffRound round={round} next={rounds[index + 1]} onSelectPlayer={onSelectPlayer}
            seatsByTable={index === 0
              ? seeding
              : Array.from({ length: round.tables }, (_, table) => playoffFeederSeats(rounds, index, table))}
            registerTable={(table, node) => register(index, table, node)} />
          {index < rounds.length - 1 && (
            <div className="playoff-arrow" aria-hidden="true">
              <b>{round.tables * round.advancePerTable}</b>
              <i></i>
            </div>
          )}
        </React.Fragment>
      ))}
      <div className="playoff-trophy" ref={trophyRef}>
        <PlayoffTrophy />
        <i>優勝</i>
        <b>{tr('playoffs_champion_of', { league: tr('app_title') })}</b>
        <span>{tr('playoffs_final_note', { n: rounds[rounds.length - 1].hanchan })}</span>
      </div>
    </div>
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

// Un grupo por división: su cuota de clasificados, su corte y su burbuja. Los
// puntos de A y B no son comparables entre sí (uma y akadora distintos), por
// eso la vista nunca los mezcla en una sola lista ordenada.
function PlayoffDivisionGroup({ data, division, perDivision, onSelectPlayer }) {
  const players = data.divisions[division].players;
  const seeds = players.slice(0, perDivision);
  const bubble = players.slice(perDivision, perDivision + 2);
  const lastIn = seeds[seeds.length - 1];
  const firstOut = players[perDivision];
  const gap = lastIn && firstOut ? Math.round((lastIn.points - firstOut.points) * 10) / 10 : null;

  return (
    <section className={`playoff-group div-${division}`}>
      <header className="playoff-group-head">
        <span className={`div-chip ${division}`}>DIV {division}</span>
        <h3>{tr('playoffs_group_title', { d: division, n: perDivision })}</h3>
        <p>
          {lastIn && <span>{tr('playoffs_group_cut', { pts: fmtPts(lastIn.points) })}</span>}
          {gap !== null && <span>{tr('playoffs_group_gap', { gap: gap.toFixed(1), n: perDivision + 1 })}</span>}
        </p>
      </header>
      {seeds.length < perDivision
        ? <div className="calendar-empty"><strong>{tr('playoffs_not_enough', { n: perDivision })}</strong></div>
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
                    <PlayoffSeed key={player.id} player={player} seed={perDivision + index + 1} onSelect={onSelectPlayer} muted />
                  ))}
                </div>
                <small>{tr('playoffs_bubble')}</small>
              </div>
            )}
          </React.Fragment>
        )}
    </section>
  );
}

function PlayoffsView({ data, onSelectPlayer }) {
  const format = playoffFormat(data);
  const rounds = format.rounds;
  const progress = playoffSeasonProgress(data);
  const finalRound = rounds[rounds.length - 1];
  const totalTables = rounds.reduce((total, round) => total + round.tables, 0);
  const seeding = React.useMemo(() => playoffSeeding(data, format), [data, format.perDivision, rounds]);

  return (
    <div className="tab-panel playoffs-panel">
      <div className="section-head">
        <div className="h-left">
          <span className="num">07 / {tr('playoffs_kicker')}</span>
          <h1>{tr('playoffs_title')}</h1>
          <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>決勝</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'right' }}>
          {tr('playoffs_subtitle', { per: format.perDivision, n: format.qualifiers, h: rounds[0].hanchan, f: finalRound.hanchan })}
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
          <div><b>{format.qualifiers}</b><span>{tr('playoffs_qualified_title')}</span></div>
          <div><b>{format.perDivision}</b><span>{tr('playoffs_per_division')}</span></div>
          <div><b>{totalTables}</b><span>{tr('playoffs_total_tables')}</span></div>
        </div>
      </section>

      <section className="playoff-format">
        <div className="calendar-panel-head">
          <div>
            <span className="block-label">{tr('playoffs_format_title')}</span>
            <h2>{rounds.map(round => playoffRoundLabel(round.id)).join(' · ')}</h2>
          </div>
          <span>{tr('playoffs_mixed_note')}</span>
        </div>
        <p className="playoff-format-note">{seeding ? tr('playoffs_seeding_note') : tr('playoffs_format_note')}</p>
        <PlayoffBracket rounds={rounds} seeding={seeding} onSelectPlayer={onSelectPlayer} />
        <p className="playoff-empty-note">{tr('playoffs_no_results')}</p>
      </section>

      <section className="playoff-qualified">
        <div className="calendar-panel-head">
          <div>
            <span className="block-label">{tr('playoffs_regular_phase')}</span>
            <h2>{tr('playoffs_qualified_title')}</h2>
          </div>
          <span>{tr('playoffs_qualified_note', { per: format.perDivision })}</span>
        </div>
        <div className="playoff-groups">
          {PLAYOFF_DIVISIONS.map(division => (
            <PlayoffDivisionGroup key={division} data={data} division={division}
              perDivision={format.perDivision} onSelectPlayer={onSelectPlayer} />
          ))}
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { PlayoffsView, playoffFormat, playoffSeasonProgress, playoffSeeding });
