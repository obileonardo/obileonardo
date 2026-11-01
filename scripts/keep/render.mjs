// Hold the Keep: drawing the board.
//
// The board is a grid of small linked images, one per square, because an SVG's own links can't be
// clicked in a README. A tile's look depends only on what stands on it and around it, never on its
// position, so tiles are named by that look (assets/keep/s2a-tg-light.svg and so on). A move changes
// which tiles the README points at rather than the tiles themselves, so the board is fresh the
// moment the README is, with no image cache to wait out.

import { squares, neighbours, exposed, towers, mounts, buildable, COLS, KEEP_HP, CHARGES, MATERIALS, ordinal, countStones, duration } from './rules.mjs';

export const REPO = 'obileonardo/obileonardo';
const TILE_WIDTH = '8%'; // seven across beside the panel; tiles carry their own gutter, so no spaces between them
const PANEL_WIDTH = '41%'; // floats to the right of the board

let CLEAN = true; // set from the build's style in board()
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- what each square shows

export function describe(s) {
  const ex = exposed(s);
  const tw = new Set(towers(s));
  const { armed, guard } = mounts(s);
  return squares().map((sq) => {
    const cell = s.cells[sq];
    if (!cell) {
      const b = buildable(s, sq);
      return { sq, key: b ? 'e1' : 'e0', action: b ? 'build' : null, alt: b ? `${sq}: open ground beside the castle. Build here.` : `${sq}: open ground.` };
    }
    const n = neighbours(sq);
    const mask = ['up', 'right', 'down', 'left'].map((d) => (n[d] && s.cells[n[d]] ? '1' : '0')).join('');
    const x = ex.has(sq), g = guard.has(sq);
    if (cell.kind === 'keep') {
      return {
        sq,
        key: `k${cell.hp}${g ? 'g' : ''}${x ? 'x' : ''}`,
        action: x ? 'fire' : null,
        alt: `${sq}: the keep, ${cell.hp} of ${KEEP_HP} strength${g ? ', guarded' : ''}.${x ? ' Exposed: fire here.' : ' Walled in.'}`,
      };
    }
    const role = armed.has(sq) ? 'a' : tw.has(sq) ? 't' : '';
    const weapon = armed.has(sq) ? s.weapons[armed.get(sq)] : null;
    const what = weapon ? `a tower armed with the ${weapon.name}` : role === 't' ? 'a tower' : 'a stone';
    return {
      sq,
      key: `s${cell.hp}${role}-${parseInt(mask, 2).toString(16)}${g && !weapon ? 'g' : ''}${x ? 'x' : ''}`,
      action: x ? 'fire' : null,
      alt: `${sq}: ${what}${cell.hp === 1 ? ', cracked' : ''}${g && !weapon ? ', guarded' : ''}.${x ? ' Faces open ground: fire here.' : ''}`,
    };
  });
}

// ---------------------------------------------------------------- tiles
//
// Every tile is a 10 by 10 grid of square dots, like a dot-matrix sign and the Doto type: unlit dots
// are the ground, lit dots draw the castle. Cobalt marks what you can act on, brass marks weapons
// and damage.

const GRID = 10;

function dots(t, cells) {
  const off = t.plate;
  const colour = { i: t.ink, m: t.muted, a: t.accent, b: t.brass };
  let out = '';
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const c = cells[y][x];
      out += `<rect x="${x * 10 + 1.5}" y="${y * 10 + 1.5}" width="7" height="7" rx="${CLEAN ? 0 : 1}" fill="${c === '.' ? off : colour[c]}"/>`;
    }
  }
  return out;
}

const blank = () => Array.from({ length: GRID }, () => Array(GRID).fill('.'));
const fill = (g, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = c; };
const pattern = (rows) => rows.map((r) => r.split(''));

const CROWN = pattern([
  '..........',
  '.i..ii..i.',
  '.ii.ii.ii.',
  '.iiiiiiii.',
  '.iiiiiiii.',
  '.ibiiiibi.',
  '.iiiiiiii.',
  '..........',
  '..........',
  '..........',
]);

