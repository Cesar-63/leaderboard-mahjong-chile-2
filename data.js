// Mock data for Liga Mahjong Chile — two divisions (A / B), Latin American rosters
// Season: 24 players per division, 7 sessions × 2 hanchan = 14 hanchan/player. 6 sessions played.
// Nationalities: Chile and Uruguay most represented. Division A holds exactly 12 Chileans;
// their top 4 qualify to represent Chile at the IORMC.

(function () {
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const SESSIONS_TOTAL = 7, SESSIONS_PLAYED = 6, HANCHAN_PER_SESSION = 2;
  const UMA = [30, 10, -10, -30];
  const IORMC_SLOTS = 4;

  const YAKU = ['Riichi', 'Pinfu', 'Tanyao', 'Yakuhai', 'Iipeiko', 'Toitoi', 'Sanshoku', 'Ittsu', 'Honitsu', 'Chiitoitsu', 'Mentsumo', 'Chanta'];

  const ARCHES = [
    { id: 'aggro', dealIn: [13, 18], win: [22, 28], riichi: [22, 28], open: [28, 42] },
    { id: 'def',   dealIn: [7, 10],  win: [16, 21], riichi: [14, 19], open: [12, 22] },
    { id: 'bal',   dealIn: [10, 13], win: [19, 24], riichi: [17, 22], open: [22, 32] },
    { id: 'speed', dealIn: [12, 15], win: [23, 28], riichi: [24, 30], open: [35, 48] },
    { id: 'grind', dealIn: [9, 12],  win: [20, 24], riichi: [18, 23], open: [20, 28] },
  ];

  const SESSION_DATES = [
    { code: 'S1', date: '15 mar', day: 'sáb' }, { code: 'S2', date: '29 mar', day: 'sáb' },
    { code: 'S3', date: '12 abr', day: 'sáb' }, { code: 'S4', date: '26 abr', day: 'sáb' },
    { code: 'S5', date: '10 may', day: 'sáb' }, { code: 'S6', date: '24 may', day: 'sáb' },
    { code: 'S7', date: '07 jun', day: 'sáb' },
  ];

  // Nationality quotas per division. Div A must hold exactly 12 Chileans.
  const NAT_QUOTA = {
    A: { CL: 12, UY: 5, AR: 2, PE: 2, BR: 2, MX: 1 },
    B: { CL: 7,  UY: 6, AR: 3, PE: 3, BR: 3, MX: 2 },
  };

  function buildDivision(key, seed, skillSpread) {
    const rand = mulberry32(seed);
    const r = (a, b) => a + (b - a) * rand();
    const ri = (a, b) => Math.floor(r(a, b + 1));

    // nationality pool, shuffled
    const pool = [];
    Object.entries(NAT_QUOTA[key]).forEach(([code, n]) => { for (let i = 0; i < n; i++) pool.push(code); });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const players = [];
    for (let i = 1; i <= 24; i++) {
      const arch = ARCHES[ri(0, ARCHES.length - 1)];
      const n = String(i).padStart(2, '0');
      players.push({
        id: `${key}${n}`, div: key, num: n,
        name: `${key} · Player ${n}`, shortName: `Player ${n}`, handle: `${key}${n}`,
        nat: pool[i - 1],
        arch: arch.id,
        archRates: arch,
        skill: r(-skillSpread, skillSpread),
        games: 0, points: 0, history: [], cum: [], counts: [0, 0, 0, 0],
      });
    }

    const sessions = [], matches = [];
    let matchNo = 1;
    for (let s = 0; s < SESSIONS_PLAYED; s++) {
      const meta = SESSION_DATES[s];
      const seating = [...players].sort(() => rand() - 0.5);
      const tables = [];
      for (let t = 0; t < 6; t++) tables.push(seating.slice(t * 4, t * 4 + 4));
      let count = 0;
      for (let h = 0; h < HANCHAN_PER_SESSION; h++) {
        tables.forEach((table, tIdx) => {
          // Seat luck dominates skill, as it does in real riichi: the noise (±52)
          // is far wider than the skill spread (±7-9), so every player collects
          // all four placements over a season instead of running away with 1sts.
          const rolled = table.map(p => ({ p, roll: p.skill + r(-52, 52) })).sort((a, b) => b.roll - a.roll);
          const results = rolled.map((x, place) => {
            const delta = Math.round((UMA[place] + r(-9, 9)) * 10) / 10;
            x.p.games += 1;
            x.p.points = Math.round((x.p.points + delta) * 10) / 10;
            x.p.history.push(delta);
            x.p.counts[place] += 1;
            return { id: x.p.id, name: x.p.shortName, handle: x.p.handle, nat: x.p.nat, delta, place: place + 1 };
          });
          matches.push({
            id: `${key}-${matchNo}`, code: `MJ${key}-26-${String(matchNo).padStart(3, '0')}`,
            div: key, session: s + 1, sessionCode: meta.code, hanchan: h + 1,
            date: meta.date, weekday: meta.day, table: tIdx + 1, players: results,
          });
          matchNo++; count++;
        });
      }
      sessions.push({ n: s + 1, code: meta.code, date: meta.date, weekday: meta.day, div: key, matches: count });
    }

    players.forEach(p => {
      let acc = 0;
      p.cum = p.history.map(d => { acc += d; return Math.round(acc * 10) / 10; });
      const g = p.games || 1;
      p.placements = {
        p1: Math.round((p.counts[0] / g) * 100) / 100, p2: Math.round((p.counts[1] / g) * 100) / 100,
        p3: Math.round((p.counts[2] / g) * 100) / 100, p4: Math.round((p.counts[3] / g) * 100) / 100,
      };
      p.avgRank = Math.round(((p.counts[0] + p.counts[1] * 2 + p.counts[2] * 3 + p.counts[3] * 4) / g) * 100) / 100;
      p.avgPoints = Math.round((p.points / g) * 10) / 10;
      const last = p.cum[p.cum.length - 1] ?? 0;
      const prior = p.cum.length > 4 ? p.cum[p.cum.length - 5] : 0;
      p.streak = Math.round((last - prior) * 10) / 10;

      // Rate stats: archetype sets the STYLE (how often they open, how often they
      // riichi); results nudge EFFICIENCY (win rate up, deal-in down) so a strong
      // placement record never reads worse than a mid-table one.
      const a = p.archRates;
      const perf = 2.5 - p.avgRank;
      const mid = (lo, hi) => (lo + hi) / 2;
      p.winRate = Math.round(Math.max(14, mid(a.win[0], a.win[1]) + perf * 4.5 + r(-1.2, 1.2)) * 10) / 10;
      p.dealInRate = Math.round(Math.max(6, mid(a.dealIn[0], a.dealIn[1]) - perf * 3.2 + r(-0.9, 0.9)) * 10) / 10;
      p.riichiRate = Math.round(r(a.riichi[0], a.riichi[1]) * 10) / 10;
      p.openRate = Math.round(r(a.open[0], a.open[1]) * 10) / 10;
      delete p.archRates;

      const shuffled = [...YAKU].sort(() => rand() - 0.5);
      p.topYaku = shuffled.slice(0, 5).map((y, idx) => ({
        name: y, count: Math.max(1, Math.round(p.games * r(0.25, 0.9) / (idx * 0.45 + 1))),
      })).sort((a, b) => b.count - a.count);
    });

    players.sort((a, b) => b.points - a.points);
    players.forEach((p, i) => {
      p.rank = i + 1;
      p.zone = key === 'A'
        ? (i >= 20 ? 'relegation' : i < 4 ? 'title' : null)
        : (i < 4 ? 'promotion' : i >= 20 ? 'bottom' : null);
    });

    return { key, players, matches, sessions };
  }

  const divA = buildDivision('A', 1337, 9);
  const divB = buildDivision('B', 4402, 7);

  // ── IORMC: top 4 Chileans of Division A represent Chile ──
  const chileA = divA.players.filter(p => p.nat === 'CL');   // already rank-sorted
  chileA.forEach((p, i) => {
    p.natRank = i + 1;
    p.iormc = i < IORMC_SLOTS ? 'qualified' : (i < IORMC_SLOTS + 3 ? 'contention' : 'out');
  });
  const cut = chileA[IORMC_SLOTS - 1];
  const bubble = chileA[IORMC_SLOTS];
  const iormc = {
    slots: IORMC_SLOTS,
    eligible: chileA.length,
    qualified: chileA.slice(0, IORMC_SLOTS),
    contention: chileA.slice(IORMC_SLOTS, IORMC_SLOTS + 3),
    rest: chileA.slice(IORMC_SLOTS + 3),
    cutPoints: cut ? cut.points : 0,
    gap: cut && bubble ? Math.round((cut.points - bubble.points) * 10) / 10 : 0,
    all: chileA,
  };

  // ── nationality aggregates ──
  const allPlayers = [...divA.players, ...divB.players];
  const natCodes = ['CL', 'UY', 'AR', 'PE', 'BR', 'MX'];
  const nationalities = natCodes.map(code => {
    const group = allPlayers.filter(p => p.nat === code);
    const inA = group.filter(p => p.div === 'A').length;
    const best = [...group].sort((a, b) => b.points - a.points)[0];
    return {
      code, count: group.length, inA, inB: group.length - inA,
      avgPoints: Math.round((group.reduce((s, p) => s + p.points, 0) / group.length) * 10) / 10,
      avgRank: Math.round((group.reduce((s, p) => s + p.avgRank, 0) / group.length) * 100) / 100,
      best,
    };
  }).sort((a, b) => b.count - a.count);

  const nextSession = SESSION_DATES[SESSIONS_PLAYED];

  const calendar = [
    { date: nextSession.date, day: nextSession.day, round: 'Sesión 7 · Final', mesa: 'División A — Mesas 1-6', time: '15:00', div: 'A', status: 'highlight' },
    { date: nextSession.date, day: nextSession.day, round: 'Sesión 7 · Final', mesa: 'División B — Mesas 1-6', time: '15:00', div: 'B', status: 'highlight' },
    { date: '14 jun', day: 'dom', round: 'Playoff Título', mesa: 'División A — Top 4', time: '16:00', div: 'A', status: 'scheduled' },
    { date: '14 jun', day: 'dom', round: 'Promoción', mesa: 'A 21-24 vs B 1-4', time: '19:00', div: 'AB', status: 'scheduled' },
    { date: '21 jun', day: 'sáb', round: 'Selección IORMC', mesa: 'Anuncio oficial · Top 4 Chile', time: '20:00', div: 'CL', status: 'iormc' },
    { date: '28 jun', day: 'dom', round: 'Ceremonia de Cierre', mesa: 'Club Mahjong Chile', time: '18:00', div: 'AB', status: 'scheduled' },
  ];

  function hofFor(div) {
    const ps = div.players;
    const by = (fn, asc) => [...ps].sort((a, b) => asc ? fn(a) - fn(b) : fn(b) - fn(a))[0];
    const top = by(p => p.points), topWin = by(p => p.winRate), lowDeal = by(p => p.dealInRate, true);
    const speed = by(p => p.riichiRate), iron = by(p => p.avgRank, true), streak = by(p => p.streak);
    return [
      { tag: 'Líder División', value: (top.points >= 0 ? '+' : '') + top.points.toFixed(1), sub: 'puntos uma/oka', player: top, jp: '王座' },
      { tag: 'Mejor Win Rate', value: topWin.winRate.toFixed(1) + '%', sub: 'manos ganadas', player: topWin, jp: '和了率' },
      { tag: 'Muro de Hierro', value: lowDeal.dealInRate.toFixed(1) + '%', sub: 'deal-in más bajo', player: lowDeal, jp: '放銃' },
      { tag: 'Velocidad', value: speed.riichiRate.toFixed(1) + '%', sub: 'riichi rate', player: speed, jp: '立直' },
      { tag: 'Consistencia', value: iron.avgRank.toFixed(2), sub: 'puesto promedio', player: iron, jp: '平均順位' },
      { tag: 'Racha Caliente', value: (streak.streak >= 0 ? '+' : '') + streak.streak.toFixed(0), sub: 'últimas 4 hanchan', player: streak, jp: '連勝' },
    ];
  }

  window.MJC_DATA = {
    divisions: { A: { ...divA, hallOfFame: hofFor(divA) }, B: { ...divB, hallOfFame: hofFor(divB) } },
    allPlayers, nationalities, iormc, calendar,
    league: {
      season: 'Temporada 2026',
      sessionsPlayed: SESSIONS_PLAYED, sessionsTotal: SESSIONS_TOTAL,
      hanchanPerSession: HANCHAN_PER_SESSION, playersPerDiv: 24,
      hanchanPerDiv: divA.matches.length,
      hanchanTotal: divA.matches.length + divB.matches.length,
      nextSession,
    },
  };
})();
