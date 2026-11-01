// Hold the Keep: drawing the board.
//
// The board is a grid of small linked images, one per square, because an SVG's own links can't be
// clicked in a README. A tile's look depends only on what stands on it and around it, never on its
// position, so tiles are named by that look (assets/keep/s2a-tg-light.svg and so on). A move changes
// which tiles the README points at rather than the tiles themselves, so the board is fresh the
// moment the README is, with no image cache to wait out.

import { squares, neighbours, exposed, towers, mounts, buildable, COLS, KEEP_HP, CHARGES, MATERIALS, ordinal, countStones, duration } from './rules.mjs';

export const REPO = 'obileonardo/obileonardo';
const TILE_WIDTH = '10%';

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
      out += `<rect x="${x * 10 + 1.5}" y="${y * 10 + 1.5}" width="7" height="7" rx="1" fill="${c === '.' ? off : colour[c]}"/>`;
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

function tileSvg(cells, t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="6" fill="${t.bg}"/>${dots(t, cells)}</svg>\n`;
}

// ---------------------------------------------------------------- the status panel

function panelSvg(s, t, type) {
  const { text, fontCss, svg, frame, dotRule, wrapText } = type;
  const W = 1000, pad = 40, col = 236;
  const keep = s.cells.D4;
  const { armed } = mounts(s);
  const mounted = [...armed].map(([sq, i]) => `${s.weapons[i].name} at ${sq} (${s.weapons[i].charges}/${CHARGES})`);
  const waiting = s.weapons.length - armed.size;
  const walls = [...mounted, waiting ? `${waiting} waiting for a tower` : ''].filter(Boolean).join(' · ') || 'none yet';
  const bellows = s.bellows.length ? s.bellows.join(' + ') : 'cold';
  const label = (str, x, y, fill = t.muted, anchor = 'start') => text(str.toUpperCase(), { font: 'label', size: 14, spacing: 2.2, x, y, fill, anchor });
  const body = (str, x, y, fill = t.ink, anchor = 'start') => text(str, { font: 'text', size: 19, x, y, fill, anchor });

  // Rows from the top; each section adds its height.
  const parts = [];
  let y = 70;
  parts.push(text(`THE ${ordinal(s.age).toUpperCase()} AGE`, { font: 'display', size: 42, spacing: 1, x: pad, y, fill: t.ink }));
  parts.push(label(`since ${day(s.startedAt)}`, W - pad, y - 6, t.brass, 'end'));
  y += 18;
  parts.push(dotRule(pad, W - pad, y, t));
  y += 38;
  const pips = Array.from({ length: KEEP_HP }, (_, i) => `<rect x="${pad + col + i * 22}" y="${y - 15}" width="15" height="15" fill="${i < keep.hp ? t.accent : t.plate}"/>`).join('');
  parts.push(label('Keep', pad, y), pips, label('Stones', pad + 400, y), body(String(countStones(s)), pad + 510, y + 1), label('Bellows', pad + 590, y), body(bellows, pad + 720, y + 1));
  y += 36;
  const wallLines = wrapText(walls, 'text', 19, W - pad * 2 - col);
  parts.push(label('On the walls', pad, y));
  wallLines.forEach((l, i) => parts.push(body(l, pad + col, y + 1 + i * 26, walls === 'none yet' ? t.muted : t.ink)));
  y += 26 * wallLines.length + 12;
  parts.push(dotRule(pad, W - pad, y, t));
  y += 36;
  parts.push(label('Recent deeds', pad, y));
  const deeds = s.deeds.slice(0, 3);
  if (!deeds.length) parts.push(body('No deeds yet. Lay the first stone.', pad + col, y + 1, t.muted));
  deeds.forEach((d, i) => {
    parts.push(body(`@${d.user}`, pad + col, y + 1 + i * 26, t.accent));
    parts.push(body(d.deed, pad + col + text_width(`@${d.user} `), y + 1 + i * 26, t.ink));
  });
  y += 26 * Math.max(1, deeds.length) + 12;
  parts.push(dotRule(pad, W - pad, y, t));
  y += 36;
  // The rolls, three columns, always on show.
  const cw = (W - pad * 2) / 3;
  [['built', 'Builders'], ['forged', 'Smiths'], ['fired', 'Raiders']].forEach(([field, name], c) => {
    const x = pad + c * cw;
    parts.push(label(name, x, y, t.brass));
    const top = Object.entries(s.players).filter(([, pl]) => pl[field] > 0).sort((a, b) => b[1][field] - a[1][field] || a[0].localeCompare(b[0])).slice(0, 3);
    if (!top.length) parts.push(body('—', x, y + 29, t.muted));
    top.forEach(([u, pl], i) => {
      parts.push(body(`@${u}`, x, y + 29 + i * 26, t.ink));
      parts.push(body(String(pl[field]), x + cw - 24, y + 29 + i * 26, t.muted, 'end'));
    });
  });
  y += 29 + 26 * 3 + 6;
  parts.push(dotRule(pad, W - pad, y, t));
  y += 36;
  parts.push(label('Chronicle', pad, y));
  const fallen = s.ages[0];
  const chron = fallen
    ? `The ${ordinal(fallen.age)} Age stood ${duration(fallen.startedAt, fallen.endedAt)}: ${fallen.stones} stones, ${fallen.forged} weapons, breached by @${fallen.fellTo}.`
    : 'No castle has fallen yet.';
  const chronLines = wrapText(chron, 'text', 19, W - pad * 2 - col);
  chronLines.forEach((l, i) => parts.push(body(l, pad + col, y + 1 + i * 26, fallen ? t.ink : t.muted)));
  y += 26 * chronLines.length + 6;
  parts.push(dotRule(pad, W - pad, y, t));
  y += 34;
  parts.push(text('Click open ground to build, a stone with blue corners to fire, or a material to forge.', { font: 'text', size: 16.5, x: W / 2, y, fill: t.muted, anchor: 'middle' }));
  const H = y + 30;

  function text_width(str) { return type.layout(str, 'text', 19).width; }
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
    }).join('\n'));
  }
  const forge = MATERIALS.map((m) => {
    const lit = s.bellows.includes(m);
    return `<a href="${esc(issueUrl(`keep: forge ${m}`, `Add ${m} to the forge. Every third material forges a weapon that guards a tower.${NOTE}`))}">${picture(`forge-${m}${lit ? '-lit' : ''}`, `Forge: add ${m}${lit ? ' (already in the bellows)' : ''}.`, '7%')}</a>`;
  }).join('\n');

  const markdown = `<!-- keep:start -->
<p align="center">
${rows.join('\n<br>\n')}
<br>
${forge}
</p>

<p align="center">${picture(panel, 'The state of the castle: its age, the keep, the walls, recent deeds, the rolls of builders, smiths and raiders, and the chronicle of fallen castles.', '100%')}</p>
<!-- keep:end -->`;
  return { files, markdown };
}

export function splice(readme, fragment) {
  const a = readme.indexOf('<!-- keep:start -->');
  const b = readme.indexOf('<!-- keep:end -->');
  if (a < 0 || b < a) throw new Error('README.md has no keep markers');
  return readme.slice(0, a) + fragment + readme.slice(b + '<!-- keep:end -->'.length);
}
