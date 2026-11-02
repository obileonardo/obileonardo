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
  ember: pattern(['..........', '....i.....', '...ii.....', '...iii....', '..iiii.i..', '..iiiiii..', '.iiibbiii.', '.iibbbbii.', '..iibbii..', '..........']),
  rune: pattern(['..........', '....ii....', '...iiii...', '..ii..ii..', '.ii.bb.ii.', '.ii.bb.ii.', '..ii..ii..', '...iiii...', '....ii....', '..........']),
};

// The forge's label tile: as wide as four tiles, so the forge row spans the board exactly. Drawn 400 units
// wide for its 32% of the page, so `u` converts the page's pixel sizes (padding, type) into its units.
function forgeBarSvg(s, t, type) {
  const { text, fit, TYPE, PAD, TRACK, CAP, COL } = type;
  const u = 400 / (0.32 * COL), x = PAD * u;
  const bellows = s.bellows.length ? `Bellows: ${s.bellows.join(' + ')}` : 'The bellows are cold';
  const left = 3 - s.bellows.length;
  const bs = fit(bellows, 'display', 16 * u, 12 * u, 384 - 2 * x);
  // The card stops 16 units short of its box, leaving a clear gap before the three materials.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100" role="img" aria-label="The forge. ${bellows}."><style>${type.fontCss('display', 'text', 'label')}</style>${tileFrame(384, t)}
  ${text('THE FORGE', { font: 'label', size: TYPE.label * u, spacing: TRACK * u, x, y: Math.round(16 + TYPE.label * CAP * u), fill: t.brass })}
  ${text(bellows, { font: 'display', size: bs, x, y: 60, fill: t.ink })}
  ${text(`${left} more to forge a weapon →`, { font: 'text', size: 11.5 * u, x, y: 84, fill: t.muted })}</svg>\n`;
}

function tileFrame(w, t) {
  return CLEAN ? `<rect x="2" y="2" width="${w - 4}" height="96" fill="${t.bg}" stroke="${t.edge}" stroke-width="1.5"/>` : `<rect x="2" y="2" width="${w - 4}" height="96" rx="6" fill="${t.bg}"/>`;
}

// The castle keeps its pixel art in both styles. On clean tiles the dot grid is inset, so it never runs into the frame.
function tileSvg(cells, t) {
  const art = CLEAN ? `<g transform="translate(9 9) scale(0.82)">${dots(t, cells)}</g>` : dots(t, cells);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${tileFrame(100, t)}${art}</svg>\n`;
}

// ---------------------------------------------------------------- the status panel

// A tall scoreboard that sits beside the board: the age, the walls, recent deeds and a numbered
// ranking of everyone who has played. It is at least as tall as the board it stands next to.
// The panel is drawn exactly as tall as the board beside it: seven rows of tiles plus the forge row,
// each 8% of the column, against a 41% wide panel. GitHub leaves 5px between rows in its 846px column
// (0.59%, measured on the live page): a taller panel hangs below the board and narrows the next gap.
const PANEL_W = 500, PANEL_H = Math.round(PANEL_W * (8 * 8 + 7 * 0.59) / 41);

