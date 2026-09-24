import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { loadBabel, transpileJsx } from '../scripts/build-vendor.mjs';

const context = vm.createContext({ window: {}, tr: (key, args) => `${key}:${JSON.stringify(args)}` });
vm.runInContext(transpileJsx(loadBabel(), fs.readFileSync(new URL('../components-playoffs.jsx', import.meta.url), 'utf8'), 'components-playoffs.jsx'), context);
const config = JSON.parse(fs.readFileSync(new URL('../sync-config.json', import.meta.url)));
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const divisions = Object.fromEntries(['A', 'B'].map(div => [div, {
    players: Array.from({ length: 10 }, (_, i) => ({ id: `${div}${i + 1}`, div })),
  }]));
  return { league: { playoffs: config.playoffs }, divisions, allPlayers: Object.values(divisions).flatMap(d => d.players), playoffMatches: [] };
}
function recordRound(data, round, tables) {
  tables.forEach((seats, table) => {
    for (let hanchan = 1; hanchan <= round.hanchan; hanchan++) {
      data.playoffMatches.push({ playoffRound: round.id, table: table + 1, hanchan,
        players: seats.map(({ player }, i) => ({ id: player.id, delta: 30 - 20 * i })) });
    }
  });
}

test('quarterfinals seat two players from each division per table in mirror', () => {
  const data = fixture();
  for (const league of [data.league, {}]) {
    const format = context.playoffFormat({ ...data, league });
    const tables = context.playoffSeeding(data, format);
    assert.deepEqual(plain(tables.map(seats => seats.map(s => s.code))), [
      ['A1', 'A2', 'B7', 'B8'], ['A3', 'A4', 'B5', 'B6'],
      ['B1', 'B2', 'A7', 'A8'], ['B3', 'B4', 'A5', 'A6'],
    ]);
    assert.deepEqual(plain(format.rounds[0].rulesByTable), ['A', 'A', 'B', 'B']);
    tables.forEach((seats, table) => {
      assert.deepEqual(plain(seats.map(s => s.player.div).sort()), ['A', 'A', 'B', 'B']);
      assert.equal(seats[0].player.div, format.rounds[0].rulesByTable[table]);
    });
    assert.equal(new Set(tables.flat().map(s => s.player.id)).size, 16);
  }
});

test('semifinal 1 takes quarterfinal tables 1-2 and semifinal 2 takes tables 3-4', () => {
  const data = fixture();
  const format = context.playoffFormat(data);
  const seeding = context.playoffSeeding(data, format);
  let bracket = context.playoffBracketSeats(data, format.rounds, seeding);
  assert.deepEqual(plain(bracket[1].map(seats => seats.map(s => s.source))), [[0, 0, 1, 1], [2, 2, 3, 3]]);
  assert.deepEqual(plain(format.rounds[1].rulesByTable), ['A', 'B']);
  // Ganan los dos invitados de cada mesa: las semis quedan con la otra división.
  recordRound(data, format.rounds[0], seeding.map(seats => [...seats].reverse()));
  bracket = context.playoffBracketSeats(data, format.rounds, seeding);
  assert.deepEqual(plain(bracket[1].map(seats => seats.map(s => s.player.id))), [
    ['B8', 'B7', 'B6', 'B5'], ['A8', 'A7', 'A6', 'A5'],
  ]);
  recordRound(data, format.rounds[1], bracket[1]);
  bracket = context.playoffBracketSeats(data, format.rounds, seeding);
  assert.deepEqual(plain(bracket[2][0].map(s => s.player.id)), ['B8', 'B7', 'A8', 'A7']);
  assert.equal(format.rounds[2].rulesByTable[0], 'A');
});

test('incomplete hanchan leave only that table pending', () => {
  const data = fixture();
  const format = context.playoffFormat(data);
  const seeding = context.playoffSeeding(data, format);
  recordRound(data, format.rounds[0], seeding);
  data.playoffMatches = data.playoffMatches.filter(m => !(m.table === 2 && m.hanchan === 2));
  const semis = context.playoffBracketSeats(data, format.rounds, seeding)[1];
  assert.deepEqual(plain(semis[0].slice(0, 2).map(s => s.player.id)), ['A1', 'A2']);
  assert.deepEqual(plain(semis[0].slice(2).map(s => s.source)), [1, 1]);
  assert.deepEqual(plain(semis[1].map(s => s.player.id)), ['B1', 'B2', 'B3', 'B4']);
});

test('missing qualifiers or invalid table allocations leave seeding pending', () => {
  const data = fixture();
  const format = context.playoffFormat(data);
  for (const rulesByTable of [['A', 'B'], ['A', 'A', 'A', 'B'], ['A', 'A', 'B', 'C']]) {
    assert.equal(context.playoffSeeding(data, { ...format, rounds: [{ ...format.rounds[0], rulesByTable }] }), null);
  }
  data.divisions.B.players = data.divisions.B.players.slice(0, 7);
  assert.equal(context.playoffSeeding(data, format), null);
});
