// node --test scripts/keep
import test from 'node:test';
import assert from 'node:assert/strict';
import { newAge, parseMove, play, exposed, towers, mounts, buildable, outside, KEEP_HP, ordinal, duration } from './rules.mjs';

const T0 = '2026-11-01T12:00:00Z';
const later = (min) => new Date(Date.parse(T0) + min * 60000).toISOString();
let n = 0;
// Each call is a fresh player at a fresh time unless told otherwise, so cooldowns don't interfere.
const move = (s, title, opts = {}) => {
  n++;
  return play(s, { title, user: opts.user ?? `p${n}`, at: opts.at ?? later(n), id: opts.id ?? 1000 + n });
};

test('parses only the exact move shapes', () => {
  assert.deepEqual(parseMove('keep: build C2'), { action: 'build', square: 'C2' });
  assert.deepEqual(parseMove('  KEEP:fire  g7 '), { action: 'fire', square: 'G7' });
  assert.deepEqual(parseMove('keep: build c 2'), { action: 'build', square: 'C2' });
  assert.deepEqual(parseMove('keep: forge Rune'), { action: 'forge', material: 'rune' });
  for (const bad of ['keep: build H1', 'keep: build A8', 'keep: build A0', 'keep: forge gold', 'keep: fire', 'build C2',
    'keep: build C2; rm -rf /', 'keep: build C2 please', '', null, undefined, 'keep: build $(id)']) {
    assert.equal(parseMove(bad), null, String(bad));
  }
});

test('a new age has the keep inside a ring of eight stones, all exposed, four towers', () => {
  const s = newAge(1, T0);
  assert.equal(s.cells.D4.hp, KEEP_HP);
  assert.equal(Object.keys(s.cells).length, 9);
  const ex = exposed(s);
  assert.equal(ex.size, 8);
  assert.ok(!ex.has('D4'), 'the keep is walled in');
  assert.deepEqual(towers(s), ['C3', 'E3', 'C5', 'E5']);
});

test('build: only open ground touching the castle', () => {
  const s = newAge(1, T0);
  assert.ok(buildable(s, 'C2'));
  assert.ok(!buildable(s, 'A1'));
  assert.equal(move(s, 'keep: build A1').ok, false);
  assert.match(move(s, 'keep: build D3').reply, /already built/);
  const r = move(s, 'keep: build C2');
  assert.equal(r.ok, true);
  assert.equal(r.state.cells.C2.kind, 'stone');
  assert.equal(r.state.tally.stones, 1);
  assert.equal(s.cells.C2, undefined, 'the input state is not mutated');
});

test('fire: cracks, then breaks, a stone; refuses open ground and walled-in squares', () => {
  let s = newAge(1, T0);
  assert.match(move(s, 'keep: fire A1').reply, /open ground/);
  assert.match(move(s, 'keep: fire D4').reply, /behind the walls/);
  let r = move(s, 'keep: fire D3');
  assert.equal(r.state.cells.D3.hp, 1);
  r = move(r.state, 'keep: fire D3');
  assert.equal(r.state.cells.D3, undefined);
  s = r.state;
  assert.ok(exposed(s).has('D4'), 'a breach exposes the keep');
  assert.ok(outside(s).has('D3'));
});

test('the keep falls after five unguarded hits and a new age begins', () => {
  let s = newAge(1, T0);
  s = move(move(s, 'keep: fire D3').state, 'keep: fire D3').state;
  for (let i = 1; i < KEEP_HP; i++) {
    s = move(s, 'keep: fire D4').state;
    assert.equal(s.cells.D4.hp, KEEP_HP - i);
  }
  const r = move(s, 'keep: fire D4', { user: 'breaker' });
  assert.equal(r.ok, true);
  assert.match(r.reply, /fallen/);
  assert.equal(r.state.age, 2);
  assert.equal(r.state.cells.D4.hp, KEEP_HP);
  assert.equal(r.state.ages[0].fellTo, 'breaker');
  assert.equal(r.state.ages[0].shots, 2 + KEEP_HP);
  assert.equal(r.state.players.breaker.fired, 1, 'players carry over');
  assert.match(r.state.deeds[0].deed, /ended the First Age/);
});

test('forge: every third material makes the named weapon, mounted on the first tower', () => {
  let s = newAge(1, T0);
  s = move(s, 'keep: forge rune').state;
  s = move(s, 'keep: forge iron').state;
  assert.deepEqual(s.bellows, ['rune', 'iron']);
  const r = move(s, 'keep: forge ember');
  assert.match(r.reply, /Crownbreaker/);
  assert.match(r.reply, /tower at C3/);
  assert.deepEqual(r.state.bellows, []);
  assert.equal(r.state.weapons.length, 1);
  const { armed, guard } = mounts(r.state);
  assert.deepEqual([...armed.keys()], ['C3']);
  for (const sq of ['C3', 'C2', 'B3', 'D3', 'C4']) assert.ok(guard.has(sq), sq);
  assert.ok(!guard.has('E3'));
});