function panelSvg(s, t, type) {
  const { text, fontCss, svg, frame, dotRule: rule0, wrapText, layout, fit, TYPE, PAD, TRACK, COL } = type;
  // Drawn 500 units wide for its share of the page; `u` turns the page's pixel padding and type into units.
  const u = PANEL_W / ((parseFloat(PANEL_WIDTH) / 100) * COL);
  const W = PANEL_W, pad = PAD * u, inner = W - 2 * pad;
  const sz = (k) => TYPE[k] * u, BODY = sz('body'), LH = 26;
  const dotRule = (x0, x1, y, tt) => rule0(x0, x1, y, tt, 4, 6, u);
  const keep = s.cells.D4;
  const { armed } = mounts(s);
  const mounted = [...armed].map(([sq, i]) => `${s.weapons[i].name} at ${sq} (${s.weapons[i].charges}/${CHARGES})`);
  const waiting = s.weapons.length - armed.size;
  const walls = [...mounted, waiting ? `${waiting} waiting for a tower` : ''].filter(Boolean).join(' · ') || 'none yet';
  const bellows = s.bellows.length ? s.bellows.join(' + ') : 'cold';
  const label = (str, x, y, fill = t.muted, anchor = 'start') => text(str.toUpperCase(), { font: 'label', size: sz('label'), spacing: TRACK * u, x, y, fill, anchor });
  const body = (str, x, y, fill = t.ink, anchor = 'start', size = BODY) => text(str, { font: 'text', size, x, y, fill, anchor });
  const parts = [];
  let y = Math.round(pad + sz('heading') * 0.72);
  parts.push(text(CLEAN ? `The ${ordinal(s.age)} Age` : `THE ${ordinal(s.age).toUpperCase()} AGE`, { font: 'display', size: sz('heading'), spacing: CLEAN ? 0 : 1, x: pad, y, fill: t.ink }));
  y += 26; parts.push(label(`since ${day(s.startedAt)}`, pad, y, t.brass));
  y += 18; parts.push(dotRule(pad, W - pad, y, t));
  y += 32;
  const pips = Array.from({ length: KEEP_HP }, (_, i) => `<rect x="${pad + 120 + i * 24}" y="${y - 14}" width="15" height="15" rx="${CLEAN ? 0 : 0}" fill="${i < keep.hp ? t.accent : t.plate}"/>`).join('');
  parts.push(label('Keep', pad, y), pips, label('Stones', pad + 270, y), body(String(countStones(s)), W - pad, y + 1, t.ink, 'end'));
  y += 32; parts.push(label('On the walls', pad, y));
  const wl = wrapText(walls, 'text', BODY, inner);
  wl.forEach((l, i) => parts.push(body(l, pad, y + 26 + i * LH, walls === 'none yet' ? t.muted : t.ink, 'start', BODY)));
  y += 26 + LH * wl.length - 2;
  parts.push(dotRule(pad, W - pad, y, t));
  y += 30; parts.push(label('Recent deeds', pad, y));
  const deeds = s.deeds.slice(0, 3);
  y += 26;
  if (!deeds.length) { parts.push(body('No deeds yet. Lay the first stone.', pad, y, t.muted, 'start', BODY)); y += 24; }
  for (const d of deeds) {
    const lines = wrapText(`@${d.user} ${d.deed}`, 'text', BODY, inner);
    lines.forEach((l, i) => {
      if (i === 0) {
        const at = `@${d.user}`;
        parts.push(body(at, pad, y, t.accent, 'start', BODY));
        parts.push(body(l.slice(at.length).trimStart(), pad + layout(`${at} `, 'text', BODY).width, y, t.ink, 'start', BODY));
      } else parts.push(body(l, pad, y, t.ink, 'start', BODY));
      y += LH;
    });
  }
  y += 4; parts.push(dotRule(pad, W - pad, y, t));
  // The ranking: everyone by moves made, with what they did.
  y += 30; parts.push(label('Ranking', pad, y, t.brass), label('built · forged · fired', W - pad, y, t.muted, 'end'));
  const ranked = Object.entries(s.players).map(([u, pl]) => [u, pl, pl.built + pl.forged + pl.fired]).filter(([, , n]) => n > 0)
    .sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0])).slice(0, 4);
  y += 30;
  if (!ranked.length) { parts.push(body('No one yet. Be the first.', pad, y, t.muted, 'start', BODY)); y += 26; }
  ranked.forEach(([name, pl], i) => {
    parts.push(text(String(i + 1).padStart(2, '0'), { font: 'display', size: sz('title'), x: pad, y, fill: i === 0 ? t.brass : t.muted }));
    parts.push(body(`@${name}`, pad + 44, y, t.ink, 'start', BODY));
    parts.push(body(`${pl.built} · ${pl.forged} · ${pl.fired}`, W - pad, y, t.muted, 'end'));
    y += 28;
  });
  y += 2; parts.push(dotRule(pad, W - pad, y, t));
  y += 30; parts.push(label('Chronicle', pad, y));
  const fallen = s.ages[0];
  const chron = fallen ? `The ${ordinal(fallen.age)} Age stood ${duration(fallen.startedAt, fallen.endedAt)}: ${fallen.stones} stones, ${fallen.forged} weapons, breached by @${fallen.fellTo}.` : 'No castle has fallen yet.';
  const cl = wrapText(chron, 'text', BODY, inner);
  cl.forEach((l, i) => parts.push(body(l, pad, y + 26 + i * LH, fallen ? t.ink : t.muted, 'start', BODY)));
  y += 26 + LH * cl.length - 2;
  // A legend for the board's marks, with the tiles themselves in miniature.
  y += 6; parts.push(dotRule(pad, W - pad, y, t));
  y += 30; parts.push(label('Reading the board', pad, y));
  y += 16;
  // Two columns, so the legend costs three rows, not five.
  const legend = [['e1', 'Build here'], ['s2-0x', 'Fire here'], ['s2a-f', 'Armed tower'], ['s1-0', 'One hit from ruin'], ['k5', 'The keep']];
  legend.forEach(([key, words], i) => {
    const lx = pad + (i % 2) * (inner / 2), ly = y + Math.floor(i / 2) * 36;
    parts.push(`<g transform="translate(${lx} ${ly}) scale(0.3)"><rect width="100" height="100" rx="${CLEAN ? 0 : 10}" fill="${t.plate}"/>${dots(t, tileCells(key))}</g>`);
    parts.push(body(words, lx + 40, ly + 21, t.ink, 'start', fit(words, 'text', sz('meta'), sz('meta') * 0.9, inner / 2 - 44)));
  });
  y += Math.ceil(legend.length / 2) * 36 - 4;
  // How to play, at the foot: its last line sits `pad` above the bottom, level with the board's last row.
  const how = wrapText('Every click opens an issue. Press Create and the castle updates in about a minute. One move every 10 minutes.', 'text', sz('meta'), inner);
  const howLH = 24, howY = Math.max(y + 40, PANEL_H - pad - (how.length - 1) * howLH);
  parts.push(dotRule(pad, W - pad, howY - 34, t));
  how.forEach((l, i) => parts.push(body(l, pad, howY + i * howLH, t.muted, 'start', sz('meta'))));
  const H = Math.round(Math.max(PANEL_H, howY + (how.length - 1) * howLH + pad));
  const alt = `Hold the Keep. The ${ordinal(s.age)} Age. Keep ${keep.hp} of ${KEEP_HP}. ${countStones(s)} stones. On the walls: ${walls}. Bellows: ${bellows}. ${deeds.map((d) => `@${d.user} ${d.deed}`).join('. ')}. ${chron}`;
  return svg(W, H, alt, fontCss('display', 'text', 'label'), `${frame(W, H, t, 6, u)}\n  ${parts.join('\n  ')}`);
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
    for (const key of keys) files.set(`assets/keep/${key}-${theme}.svg`, tileSvg(tileCells(key), t));
    for (const m of MATERIALS) {
      files.set(`assets/keep/forge-${m}-${theme}.svg`, tileSvg(FORGE[m], t));
      files.set(`assets/keep/forge-${m}-lit-${theme}.svg`, tileSvg(FORGE[m].map((r) => r.map((c) => (c === 'i' ? 'b' : c))), t));
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
${picture(bar, `The forge. ${s.bellows.length ? `In the bellows: ${s.bellows.join(', ')}` : 'The bellows are cold'}.`, '32%')}${forge}<br clear="right">
</p>
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
