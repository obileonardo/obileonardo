// The status panel, drawn with the same helpers play.mjs hands the renderer. It must stay as tall as the
// board beside it however busy the game gets. Needs no network.
//   node --test scripts/keep/render.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../build.mjs';
import { board } from './render.mjs';
import { newAge } from './rules.mjs';

const at = '2026-11-02T16:46:36Z';
const long = 'a-very-long-github-username-of-39-chars';
const player = (n) => ({ built: n, forged: n, fired: n, last: at });
const heights = (s) => {
  const { files } = board(s, B.THEMES, B);
  return [...files].filter(([name]) => /panel-/.test(name)).map(([, svg]) => Number(svg.match(/viewBox="0 0 500 (\d+)/)[1]));
};

before(() => B.loadFonts());

test('the panel is the same height from an empty game to the busiest', () => {
  const start = newAge(1, at);
  const [empty] = heights(start);
  const busy = {
    ...start,
    deeds: Array.from({ length: 6 }, () => ({ at, user: long, deed: 'forged a Ballista from iron, ember and rune' })),
    players: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`${long.slice(0, 30)}${i}`, player(i + 100)])),
    ages: [{ age: 1, startedAt: '2026-11-01T00:00:00Z', endedAt: '2026-12-25T00:00:00Z', stones: 40, forged: 12, fellTo: long }],
  };
  for (const h of heights(busy)) assert.equal(h, empty);
});

test('a deed too long for the panel ends in an ellipsis', () => {
  const start = newAge(1, at);
  const s = { ...start, deeds: [{ at, user: long, deed: 'forged a Ballista from iron, ember and rune' }] };
  const { files } = board(s, B.THEMES, B);
  const [, svg] = [...files].find(([name]) => /panel-.*dark/.test(name));
  assert.match(svg, /…<\/text>/);
});