function tileCells(key) {
  const g = blank();
  const kind = key[0];
  if (kind === 'e') {
    if (key === 'e1') { fill(g, 4, 3, 5, 6, 'm'); fill(g, 3, 4, 6, 5, 'm'); }
    return g;
  }
  if (kind === 'k') {
    const hp = Number(key[1]);
    const c = CROWN.map((r) => [...r]);
    [1, 3, 5, 7, 9].forEach((x, i) => { if (i < 5) c[8][x - 1] = i < hp ? 'a' : 'm'; });
    if (key.includes('x')) corners(c);
    return c;
  }
  const [, hp, role, maskHex] = /^s(\d)([at]?)-([0-9a-f])/.exec(key);
  const m = parseInt(maskHex, 16);
  if (m & 8) fill(g, 3, 0, 6, 1, 'i');
  if (m & 4) fill(g, 8, 3, 9, 6, 'i');
  if (m & 2) fill(g, 3, 8, 6, 9, 'i');
  if (m & 1) fill(g, 0, 3, 1, 6, 'i');
  const guarded = /g/.test(key.slice(1));
  if (role) {
    for (let y = 1; y <= 8; y++) for (let x = 1; x <= 8; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d >= 2.1 && d <= 3.6) g[y][x] = 'i';
    }
    fill(g, 4, 4, 5, 5, role === 'a' ? 'b' : 'm');
  } else {
    fill(g, 2, 2, 7, 7, 'i');
    const mortar = guarded ? 'b' : 'm';
    fill(g, 2, 4, 7, 4, mortar);
    g[2][4] = g[3][4] = mortar;
    g[5][6] = g[6][6] = g[7][6] = mortar;
  }
  if (hp === '1') for (const [x, y] of [[3, 2], [3, 3], [4, 4], [5, 5], [5, 6], [6, 7]]) g[y][x] = 'b';
  if (key.endsWith('x')) corners(g);
  return g;
}

function corners(g) {
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [9, 0], [8, 0], [9, 1], [0, 9], [1, 9], [0, 8], [9, 9], [8, 9], [9, 8]]) g[y][x] = 'a';
}

const FORGE = {
  iron: pattern(['..........', '..........', '..........', '...iiii...', '..iiiiii..', '..iiiiii..', '.iiiiiiii.', '..........', '..........', '..........']),
  ember: pattern(['....i.....', '...ii.....', '...iii....', '..iiii.i..', '..iiiiii..', '.iiibbiii.', '.iibbbbii.', '..iibbii..', '..........', '..........']),
  rune: pattern(['....ii....', '...iiii...', '..ii..ii..', '.ii.bb.ii.', '.ii.bb.ii.', '..ii..ii..', '...iiii...', '....ii....', '..........', '..........']),
};

