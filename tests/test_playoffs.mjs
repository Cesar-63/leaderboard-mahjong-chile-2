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

test('quarterfinals seat all eight qualifiers of each division once under their own rules', () => {
  const data = fixture();
  for (const league of [data.league, {}]) {
    const format = context.playoffFormat({ ...data, league });
    const tables = context.playoffSeeding(data, format);
    assert.deepEqual(plain(tables.map(seats => seats.map(s => s.code))), [
      ['A1', 'A2', 'A7', 'A8'], ['A3', 'A4', 'A5', 'A6'],
      ['B1', 'B2', 'B7', 'B8'], ['B3', 'B4', 'B5', 'B6'],
    ]);
    tables.forEach((seats, table) => assert.ok(seats.every(s => s.player.div === format.rounds[0].rulesByTable[table])));
    assert.equal(new Set(tables.flat().map(s => s.player.id)).size, 16);
  }
});

test('pending feeders and completed results keep semifinals separate and join only in the final', () => {
  const data = fixture();
  const format = context.playoffFormat(data);
  const seeding = context.playoffSeeding(data, format);
  let bracket = context.playoffBracketSeats(data, format.rounds, seeding);
  assert.deepEqual(plain(bracket[1].map(seats => seats.map(s => s.source))), [[0, 0, 1, 1], [2, 2, 3, 3]]);
  recordRound(data, format.rounds[0], seeding);
  bracket = context.playoffBracketSeats(data, format.rounds, seeding);
  bracket[1].forEach((seats, table) => {
    assert.equal(seats.length, 4);
    assert.ok(seats.every(s => s.player.div === format.rounds[1].rulesByTable[table]));
  });
  recordRound(data, format.rounds[1], bracket[1]);
  bracket = context.playoffBracketSeats(data, format.rounds, seeding);
  assert.deepEqual(plain(bracket[2][0].map(s => s.player.div)), ['A', 'A', 'B', 'B']);
  assert.equal(format.rounds[2].rulesByTable[0], 'A');
});

test('incomplete hanchan leave that table pending without crossing divisions', () => {
  const data = fixture();
  const format = context.playoffFormat(data);
  const seeding = context.playoffSeeding(data, format);
  recordRound(data, format.rounds[0], seeding);
  data.playoffMatches = data.playoffMatches.filter(m => !(m.table === 2 && m.hanchan === 2));
  const semis = context.playoffBracketSeats(data, format.rounds, seeding)[1];
  assert.ok(semis[0].slice(0, 2).every(s => s.player.div === 'A'));
  assert.deepEqual(plain(semis[0].slice(2).map(s => s.source)), [1, 1]);
  assert.ok(semis[1].every(s => s.player.div === 'B'));
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