test('a guard repels shots, spending charges, and breaks after three', () => {
  let s = newAge(1, T0);
  for (const m of ['iron', 'iron', 'iron']) s = move(s, `keep: forge ${m}`).state;
  for (let i = 3; i > 1; i--) {
    const r = move(s, 'keep: fire D3');
    assert.match(r.reply, /Iron Mace/);
    s = r.state;
    assert.equal(s.cells.D3.hp, 2, 'the stone is untouched');
    assert.equal(s.weapons[0].charges, i - 1);
  }
  const r = move(s, 'keep: fire D3');
  assert.match(r.reply, /broke/);
  assert.equal(r.state.weapons.length, 0);
  assert.equal(r.state.tally.repelled, 3);
  assert.equal(move(r.state, 'keep: fire D3').state.cells.D3.hp, 1, 'unguarded again');
});

test('a weapon stays on its tower when a new tower rises earlier in reading order', () => {
  let s = newAge(1, T0);
  for (const m of ['iron', 'iron', 'iron']) s = move(s, `keep: forge ${m}`).state;
  assert.equal(s.weapons[0].at, 'C3');
  s = move(s, 'keep: build C2').state;
  s = move(s, 'keep: build B2').state;
  s = move(s, 'keep: build B3').state;
  assert.ok(towers(s).includes('B2'));
  assert.deepEqual([...mounts(s).armed.keys()], ['C3']);
  assert.equal(s.weapons[0].at, 'C3');
});

test('a weapon whose tower falls moves to the next free tower', () => {
  let s = newAge(1, T0);
  for (const m of ['rune', 'rune', 'rune']) s = move(s, `keep: forge ${m}`).state;
  delete s.cells.C3; // as if broken
  s = move(s, 'keep: build A1').state; // refused, but no matter
  s = move(s, 'keep: forge ember').state;
  assert.equal(s.weapons[0].at, 'E3');
});

test('weapons wait in the armoury when there is no tower', () => {
  let s = newAge(1, T0);
  for (const sq of ['C3', 'E3', 'C5', 'E5']) s.cells[sq] && delete s.cells[sq];
  assert.deepEqual(towers(s), []);
  for (const m of ['ember', 'ember', 'ember']) s = move(s, `keep: forge ${m}`).state;
  assert.equal(s.weapons[0].name, 'Firebrand');
  assert.equal(mounts(s).armed.size, 0);
});

test('one move per player every ten minutes', () => {
  const s = newAge(1, T0);
  const a = play(s, { title: 'keep: build C2', user: 'ada', at: later(0), id: 1 });
  const b = play(a.state, { title: 'keep: build E2', user: 'ada', at: later(9), id: 2 });
  assert.equal(b.ok, false);
  assert.match(b.reply, /12:10 UTC/);
  assert.equal(b.state.cells.E2, undefined);
  const c = play(b.state, { title: 'keep: build E2', user: 'ada', at: later(10), id: 3 });
  assert.equal(c.ok, true);
  assert.equal(c.state.players.ada.built, 2);
});

test('an issue is never played twice, and refusals are remembered too', () => {
  const s = newAge(1, T0);
  const a = play(s, { title: 'keep: build C2', user: 'ada', at: T0, id: 7 });
  const again = play(a.state, { title: 'keep: build C2', user: 'ada', at: later(30), id: 7 });
  assert.equal(again.duplicate, true);
  assert.equal(again.state, a.state);
  const bad = play(s, { title: 'nonsense', user: 'bo', at: T0, id: 8 });
  assert.ok(bad.state.seen.includes(8));
  assert.equal(play(bad.state, { title: 'nonsense', user: 'bo', at: T0, id: 8 }).duplicate, true);
});

test('queued moves apply in order against the latest state', () => {
  let s = newAge(1, T0);
  const queue = [
    { title: 'keep: fire D3', user: 'r1', at: later(1), id: 11 },
    { title: 'keep: fire D3', user: 'r2', at: later(2), id: 12 },
    { title: 'keep: build D3', user: 'b1', at: later(3), id: 13 },
  ];
  for (const m of queue) s = play(s, m).state;
  assert.equal(s.cells.D3.by, 'b1', 'rebuilt after being broken');
  assert.deepEqual(s.seen, [11, 12, 13]);
  assert.equal(s.deeds[0].user, 'b1');
});

test('words', () => {
  assert.equal(ordinal(2), 'Second');
  assert.equal(ordinal(11), '11th');
  assert.equal(ordinal(22), '22nd');
  assert.equal(duration(T0, later(1)), '1 minute');
  assert.equal(duration(T0, later(90)), '2 hours');
  assert.equal(duration(T0, later(60 * 24 * 5)), '5 days');
});