// The forge's label tile: as wide as four tiles, so the forge row spans the board exactly.
function forgeBarSvg(s, t, type) {
  const { text } = type;
  const bellows = s.bellows.length ? `In the bellows: ${s.bellows.join(' + ')}` : 'The bellows are cold';
  const left = 3 - s.bellows.length;
  // The card stops 16 units short of its box, leaving a clear gap before the three materials.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100" role="img" aria-label="The forge. ${bellows}."><style>${type.fontCss('display', 'text', 'label')}</style>${tileFrame(384, t)}
  ${text('THE FORGE', { font: 'label', size: 16, spacing: 2.4, x: 22, y: 33, fill: t.brass })}
  ${text(bellows, { font: 'text', size: 21, x: 22, y: 61, fill: t.ink })}
  ${text(`${left} more ${left === 1 ? 'material forges' : 'materials forge'} a weapon →`, { font: 'text', size: 17.5, x: 22, y: 85, fill: t.muted })}</svg>\n`;
}

function tileFrame(w, t) {
  return CLEAN ? `<rect x="2" y="2" width="${w - 4}" height="96" fill="${t.bg}" stroke="${t.edge}" stroke-width="1.5"/>` : `<rect x="2" y="2" width="${w - 4}" height="96" rx="6" fill="${t.bg}"/>`;
}

// ---------------------------------------------------------------- clean tiles
//
// The clean style draws the same pieces as smooth shapes instead of dots: wall blocks joined to their
// neighbours, round towers, a vector crown for the keep, soft brackets for squares you can fire at.

function cleanBody(key, t) {
  const out = [];
  const kind = key[0];
  const corners = (col) => {
    const c = (x, y, dx, dy) => `M${x} ${y + dy * 13}V${y}H${x + dx * 13}`;
    return `<path d="${c(10, 10, 1, 1)}${c(90, 10, -1, 1)}${c(10, 90, 1, -1)}${c(90, 90, -1, -1)}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  if (kind === 'e') {
    if (key === 'e1') out.push(`<path d="M50 40V60M40 50H60" stroke="${t.muted}" stroke-width="3.5" stroke-linecap="round"/>`);
    return out.join('');
  }
  if (kind === 'k') {
    const hp = Number(key[1]);
    out.push(`<rect x="22" y="22" width="56" height="56" fill="${t.plate}" stroke="${t.ink}" stroke-width="3"/>`);
    out.push(`<path d="M35 55V38L43 46L50 34L57 46L65 38V55Z" fill="${t.ink}" stroke="${t.ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
    for (let i = 0; i < KEEP_HP; i++) out.push(`<circle cx="${34 + i * 8}" cy="66" r="2.8" fill="${i < hp ? t.accent : t.faint}"/>`);
    if (key.includes('x')) out.push(corners(t.accent));
    return out.join('');
  }
  const [, hp, role, maskHex] = /^s(\d)([at]?)-([0-9a-f])/.exec(key);
  const m = parseInt(maskHex, 16);
  const arms = [];
  if (m & 8) arms.push([36, 0, 28, 30]);
  if (m & 4) arms.push([70, 36, 30, 28]);
  if (m & 2) arms.push([36, 70, 28, 30]);
  if (m & 1) arms.push([0, 36, 30, 28]);
  const fill = t.muted;
  for (const [x, y, w, h] of arms) out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
  if (role) {
    out.push(`<circle cx="50" cy="50" r="27" fill="${fill}"/><circle cx="50" cy="50" r="27" fill="none" stroke="${t.ink}" stroke-width="3"/>`);
    out.push(`<circle cx="50" cy="50" r="11" fill="${role === 'a' ? t.brass : t.bg}"/>`);
  } else {
    out.push(`<rect x="24" y="24" width="52" height="52" fill="${fill}" stroke="${t.ink}" stroke-width="3"/>`);
    out.push(`<path d="M27 50H73M50 27V50M38 50V73M62 50V73" stroke="${t.bg}" stroke-width="2" opacity=".55"/>`);
  }
  if (/g/.test(key.slice(1)) && role !== 'a') out.push(`<circle cx="78" cy="22" r="5" fill="${t.brass}"/>`);
  if (hp === '1') out.push(`<path d="M40 30L50 45L44 54L58 64L54 72" fill="none" stroke="${t.brass}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (key.endsWith('x')) out.push(corners(t.accent));
  return out.join('');
}

function cleanForge(material, lit, t) {
  const f = lit ? t.brass : t.muted, s = t.ink;
  return {
    iron: `<path d="M24 63L33 37H67L76 63Z" fill="${f}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>`,
    ember: `<path d="M50 22C59 34 70 42 66 58C63 70 55 76 50 76C42 76 33 69 33 58C33 48 41 44 42 34C47 40 47 46 50 48C52 40 52 30 50 22Z" fill="${f}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/><path d="M50 72C46 72 43 68 44 63C45 58 49 57 50 52C54 58 57 62 56 67C55 70 52 72 50 72Z" fill="${t.brass}"/>`,
    rune: `<path d="M50 20L77 50L50 80L23 50Z" fill="${f}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/><path d="M50 34V66M50 44L59 37M50 54L41 47" stroke="${t.bg}" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  }[material];
}

function tileSvg(cells, t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${tileFrame(100, t)}${dots(t, cells)}</svg>\n`;
}

// ---------------------------------------------------------------- the status panel

// A tall scoreboard that sits beside the board: the age, the walls, recent deeds and a numbered
// ranking of everyone who has played. It is at least as tall as the board it stands next to.
// The panel is drawn exactly as tall as the board beside it: seven rows of tiles plus the forge row,
// each 8% of the column, with about 0.5% of inline gap between rows, against a 41% wide panel.
const PANEL_W = 500, PANEL_H = Math.round(PANEL_W * (8 * 8 + 7 * 0.7) / 41);

function panelSvg(s, t, type) {
  const { text, fontCss, svg, frame, dotRule, wrapText, layout } = type;
  const W = PANEL_W, pad = 32, inner = W - 2 * pad;
  const keep = s.cells.D4;
  const { armed } = mounts(s);
  const mounted = [...armed].map(([sq, i]) => `${s.weapons[i].name} at ${sq} (${s.weapons[i].charges}/${CHARGES})`);
  const waiting = s.weapons.length - armed.size;
  const walls = [...mounted, waiting ? `${waiting} waiting for a tower` : ''].filter(Boolean).join(' · ') || 'none yet';
  const bellows = s.bellows.length ? s.bellows.join(' + ') : 'cold';
  const label = (str, x, y, fill = t.muted, anchor = 'start') => text(str.toUpperCase(), { font: 'label', size: 15.5, spacing: 2, x, y, fill, anchor });
  const body = (str, x, y, fill = t.ink, anchor = 'start', size = 16) => text(str, { font: 'text', size, x, y, fill, anchor });
  const parts = [];
  let y = 58;
  parts.push(text(CLEAN ? `The ${ordinal(s.age)} Age` : `THE ${ordinal(s.age).toUpperCase()} AGE`, { font: 'display', size: 32, spacing: CLEAN ? 0 : 1, x: pad, y, fill: t.ink }));
  y += 26; parts.push(label(`since ${day(s.startedAt)}`, pad, y, t.brass));
  y += 18; parts.push(dotRule(pad, W - pad, y, t));
  y += 32;
  const pips = Array.from({ length: KEEP_HP }, (_, i) => `<rect x="${pad + 120 + i * 24}" y="${y - 14}" width="15" height="15" rx="${CLEAN ? 0 : 0}" fill="${i < keep.hp ? t.accent : t.plate}"/>`).join('');
  parts.push(label('Keep', pad, y), pips, label('Stones', pad + 270, y), body(String(countStones(s)), W - pad, y + 1, t.ink, 'end'));
  y += 32; parts.push(label('On the walls', pad, y));
  const wl = wrapText(walls, 'text', 17, inner);
  wl.forEach((l, i) => parts.push(body(l, pad, y + 26 + i * 24, walls === 'none yet' ? t.muted : t.ink, 'start', 17)));
  y += 26 + 22 * wl.length;
  parts.push(dotRule(pad, W - pad, y, t));
  y += 30; parts.push(label('Recent deeds', pad, y));
  const deeds = s.deeds.slice(0, 3);
  y += 26;
  if (!deeds.length) { parts.push(body('No deeds yet. Lay the first stone.', pad, y, t.muted, 'start', 17)); y += 24; }
  for (const d of deeds) {
    const lines = wrapText(`@${d.user} ${d.deed}`, 'text', 17, inner);
    lines.forEach((l, i) => {
      if (i === 0) {
        const at = `@${d.user}`;
        parts.push(body(at, pad, y, t.accent, 'start', 17));
        parts.push(body(l.slice(at.length).trimStart(), pad + layout(`${at} `, 'text', 17).width, y, t.ink, 'start', 17));
      } else parts.push(body(l, pad, y, t.ink, 'start', 17));
      y += 24;
    });
  }
  y += 4; parts.push(dotRule(pad, W - pad, y, t));
  // The ranking: everyone by moves made, with what they did.
  y += 30; parts.push(label('Ranking', pad, y, t.brass), label('built · forged · fired', W - pad, y, t.muted, 'end'));
  const ranked = Object.entries(s.players).map(([u, pl]) => [u, pl, pl.built + pl.forged + pl.fired]).filter(([, , n]) => n > 0)
    .sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0])).slice(0, 4);
  y += 30;
  if (!ranked.length) { parts.push(body('No one yet. Be the first.', pad, y, t.muted, 'start', 17)); y += 26; }
  ranked.forEach(([u, pl], i) => {
    parts.push(text(String(i + 1).padStart(2, '0'), { font: 'display', size: 18, x: pad, y, fill: i === 0 ? t.brass : t.muted }));
    parts.push(body(`@${u}`, pad + 44, y, t.ink, 'start', 17));
    parts.push(body(`${pl.built} · ${pl.forged} · ${pl.fired}`, W - pad, y, t.muted, 'end', 16));
    y += 28;
  });
  y += 2; parts.push(dotRule(pad, W - pad, y, t));
  y += 30; parts.push(label('Chronicle', pad, y));
  const fallen = s.ages[0];
  const chron = fallen ? `The ${ordinal(fallen.age)} Age stood ${duration(fallen.startedAt, fallen.endedAt)}: ${fallen.stones} stones, ${fallen.forged} weapons, breached by @${fallen.fellTo}.` : 'No castle has fallen yet.';
  const cl = wrapText(chron, 'text', 17, inner);
  cl.forEach((l, i) => parts.push(body(l, pad, y + 26 + i * 24, fallen ? t.ink : t.muted, 'start', 17)));
  y += 26 + 22 * cl.length;
  // A legend for the board's marks, with the tiles themselves in miniature.
  y += 6; parts.push(dotRule(pad, W - pad, y, t));
  y += 30; parts.push(label('Reading the board', pad, y));
  y += 16;
  // Two columns, so the legend costs three rows, not five.
  const legend = [['e1', 'Build here'], ['s2-0x', 'Fire here'], ['s2a-f', 'Armed tower'], ['s1-0', 'Cracked: one more hit'], ['k5', 'The keep']];
  legend.forEach(([key, words], i) => {
    const lx = pad + (i % 2) * (inner / 2), ly = y + Math.floor(i / 2) * 36;
    parts.push(`<g transform="translate(${lx} ${ly}) scale(0.3)"><rect width="100" height="100" rx="${CLEAN ? 0 : 10}" fill="${t.plate}"/>${CLEAN ? cleanBody(key, t) : dots(t, tileCells(key))}</g>`);
    parts.push(body(words, lx + 42, ly + 21, t.ink, 'start', 16.5));
  });
  y += Math.ceil(legend.length / 2) * 36 - 4;
  const howY = Math.max(y + 34, PANEL_H - 62);
  parts.push(dotRule(pad, W - pad, howY - 30, t));
  wrapText('Every click opens an issue; press Create and the castle updates in about a minute. One move every 10 minutes.', 'text', 15.5, inner)
    .forEach((l, i) => parts.push(body(l, pad, howY + i * 22, t.muted, 'start', 15.5)));
  const H = Math.max(PANEL_H, howY + 2 * 20 + 18);
  const alt = `Hold the Keep. The ${ordinal(s.age)} Age. Keep ${keep.hp} of ${KEEP_HP}. ${countStones(s)} stones. On the walls: ${walls}. Bellows: ${bellows}. ${deeds.map((d) => `@${d.user} ${d.deed}`).join('. ')}. ${chron}`;
  return svg(W, H, alt, fontCss('display', 'text', 'label'), `${frame(W, H, t)}\n  ${parts.join('\n  ')}`);
}

// ---------------------------------------------------------------- the board, as files and markdown

const issueUrl = (title, body) => `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
const NOTE = '\n\nLeave the title as it is and press **Create**. The castle updates in about a minute, and a reply here tells you what happened. One move every 10 minutes.';

function picture(base, alt, width) {
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/keep/${base}-dark.svg"><img alt="${esc(alt)}" src="assets/keep/${base}-light.svg" width="${width}"></picture>`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// The status panel changes with every move, so it is named by its contents: a fresh name is a fresh
// image, never one GitHub has cached. Tiles are already named by their looks.
function shortHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Everything the board needs: files to write (path -> svg) and the README section. */
export function board(s, themes, type) {
  CLEAN = type.style !== 'pixel';
  const files = new Map();
  const cells = describe(s);
  const keys = new Set(cells.map((d) => d.key));
  for (const [theme, t] of Object.entries(themes)) {
    const tile = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${tileFrame(100, t)}${body}</svg>\n`;
    for (const key of keys) files.set(`assets/keep/${key}-${theme}.svg`, CLEAN ? tile(cleanBody(key, t)) : tileSvg(tileCells(key), t));
    for (const m of MATERIALS) {
      files.set(`assets/keep/forge-${m}-${theme}.svg`, CLEAN ? tile(cleanForge(m, false, t)) : tileSvg(FORGE[m], t));
      files.set(`assets/keep/forge-${m}-lit-${theme}.svg`, CLEAN ? tile(cleanForge(m, true, t)) : tileSvg(FORGE[m].map((r) => r.map((c) => (c === 'i' ? 'b' : c))), t));
    }
  }
  const bars = Object.fromEntries(Object.entries(themes).map(([theme, t]) => [theme, forgeBarSvg(s, t, type)]));
  const bar = `forgebar-${shortHash(Object.values(bars).join(''))}`;
  for (const [theme, svg] of Object.entries(bars)) files.set(`assets/keep/${bar}-${theme}.svg`, svg);
  const panels = Object.fromEntries(Object.entries(themes).map(([theme, t]) => [theme, panelSvg(s, t, type)]));
  const panel = `panel-${shortHash(Object.values(panels).join(''))}`;
  for (const [theme, svg] of Object.entries(panels)) files.set(`assets/keep/${panel}-${theme}.svg`, svg);

  const rows = [];
  for (let r = 0; r < cells.length / COLS.length; r++) {
    rows.push(cells.slice(r * COLS.length, (r + 1) * COLS.length).map((d) => {
      const img = picture(d.key, d.alt, TILE_WIDTH);
      if (!d.action) return img;
      const body = d.action === 'build' ? `Lay a stone at ${d.sq}.${NOTE}` : `Fire the trebuchet at ${d.sq}.${NOTE}`;
      return `<a href="${esc(issueUrl(`keep: ${d.action} ${d.sq}`, body))}">${img}</a>`;
    }).join(''));
  }
  const forge = MATERIALS.map((m) => {
    const lit = s.bellows.includes(m);
    return `<a href="${esc(issueUrl(`keep: forge ${m}`, `Add ${m} to the forge. Every third material forges a weapon that guards a tower.${NOTE}`))}">${picture(`forge-${m}${lit ? '-lit' : ''}`, `Forge: add ${m}${lit ? ' (already in the bellows)' : ''}.`, TILE_WIDTH)}</a>`;
  }).join('');

  const panelImg = `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/keep/${panel}-dark.svg"><img alt="The state of the castle: its age, the keep, the walls, recent deeds, the ranking of players, and the chronicle of fallen castles." src="assets/keep/${panel}-light.svg" width="${PANEL_WIDTH}" align="right"></picture>`;
  const markdown = `<!-- keep:start -->
<p>
${panelImg}
${rows.join('\n<br>\n')}
<br>
${picture(bar, `The forge. ${s.bellows.length ? `In the bellows: ${s.bellows.join(', ')}` : 'The bellows are cold'}.`, '32%')}${forge}
</p>
<br clear="right">
<!-- keep:end -->`;
  return { files, markdown };
}

/** Puts each SVG's content hash in its file name (hearth-dark.svg -> hearth-dark.3f9a1c2b.svg) and points the
 *  markdown at the new names. GitHub serves README images from a cache keyed on the path alone, so a changed
 *  image under an old name can be served stale for minutes; a new name can't be. */
export function hashNames(files, md) {
  const out = new Map(), rename = new Map();
  for (const [rel, content] of files) {
    if (/^assets\/.+\.svg$/.test(rel)) {
      const named = rel.replace(/\.svg$/, `.${shortHash(content)}.svg`);
      rename.set(rel, named);
      out.set(named, content);
    } else out.set(rel, content);
  }
  return { files: out, md: md.replace(/assets\/[A-Za-z0-9_.\/-]+?\.svg/g, (p) => rename.get(p) ?? p) };
}

/** Generated SVGs the markdown no longer points at, in the given folders, to delete after writing. */
export function stale(listing, md) {
  const used = new Set(md.match(/assets\/[A-Za-z0-9_.\/-]+?\.svg/g) || []);
  return listing.filter((rel) => rel.endsWith('.svg') && !used.has(rel));
}

export function splice(readme, fragment) {
  const a = readme.indexOf('<!-- keep:start -->');
  const b = readme.indexOf('<!-- keep:end -->');
  if (a < 0 || b < a) throw new Error('README.md has no keep markers');
  return readme.slice(0, a) + fragment + readme.slice(b + '<!-- keep:end -->'.length);
}
