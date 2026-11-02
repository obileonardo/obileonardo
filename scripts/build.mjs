#!/usr/bin/env node
// Builds README.md and the SVG artwork in assets/ from README.template.md and live GitHub data.
//
//   node scripts/build.mjs
//
// Needs Node 20+ and a GitHub token in GITHUB_TOKEN or GH_TOKEN (falls back to `gh auth token`).
// Runs nightly in .github/workflows/build.yml. Output is deterministic: if the data hasn't
// changed, the files don't change and the workflow commits nothing.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState, pruneUnused } from './keep/play.mjs';
import { board as keepBoard, hashNames } from './keep/render.mjs';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIN = 'obileonardo';

// ---------------------------------------------------------------- content

// The Arsenal. Descriptions are curated here; stars and versions come from GitHub.
const PROJECTS = [
  {
    name: 'Hearth',
    short: 'A macOS menu-bar companion for Home Assistant.',
    mark: 'H',
    repo: 'obileonardo/hearth-macos',
    what: 'A native macOS menu-bar companion for Home Assistant.',
    built: 'Swift',
    get: { label: 'Homebrew', url: 'https://github.com/obileonardo/homebrew-hearth' },
  },
  {
    name: 'Clepso',
    short: "A menu-bar monitor for your AI agents' usage limits.",
    mark: 'Cl',
    repo: 'obileonardo/clepso',
    what: "A native macOS menu-bar monitor for your AI coding agents' usage limits (Claude Code and Codex). Local-first, private by design.",
    built: 'Swift',
    get: { label: 'Website', url: 'https://clepso-app.vercel.app' },
  },
  {
    name: 'Capsa',
    short: 'A local-first library for what you learn working with AI.',
    mark: 'Ca',
    repo: 'obileonardo/capsa-oss',
    what: 'A local-first library for what you learn about working with AI, with the evidence each item came from. App, MCP server and command line.',
    built: 'TypeScript',
    get: { label: 'Releases', url: 'https://github.com/obileonardo/capsa-oss/releases' },
  },
  {
    name: 'Builders World',
    short: 'A browser world in real African cities, built from commits.',
    mark: 'BW',
    repo: 'builders-world/builders-world',
    what: 'A living, browser-based world set in real African cities, where your GitHub commits are your currency.',
    built: 'Three.js · Rust',
    get: { label: 'Play', url: 'https://buildersworld.vercel.app' },
    standing: 'Open source',
  },
  {
    name: 'Mazerance',
    short: 'A psychological co-op strategy game, built at FiveBlooded.',
    url: 'https://x.com/Mazerance',
    what: 'A psychological co-op strategy game, built at FiveBlooded.',
    built: 'Unreal Engine 5',
    get: { label: 'Follow', url: 'https://x.com/Mazerance' },
    standing: 'In development',
  },
  {
    name: 'Halfwings',
    short: 'The software and hardware partner for technology businesses.',
    mark: 'Hw',
    url: 'https://x.com/HalfwingsInc',
    what: 'The software and hardware development partner for technology businesses.',
    built: 'Software · Hardware',
    get: { label: 'Follow', url: 'https://x.com/HalfwingsInc' },
    standing: 'Founded 2026',
  },
];

// Elsewhere. `mark` is the monogram on each badge.
const SEALS = [
  { id: 'portfolio', handle: 'elvisobi.com', label: 'Portfolio', mark: 'E', url: 'https://elvisobi.com', alt: 'Portfolio: elvisobi.com' },
  { id: 'x', handle: '@TheObiLeonard', label: 'X', mark: 'X', url: 'https://x.com/TheObiLeonard', alt: 'X: @TheObiLeonard' },
  { id: 'linkedin', handle: 'in/elvisobi', label: 'LinkedIn', mark: 'in', url: 'https://www.linkedin.com/in/elvisobi', alt: 'LinkedIn: in/elvisobi' },
  { id: 'contra', handle: 'contra.com/elvisobi', label: 'Contra', mark: 'C', url: 'https://contra.com/elvisobi', alt: 'Contra: elvisobi' },
  { id: 'letter', row: true, handle: 'contact@elvisobi.com', label: 'Write a letter', mark: '@', url: 'mailto:contact@elvisobi.com?subject=A%20letter%20for%20Elvis', alt: 'Email: contact@elvisobi.com' },
];


// The Chronicle: roles, newest first.
const CHRONICLE = [
  { role: 'Founder', mark: 'crown', house: 'Halfwings', url: 'https://x.com/HalfwingsInc', field: 'Software and hardware development for technology businesses', since: 2026 },
  { role: 'Co-founder', mark: 'pad', house: 'FiveBlooded', url: 'https://x.com/FiveBlooded', field: 'Games: Mazerance', since: 2025 },
  { role: 'Top Creator & Designer', mark: 'cup', house: 'Figma Config', url: 'https://www.youtube.com/watch?v=JUTFghsG8nI', field: 'Recognised at the opening keynote, one of ~60 worldwide', since: 2022 },
  { role: 'Mentor', mark: 'talk', house: 'ADPList and other platforms', url: 'https://adplist.org/mentors/elvis-obi', field: '500+ design students', since: 2022 },
  { role: 'Product Designer', mark: 'nib', house: 'Independent and studios', field: 'Products, brands and websites. Design Engineer since 2026, designing and building my own software', since: 2019 },
];

// The Armoury: tools in use. The full list lives in obileonardo/armoury (tools.json) and is read at build time;
// this copy is the fallback when that repository can't be reached. The Armoury, from the resume, the portfolio and the repos. Up to six per hall.
// An icon is a Simple Icons slug vendored in scripts/icons.json, or { mono } for a typographic mark
// (Adobe's logos aren't in Simple Icons).
const ARMOURY = [
  { hall: 'The Drawing Room', kind: 'design', tools: [['figma', 'Figma'], [{ mono: 'Ai' }, 'Illustrator'], [{ mono: 'Ps' }, 'Photoshop'], ['framer', 'Framer']] },
  { hall: 'The Workshop', kind: 'game & 3D', tools: [['unrealengine', 'Unreal Engine'], ['blender', 'Blender'], ['threedotjs', 'Three.js']] },
  { hall: 'The Forge', kind: 'code', tools: [['swift', 'Swift'], ['typescript', 'TypeScript'], ['rust', 'Rust'], ['nextdotjs', 'Next.js'], ['python', 'Python']] },
  { hall: 'The Keep', kind: 'infrastructure', tools: [['vercel', 'Vercel'], ['supabase', 'Supabase'], ['docker', 'Docker'], ['githubactions', 'GitHub Actions'], ['homeassistant', 'Home Assistant'], ['homebrew', 'Homebrew']] },
];

// Two looks share one layout:
//   clean (live): square cards, hairlines, soft neutral surfaces; Doto and Geist Mono.
//   pixel: Doto, stepped pixel frames, brass studs, dotted rules.
// Build the pixel look with `PROFILE_STYLE=pixel node scripts/build.mjs`; the workflow builds clean.
const STYLE = process.env.PROFILE_STYLE === 'pixel' ? 'pixel' : 'clean';
const PIXEL = STYLE === 'pixel';
const caps = (s) => (PIXEL ? s.toUpperCase() : s); // display names: all capitals in the pixel style, as written in clean
const ds = (n) => (PIXEL ? n : 0); // extra display letter spacing, pixel style only

const THEMES = PIXEL
  ? {
      // Paper and ink by day, indigo by night; cobalt and brass as the accents, matching the story.
      light: { bg: '#F4EFE6', edge: '#D9D3C6', ink: '#1C1A22', muted: '#5A5866', faint: '#B9B3A6', plate: '#EBE5D8', accent: '#2443C4', brass: '#8A6200' },
      dark: { bg: '#0A0C16', edge: '#232842', ink: '#F4EFE6', muted: '#9AA0B8', faint: '#3A3F5A', plate: '#11142A', accent: '#8FB0FF', brass: '#F2C86B' },
    }
  : {
      // Soft neutral surfaces with hairline borders, after the Linear, Notion and Tailscale picks; cobalt kept.
      light: { bg: '#FBFBFA', edge: '#E6E5E1', ink: '#18181B', muted: '#6B6A72', faint: '#C9C8C3', plate: '#F1F0EC', accent: '#2443C4', brass: '#8A6200' },
      dark: { bg: '#12151C', edge: '#262B36', ink: '#EDEDEF', muted: '#9198A6', faint: '#3A404D', plate: '#1A1F29', accent: '#8FB0FF', brass: '#E2C27A' },
    };

// ---------------------------------------------------------------- data

function token() {
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (t) return t;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('No GitHub token: set GITHUB_TOKEN or GH_TOKEN, or sign in with `gh auth login`.');
  }
}

async function graphql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token()}`, 'Content-Type': 'application/json', 'User-Agent': `${LOGIN}-profile-build` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GitHub GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data;
}

async function fetchData(now) {
  const year = now.getUTCFullYear();
  const from = new Date(Date.UTC(year, 0, 1)).toISOString();
  const repos = PROJECTS.filter((p) => p.repo);
  const repoFields = repos
    .map((p, i) => {
      const [owner, name] = p.repo.split('/');
      return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ...R }`;
    })
    .join('\n');
  const data = await graphql(
    `query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalPullRequestContributions
          contributionCalendar { totalContributions }
        }
        calendar: contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount contributionLevel } }
          }
        }
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
          nodes { stargazerCount }
        }
      }
      ${repoFields}
    }
    fragment R on Repository {
      url
      stargazerCount
      releases(first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes { tagName url publishedAt isDraft }
      }
    }`,
    { login: LOGIN, from, to: now.toISOString() },
  );

  const releases = [];
  const repoInfo = new Map();
  repos.forEach((p, i) => {
    const r = data[`r${i}`];
    if (!r) throw new Error(`Repository not found: ${p.repo}`);
    const published = r.releases.nodes.filter((n) => !n.isDraft && n.publishedAt);
    repoInfo.set(p.repo, { url: r.url, stars: r.stargazerCount, latest: published[0] ?? null });
    for (const n of published) releases.push({ project: p.name, mark: p.mark, ...n });
  });
  releases.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const cc = data.user.contributionsCollection;
  return {
    year,
    calendar: data.user.calendar.contributionCalendar,
    repoInfo,
    dispatches: releases.slice(0, 5),
    stats: [
      { label: 'Contributions', value: cc.contributionCalendar.totalContributions },
      { label: 'Commits', value: cc.totalCommitContributions },
      { label: 'Pull requests', value: cc.totalPullRequestContributions },
      { label: 'Releases', value: releases.filter((r) => r.publishedAt >= from).length },
      { label: 'Stars earned', value: data.user.repositories.nodes.reduce((s, n) => s + n.stargazerCount, 0) },
    ],
  };
}

// ---------------------------------------------------------------- type

// Doto (dot-matrix display) and Geist Mono (text and labels), both SIL Open Font License, instanced
// and subset into assets/fonts. metrics.json holds their advance widths for layout.
// The chosen pairing, in both styles: Doto for display, Geist Mono for text and labels.
const FONT_FILES = { display: 'doto-bold', text: 'geist-mono', label: 'geist-mono-semibold' };
const fonts = {};
let metrics;
let icons;

async function loadFonts() {
  metrics = JSON.parse(await readFile(path.join(ROOT, 'assets/fonts/metrics.json'), 'utf8'));
  icons = JSON.parse(await readFile(path.join(ROOT, 'scripts/icons.json'), 'utf8')).icons;
  for (const [key, file] of Object.entries(FONT_FILES)) {
    const b64 = (await readFile(path.join(ROOT, `assets/fonts/${file}.woff2`))).toString('base64');
    fonts[key] = { file, css: `@font-face{font-family:'${file}';src:url(data:font/woff2;base64,${b64}) format('woff2')}` };
  }
}

// Per-character x offsets, so letter spacing doesn't depend on SVG letter-spacing support.
function layout(str, font, size, spacing = 0) {
  const m = metrics[FONT_FILES[font]];
  const xs = [];
  let x = 0;
  for (const ch of str) {
    xs.push(x);
    x += ((m.w[ch] ?? m.upm * 0.55) / m.upm) * size + spacing;
  }
  return { xs, width: Math.max(0, x - spacing) };
}

const r1 = (n) => Math.round(n * 10) / 10;

function text(str, { font, size, x, y, fill, spacing = 0, anchor = 'start', cls = '', style = '' }) {
  const { xs, width } = layout(str, font, size, spacing);
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const xAttr = spacing ? xs.map((v) => r1(x0 + v)).join(' ') : r1(x0);
  return `<text class="${cls}" x="${xAttr}" y="${r1(y)}" font-family="${fonts[font].file}" font-size="${size}" fill="${fill}"${style ? ` style="${style}"` : ''}>${esc(str)}</text>`;
}

function fontCss(...keys) {
  return keys.map((k) => fonts[k].css).join('');
}

// ---------------------------------------------------------------- helpers

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function roman(n) {
  if (!Number.isInteger(n) || n <= 0 || n > 3999) return '';
  const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

const fmt = (n) => n.toLocaleString('en-GB');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// ---------------------------------------------------------------- pixel parts
//
// Every card, tile and badge is built from the same parts: a rectangle with stepped pixel corners,
// a one-pixel border, brass studs in the corners, and dotted rules. `p` is the size of one pixel.

const PX = 6;

function pixelShape(x, y, w, h, p, fill) {
  if (!PIXEL) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const X = x + w, Y = y + h;
  return `<path d="M${x + 2 * p} ${y}H${X - 2 * p}V${y + p}H${X - p}V${y + 2 * p}H${X}V${Y - 2 * p}H${X - p}V${Y - p}H${X - 2 * p}V${Y}H${x + 2 * p}V${Y - p}H${x + p}V${Y - 2 * p}H${x}V${y + 2 * p}H${x + p}V${y + p}Z" fill="${fill}"/>`;
}

function frame(W, H, t, p = PX, sw = 1) {
  if (!PIXEL) return `<rect x="${sw / 2}" y="${sw / 2}" width="${r1(W - sw)}" height="${r1(H - sw)}" fill="${t.bg}" stroke="${t.edge}" stroke-width="${sw}"/>`;
  const stud = (x, y) => `<rect x="${x}" y="${y}" width="${p}" height="${p}" fill="${t.brass}"/>`;
  return `${pixelShape(0, 0, W, H, p, t.edge)}${pixelShape(p, p, W - 2 * p, H - 2 * p, p, t.bg)}
  ${stud(2 * p, 2 * p)}${stud(W - 3 * p, 2 * p)}${stud(2 * p, H - 3 * p)}${stud(W - 3 * p, H - 3 * p)}`;
}

function dotRule(x0, x1, y, t, size = 4, gap = 6, sw = 1) {
  if (!PIXEL) return `<line x1="${r1(x0)}" y1="${r1(y + 1)}" x2="${r1(x1)}" y2="${r1(y + 1)}" stroke="${t.edge}" stroke-width="${sw}"/>`;
  let out = '';
  for (let x = x0; x <= x1 - size; x += size + gap) out += `<rect x="${r1(x)}" y="${r1(y)}" width="${size}" height="${size}" fill="${t.edge}"/>`;
  return out;
}

function dotColumn(x, y0, y1, t, size = 4, gap = 6) {
  if (!PIXEL) return `<line x1="${r1(x) + 1}" y1="${r1(y0)}" x2="${r1(x) + 1}" y2="${r1(y1)}" stroke="${t.edge}" stroke-width="1.5"/>`;
  let out = '';
  for (let y = y0; y <= y1 - size; y += size + gap) out += `<rect x="${r1(x)}" y="${r1(y)}" width="${size}" height="${size}" fill="${t.edge}"/>`;
  return out;
}

// A monogram: on a cobalt pixel block (pixel) or a soft rounded tile (clean).
function badge(x, y, size, mark, t, p = 5) {
  if (!PIXEL) {
    const f = mark.length > 1 ? size * 0.4 : size * 0.48;
    const font = size < 32 ? 'label' : 'display'; // Doto's dots blur below about 13px, so small badges use Geist Mono
    return `<rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" fill="${t.plate}" stroke="${t.edge}" stroke-width="1"/>
  ${text(mark, { font, size: r1(f), x: x + size / 2, y: y + size / 2 + f * 0.36, fill: t.accent, anchor: 'middle' })}`;
  }
  const fs = mark.length > 1 ? size * 0.42 : size * 0.52;
  return `${pixelShape(x, y, size, size, p, t.accent)}
  ${text(mark, { font: 'display', size: r1(fs), x: x + size / 2, y: y + size / 2 + fs * 0.36, fill: t.bg, anchor: 'middle' })}`;
}

function pixelStar(x, y, s, fill) {
  if (!PIXEL) {
    const cx = x + 2.5 * s, cy = y + 2.6 * s, R = 2.6 * s, r = 1.1 * s;
    const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; return `${r1(cx + rr * Math.cos(a))},${r1(cy + rr * Math.sin(a))}`; }).join(' ');
    return `<polygon points="${pts}" fill="${fill}" stroke-linejoin="round"/>`;
  }
  const rows = ['..#..', '.###.', '#####', '.###.', '.#.#.'];
  let out = '';
  rows.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') out += `<rect x="${x + i * s}" y="${y + j * s}" width="${s}" height="${s}" fill="${fill}"/>`; }));
  return out;
}

function wrapText(str, font, size, maxW) {
  const lines = [];
  let line = '';
  for (const word of str.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && layout(next, font, size).width > maxW) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const CSS_RISE = `.rise{opacity:0;animation:rise .6s cubic-bezier(.2,.7,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rise{animation:none;opacity:1}}`;

function svg(W, H, title, css, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${css}</style>
${body}
</svg>
`;
}

// ---------------------------------------------------------------- one scale for every card
//
// Every card is drawn in pixels as GitHub shows it in its 830px README column (a narrower screen scales the
// whole page down together). So one padding and one type scale hold everywhere: every card's content sits
// PAD in from its edges, and a line of body text is the same size in every section.
const COL = 830;
const PAD = 22; // inner padding of every card, the Keep panel's included
const TYPE = {
  heading: 22, // Doto: section titles
  figure: 26, // Doto: the year's total
  stat: 19, // Doto: the year's numbers, the Chronicle's years
  title: 17, // Doto: card titles
  body: 12.5, // Geist Mono: descriptions
  meta: 12, // Geist Mono: everything else
  label: 11, // Geist Mono semibold, in capitals, tracked
};
const TRACK = 1.3; // letter spacing of the capitals labels
const CAP = 0.72; // cap height as a share of the font size, for placing baselines
const LINE = 6; // the gap GitHub leaves under a row of inline images (its line box)
const colPx = (p) => (p / 100) * COL;
const capH = (size) => size * CAP;

// The largest size, down to `min`, at which `str` fits in `maxW`.
function fit(str, font, size, min, maxW, spacing = 0) {
  while (size > min && layout(str, font, size, spacing).width > maxW) size -= 0.25;
  return size;
}
const smallCaps = (str, o) => text(str.toUpperCase(), { font: 'label', size: TYPE.label, spacing: TRACK, ...o });

// ---------------------------------------------------------------- headings

// GitHub sets README text in its own font, so section titles are small images in the display face,
// shown at their own height so they stay the same size on a phone.
const HEADING_H = 30;
function heading(t, words) {
  const size = TYPE.heading, w = layout(words, 'display', size).width;
  return svg(r1(w + 2), HEADING_H, words, fontCss('display'), text(words, { font: 'display', size, x: 0, y: r1(HEADING_H / 2 + capH(size) / 2), fill: t.ink }));
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------- the ledger band
//
// The contribution chart and the year's numbers sit side by side in one band, like tiles in a bento
// grid, the same height.

const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Rows of cards side by side share one gap, drawn as a transparent margin inside each card (GitHub's word
// spacing varies), so every row lines up with both edges of the column like the full-width rows do.
const GAP = 1.6; // % of the column
const LEDGER_PCT = 72, YEAR_PCT = 100 - LEDGER_PCT - GAP;
const LEDGER_H = 206; // a quarter taller than the first chart
const cols = (n) => (100 - (n - 1) * GAP) / n; // width of each card in a row of n
const pct = (n) => `${Math.floor(n * 1000 + 1e-6) / 1000}%`; // floor, so a row never sums past 100% and wraps

function levelColours(t, dark) {
  const ramp = dark ? [0.22, 0.42, 0.66, 1] : [0.22, 0.45, 0.72, 1];
  const mixHex = (a, b, k) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - k) + parseInt(b.slice(1 + i, 3 + i), 16) * k).toString(16).padStart(2, '0')).join('');
  return [t.plate, ...ramp.map((k) => mixHex(t.bg, t.accent, k))];
}

function ledger(t, calendar, dark) {
  const W = colPx(LEDGER_PCT), H = LEDGER_H, mr = colPx(GAP), ms = TYPE.meta;
  const weeks = calendar.weeks.length;
  const left = PAD + layout('Wed', 'text', ms).width + 10;
  const step = (W - PAD - left) / (weeks - 0.2), cell = r1(step * 0.8), vstep = step * 1.18;
  const gridH = 6 * vstep + cell;
  const topY = PAD + capH(TYPE.figure), footY = H - PAD;
  const free = footY - capH(ms) - topY - (capH(ms) + 8 + gridH);
  const monthY = topY + free * 0.55 + capH(ms), gridY = monthY + 8;
  const colours = levelColours(t, dark);
  let squares = '', months = '', lastMonth = -1, lastX = -99;
  calendar.weeks.forEach((w, i) => {
    const x = r1(left + i * step);
    w.contributionDays.forEach((d) => {
      const day = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const lvl = Math.max(0, LEVELS.indexOf(d.contributionLevel));
      squares += `<rect x="${x}" y="${r1(gridY + day * vstep)}" width="${cell}" height="${cell}" fill="${colours[lvl]}"><title>${d.contributionCount} on ${d.date}</title></rect>`;
    });
    const m = new Date(`${w.contributionDays[0].date}T00:00:00Z`).getUTCMonth();
    if (m !== lastMonth && i < weeks - 2 && x - lastX > 30) { months += text(SHORT_MONTHS[m], { font: 'text', size: ms, x, y: monthY, fill: t.muted }); lastMonth = m; lastX = x; }
  });
  const dayLabels = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([d, l]) => text(l, { font: 'text', size: ms, x: PAD, y: gridY + d * vstep + cell / 2 + capH(ms) / 2, fill: t.muted })).join('');
  const moreX = W - PAD - layout('More', 'text', ms).width;
  const lx = moreX - 6 - (4 * step + cell), ly = r1(footY - capH(ms) / 2 - cell / 2);
  const legend = `${text('Less', { font: 'text', size: ms, x: lx - 6, y: footY, fill: t.muted, anchor: 'end' })}${colours.map((c, i) => `<rect x="${r1(lx + i * step)}" y="${ly}" width="${cell}" height="${cell}" fill="${c}"/>`).join('')}${text('More', { font: 'text', size: ms, x: moreX, y: footY, fill: t.muted })}`;
  const total = fmt(calendar.totalContributions);
  return svg(
    r1(W + mr), H, `${total} contributions in the last year.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 5)}
  ${text(total, { font: 'display', size: TYPE.figure, x: PAD, y: topY, fill: t.ink })}
  ${smallCaps('Contributions in the last year', { x: PAD + layout(total, 'display', TYPE.figure).width + 12, y: topY, fill: t.brass })}
  ${months}${dayLabels}${squares}
  ${text('github.com/obileonardo', { font: 'text', size: ms, x: PAD, y: footY, fill: t.accent })}
  ${legend}`,
  );
}

// The year's numbers, quietly: a small label, then one line per figure.
function yearTile(t, year, stats) {
  const W = colPx(YEAR_PCT), H = LEDGER_H, inner = W - 2 * PAD;
  const labelY = PAD + capH(TYPE.label), top = labelY + 6;
  const rowH = (H - PAD - top) / stats.length;
  const rows = stats.map((s, i) => {
    const y = top + rowH * (i + 1);
    const words = s.label.toLowerCase();
    const size = fit(fmt(s.value), 'display', TYPE.stat, 13, inner - layout(words, 'text', TYPE.meta).width - 10);
    const sep = i ? dotRule(PAD, W - PAD, r1(y - rowH / 2 - capH(size) / 2 - 1), t, 2, 8) : '';
    return `${sep}${text(fmt(s.value), { font: 'display', size, x: PAD, y, fill: t.ink })}
    ${text(words, { font: 'text', size: TYPE.meta, x: W - PAD, y, fill: t.muted, anchor: 'end' })}`;
  }).join('\n  ');
  const summary = stats.map((s) => `${fmt(s.value)} ${s.label.toLowerCase()}`).join(', ');
  return svg(
    r1(W), H, `${year} so far: ${summary}.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 5)}
  ${smallCaps(`Anno Domini ${roman(year)}`, { x: PAD, y: labelY, fill: t.brass })}
  ${rows}`,
  );
}

// ---------------------------------------------------------------- the armoury: one wall of tools

const ARMOURY_REPO = 'obileonardo/armoury';
const ARMOURY_URL = `https://github.com/${ARMOURY_REPO}`;
const ARMOURY_SLOTS = 18; // two rows of nine; with more tools than that, the last tile counts the rest

// The tools to show: the featured ones from the armoury repository, in its order, and how many more it holds.
async function loadArmoury() {
  try {
    // ARMOURY_FILE=path/to/tools.json previews a local copy instead.
    let cfg;
    if (process.env.ARMOURY_FILE) cfg = JSON.parse(await readFile(process.env.ARMOURY_FILE, 'utf8'));
    else {
      const res = await fetch(`https://api.github.com/repos/${ARMOURY_REPO}/contents/tools.json`, {
        headers: { authorization: `Bearer ${token()}`, accept: 'application/vnd.github.raw+json', 'user-agent': 'profile-build' },
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      cfg = await res.json();
    }
    const featured = cfg.tools.filter((x) => x.featured).slice(0, ARMOURY_SLOTS);
    return {
      kinds: cfg.kinds.filter((k) => cfg.tools.some((x) => x.kind === k)),
      tools: featured.map((x) => [x.icon, x.name]),
      total: cfg.tools.length,
      names: cfg.tools.map((x) => x.name),
    };
  } catch (err) {
    console.warn(`Armoury: using the local list (${err.message}).`);
    const tools = ARMOURY.flatMap((r) => r.tools);
    return { kinds: ARMOURY.map((r) => r.kind), tools, total: tools.length, names: tools.map(([, l]) => l) };
  }
}

function armoury(t, A) {
  // With more tools than tiles, the last tile says how many more there are; the whole card links to the list.
  const shown = A.total > ARMOURY_SLOTS ? A.tools.slice(0, ARMOURY_SLOTS - 1) : A.tools.slice(0, ARMOURY_SLOTS);
  const more = A.total - shown.length;
  const tools = more > 0 ? [...shown, [{ more }, 'more']] : shown;
  const n = 9, W = COL, cellW = (W - 2 * PAD) / n, box = 40, ms = 11.5, lh = 14;
  const names = tools.map(([, l]) => (layout(l, 'text', ms).width > cellW - 8 ? wrapText(l, 'text', ms, cellW - 8) : [l]));
  const most = Math.max(...names.map((l) => l.length));
  const headY = PAD + capH(TYPE.label), top = headY + 22;
  const textH = 14 + capH(ms) + (most - 1) * lh; // from the bottom of an icon to the last line of its name
  const rowH = box + textH + 22, rows = Math.ceil(tools.length / n);
  const H = r1(top + (rows - 1) * rowH + box + textH + PAD);
  const cells = tools.map(([icon, label], i) => {
    const cx = PAD + cellW * ((i % n) + 0.5), y0 = top + Math.floor(i / n) * rowH;
    const mark = typeof icon === 'string' && icons[icon] ? null : icon?.more ? `+${icon.more}` : icon?.mono ?? label.slice(0, 2);
    const glyph = mark
      ? text(mark, { font: 'display', size: 15, x: cx, y: y0 + box / 2 + capH(15) / 2, fill: icon?.more ? t.accent : t.ink, anchor: 'middle' })
      : `<path transform="translate(${r1(cx - 10)} ${y0 + 10}) scale(${r1((20 / 24) * 1000) / 1000})" d="${icons[icon]}" fill="${t.ink}"/>`;
    const words = names[i].map((l, k) => text(l, { font: 'text', size: ms, x: cx, y: y0 + box + 14 + capH(ms) + k * lh, fill: icon?.more ? t.accent : t.ink, anchor: 'middle' })).join('');
    return `<g class="rise" style="animation-delay:${r1(0.05 + i * 0.03)}s">${pixelShape(r1(cx - box / 2), y0, box, box, 4, t.edge)}${pixelShape(r1(cx - box / 2 + 1), y0 + 1, box - 2, box - 2, 4, t.plate)}
    ${glyph}${words}</g>`;
  });
  const halls = A.kinds.join(' · ');
  return svg(
    W, H, armouryAlt(A), `${fontCss('display', 'text', 'label')}\n${CSS_RISE}`,
    `${frame(W, H, t)}
  <defs><pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><rect x="7.25" y="7.25" width="1.5" height="1.5" fill="${t.edge}"/></pattern></defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="url(#grid)" opacity=".7"/>
  ${smallCaps('Tools of the trade', { x: PAD, y: headY, fill: t.brass })}
  ${text(halls, { font: 'text', size: TYPE.meta, x: W - PAD, y: headY, fill: t.muted, anchor: 'end' })}
  ${cells.join('\n  ')}`,
  );
}

const armouryAlt = (A) => `The Armoury, ${A.total} tools: ${A.names.join(', ')}. The full list, with how each is used, is at ${ARMOURY_REPO}.`;

// ---------------------------------------------------------------- the arsenal: small project cards

const BADGE = 34;
const PROJECT_W = colPx(cols(3));
// Every card is as tall as the one with the longest description, so the rows stay even.
const projectLines = () => Math.max(...PROJECTS.map((p) => wrapText(p.short ?? p.what, 'text', TYPE.body, PROJECT_W - 2 * PAD).length));

function projectCard(t, p, info, { right = false, below = false, lines = 2 } = {}) {
  const W = PROJECT_W, inner = W - 2 * PAD, x = PAD + BADGE + 12, lh = 19;
  const mr = right ? colPx(GAP) : 0, mb = below ? colPx(GAP) - LINE : 0;
  const name = caps(p.name);
  const ns = fit(name, 'display', TYPE.title, 13, W - PAD - x, ds(0.5));
  const descY = PAD + BADGE + 18 + capH(TYPE.body);
  const desc = wrapText(p.short ?? p.what, 'text', TYPE.body, inner);
  const ruleY = descY + (lines - 1) * lh + 14;
  const footY = ruleY + 14 + capH(TYPE.meta), H = r1(footY + PAD);
  // The footer: what it's built with on the left; its stars and latest release, or its standing, on the right.
  const ver = info?.latest?.tagName ?? '', stars = info?.stars ? String(info.stars) : '';
  const rightW = (fs) => (info?.stars || info?.latest
    ? (stars ? 10 + 5 + layout(stars, 'text', fs).width : 0) + (stars && ver ? 12 : 0) + (ver ? layout(ver, 'text', fs).width : 0)
    : layout(p.standing ?? '', 'text', fs).width);
  let fs = TYPE.meta;
  while (fs > 10.5 && layout(p.built, 'text', fs).width + rightW(fs) + 16 > inner) fs -= 0.25;
  let standing;
  if (info?.stars || info?.latest) {
    const verX = W - PAD - (ver ? layout(ver, 'text', fs).width : 0);
    const starsX = verX - (ver && stars ? 12 : 0) - (stars ? layout(stars, 'text', fs).width : 0);
    standing = `${stars ? `${pixelStar(r1(starsX - 15), r1(footY - capH(fs) / 2 - 5.2), 2, t.brass)}${text(stars, { font: 'text', size: fs, x: starsX, y: footY, fill: t.ink })}` : ''}${ver ? text(ver, { font: 'text', size: fs, x: W - PAD, y: footY, fill: t.brass, anchor: 'end' }) : ''}`;
  } else {
    standing = text(p.standing ?? '', { font: 'text', size: fs, x: W - PAD, y: footY, fill: t.muted, anchor: 'end' });
  }
  return svg(
    r1(W + mr), r1(H + mb), `${p.name}: ${p.what} Built with ${p.built}. ${p.get.label}.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 4)}
  ${badge(PAD, PAD, BADGE, p.mark ?? p.name[0], t, 4)}
  ${text(name, { font: 'display', size: ns, spacing: ds(0.5), x, y: PAD + capH(ns), fill: t.ink })}
  ${smallCaps(`→ ${p.get.label}`, { x, y: PAD + BADGE, fill: t.accent })}
  ${desc.map((l, i) => text(l, { font: 'text', size: TYPE.body, x: PAD, y: descY + i * lh, fill: t.muted })).join('\n  ')}
  ${dotRule(PAD, W - PAD, ruleY, t, 3, 7)}
  ${text(p.built, { font: 'text', size: fs, x: PAD, y: footY, fill: t.muted })}
  ${standing}`,
  );
}

// ---------------------------------------------------------------- the chronicle: a ledger of roles

// A mark for each role, drawn on a 10 by 10 grid of square dots like the Keep's tiles: cobalt, with brass details.
const MARKS = {
  crown: ['..........', '..........', '.i..ii..i.', '.ii.ii.ii.', '.iiiiiiii.', '.iiiiiiii.', '.ibiiiibi.', '.iiiiiiii.', '..........', '..........'],
  cup: ['..........', '.iiiiiiii.', 'ii.iiii.ii', 'ii.iiii.ii', '.iiiiiiii.', '..iiiiii..', '....ii....', '...iiii...', '..iibbii..', '..........'],
  nib: ['....ii....', '...iiii...', '..iiiiii..', '..ii..ii..', '..i.bb.i..', '..ii..ii..', '...iiii...', '....ii....', '....ii....', '..........'],
  talk: ['..........', '.iiiiiiii.', '.i......i.', '.i.bbbb.i.', '.i......i.', '.i.bbb..i.', '.iiiiiiii.', '..ii......', '..i.......', '..........'],
  pad: ['..........', '..........', '.iiiiiiii.', 'ii.iiiibii', 'i...iiiiii', 'ii.iiibiii', 'iiiiiiiiii', 'ii......ii', '..........', '..........'],
};
// Large marks sit on a small tile; at text size the dots stand alone, filling the mark, so they stay legible.
function roleMark(t, key, x, y, size) {
  const tile = size >= 24, inset = tile ? size * 0.12 : 0, s = (size - 2 * inset) / 10, d = tile ? 0.72 : 0.8;
  let out = tile ? `<rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" fill="${t.plate}" stroke="${t.edge}" stroke-width="1"/>` : '';
  MARKS[key].forEach((row, j) => [...row].forEach((c, i) => {
    if (c !== '.') out += `<rect x="${r1(x + inset + i * s)}" y="${r1(y + inset + j * s)}" width="${r1(s * d)}" height="${r1(s * d)}" fill="${c === 'b' ? t.brass : t.accent}"/>`;
  }));
  return out;
}

// Newest first, one row per role: the year, the role with its mark and a line about it, and where, linked.
// The mark and its words are one piece in the Role column: the mark sits on the row's line, centred on the
// role's name, and the line about it hangs under the name.
function timeline(t) {
  const items = [...CHRONICLE].sort((a, b) => b.since - a.since);
  const W = COL, size = 17, xMark = PAD + 62, xRole = xMark + size + 10, noteW = 330, lh = 16;
  const headY = PAD + capH(TYPE.label);
  const parts = [
    smallCaps('Since', { x: PAD, y: headY, fill: t.muted }),
    smallCaps('Role', { x: xMark, y: headY, fill: t.muted }),
    smallCaps('Where', { x: W - PAD, y: headY, fill: t.muted, anchor: 'end' }),
  ];
  let y = headY + 14;
  parts.push(dotRule(PAD, W - PAD, y, t));
  items.forEach((c, i) => {
    const note = wrapText(c.field, 'text', TYPE.meta, noteW);
    const top = y + 18, base = top + capH(TYPE.title);
    parts.push(text(String(c.since), { font: 'text', size: TYPE.meta, x: PAD, y: r1(base), fill: i === 0 ? t.brass : t.muted }));
    if (MARKS[c.mark]) parts.push(roleMark(t, c.mark, xMark, r1(base - capH(TYPE.title) / 2 - size / 2), size));
    parts.push(text(caps(c.role), { font: 'display', size: TYPE.title, spacing: ds(0.6), x: xRole, y: r1(base), fill: t.ink }));
    note.forEach((l, j) => parts.push(text(l, { font: 'text', size: TYPE.meta, x: xRole, y: r1(base + 21 + j * lh), fill: t.muted })));
    parts.push(text(c.url ? `${c.house} →` : c.house, { font: 'text', size: TYPE.meta, x: W - PAD, y: r1(base), fill: c.url ? t.accent : t.muted, anchor: 'end' }));
    y = base + 21 + (note.length - 1) * lh + 16;
    if (i < items.length - 1) parts.push(dotRule(PAD, W - PAD, y, t));
  });
  const H = r1(y - 16 + PAD);
  return svg(
    W, H, `The Chronicle, newest first: ${items.map((c) => `${c.since}, ${c.role}, ${c.house}: ${c.field}`).join('; ')}.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t)}\n  ${parts.join('\n  ')}`,
  );
}

// ---------------------------------------------------------------- slim full-width rows

// One row of a list: Latest Dispatches, and the letter in Elsewhere.
const ROW_H = 46, ROW_BADGE = 24;
function row(t, title, { left = '', mark, name, after = '', afterFill, right }) {
  const W = COL, H = ROW_H, y = r1(H / 2 + capH(TYPE.meta) / 2);
  const bx = left ? PAD + layout(left, 'text', TYPE.meta).width + 22 : PAD;
  const nx = bx + ROW_BADGE + 12, nameW = layout(name, 'display', TYPE.title, ds(0.6)).width;
  return svg(
    W, H, title, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 3)}
  ${left ? text(left, { font: 'text', size: TYPE.meta, x: PAD, y, fill: t.muted }) : ''}
  ${badge(r1(bx), (H - ROW_BADGE) / 2, ROW_BADGE, mark, t, 3)}
  ${text(name, { font: 'display', size: TYPE.title, spacing: ds(0.6), x: r1(nx), y: r1(H / 2 + capH(TYPE.title) / 2), fill: t.ink })}
  ${after ? text(after, { font: 'text', size: TYPE.meta, x: r1(nx + nameW + 12), y, fill: afterFill }) : ''}
  ${text(right, { font: 'text', size: TYPE.meta, x: W - PAD, y, fill: t.accent, anchor: 'end' })}`,
  );
}

function dispatchRow(t, r) {
  return row(t, `${r.project} ${r.tagName}, released ${longDate(r.publishedAt)}.`, {
    left: r.publishedAt.slice(0, 10), mark: r.mark ?? r.project[0], name: caps(r.project), after: r.tagName, afterFill: t.brass, right: 'release notes →',
  });
}

function dispatchAlt(list) {
  if (!list.length) return 'Latest dispatches: no releases yet.';
  return `Latest dispatches: ${list.map((r) => `${r.project} ${r.tagName}, ${longDate(r.publishedAt)}`).join('; ')}.`;
}

// ---------------------------------------------------------------- elsewhere: link cards, then the letter

const LINKS = SEALS.filter((s) => !s.row), LETTER = SEALS.find((s) => s.row);
function seal(t, s, { right = false, below = false } = {}) {
  const W = colPx(cols(LINKS.length)), inner = W - 2 * PAD, mark = 30;
  const mr = right ? colPx(GAP) : 0, mb = below ? colPx(GAP) - LINE : 0;
  const ls = fit(caps(s.label), 'display', TYPE.title, 13, inner, ds(0.6));
  const hs = fit(s.handle, 'text', TYPE.meta, 10.5, inner);
  const labelY = PAD + mark + 20 + capH(TYPE.title), handleY = labelY + 18, H = r1(handleY + PAD);
  return svg(
    r1(W + mr), r1(H + mb), s.alt, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 4)}
  ${badge(PAD, PAD, mark, s.mark, t, 4)}
  ${text('→', { font: 'text', size: 16, x: W - PAD, y: r1(PAD + mark / 2 + capH(16) / 2), fill: t.accent, anchor: 'end' })}
  ${text(caps(s.label), { font: 'display', size: ls, spacing: ds(0.6), x: PAD, y: r1(labelY), fill: t.ink })}
  ${text(s.handle, { font: 'text', size: hs, x: PAD, y: r1(handleY), fill: t.muted })}`,
  );
}

function letterRow(t, s) {
  return row(t, s.alt, { mark: s.mark, name: caps(s.label), right: `${s.handle} →` });
}

// ---------------------------------------------------------------- markdown

function picture(base, alt, attrs = 'width="100%"') {
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${esc(alt)}" src="${base}-light.svg" ${attrs}></picture>`;
}

const linked = (href, inner) => (href ? `<a href="${esc(href)}">${inner}</a>` : inner);

function ledgerBand() {
  return `<p>${linked('https://github.com/obileonardo?tab=repositories', picture('assets/ledger', 'Contribution chart: a year of contributions, one square per day, brighter for busier days.', `width="${pct(LEDGER_PCT + GAP)}"`))}${picture('assets/year', "This year's numbers: contributions, commits, pull requests, releases and stars.", `width="${pct(YEAR_PCT)}"`)}</p>`;
}

function arsenal() {
  const card = (p, i) => linked(p.get.url, picture(`assets/arsenal/${slug(p.name)}`, `${p.name}: ${p.what}`, `width="${pct(cols(3) + (i % 3 < 2 ? GAP : 0))}"`));
  const rows = [];
  for (let i = 0; i < PROJECTS.length; i += 3) rows.push(PROJECTS.slice(i, i + 3).map((p, k) => card(p, i + k)).join(''));
  return `<p>\n${rows.join('<br>\n')}\n</p>`;
}

function chronicle() {
  return linked('https://www.linkedin.com/in/elvisobi', picture('assets/chronicle', `The Chronicle: ${CHRONICLE.map((c) => `${c.since}, ${c.role}, ${c.house}`).join('; ')}.`));
}

function dispatches(list) {
  if (!list.length) return '<p><i>No dispatches yet.</i></p>';
  return list.map((r, i) => linked(r.url, picture(`assets/dispatches/${i}`, `${r.project} ${r.tagName}, ${longDate(r.publishedAt)}`))).join('\n');
}

function headingPicture(h) {
  const base = `assets/headings/${slug(h)}`;
  return `<h3><picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${esc(h)}" src="${base}-light.svg" height="${HEADING_H}"></picture></h3>`;
}

function seals() {
  const cards = LINKS.map((s, i) => linked(s.url, picture(`assets/seals/${s.id}`, s.alt, `width="${pct(cols(LINKS.length) + (i < LINKS.length - 1 ? GAP : 0))}"`))).join('');
  return `<p>\n${cards}${LETTER ? `<br>\n${linked(LETTER.url, picture(`assets/seals/${LETTER.id}`, LETTER.alt))}` : ''}\n</p>`;
}

// ---------------------------------------------------------------- main

// --hourly refreshes everything except the year-in-review card, whose contribution count changes with
// nearly every commit; that card refreshes once a day so the bot doesn't commit every hour.
const HOURLY = process.argv.includes('--hourly');

async function main() {
  await loadFonts();
  const template = await readFile(path.join(ROOT, 'README.template.md'), 'utf8');
  const HEADINGS = [...template.matchAll(/^#{3,4} (?:❦ )?(.+)$/gm)].map((m) => m[1]);
  const data = await fetchData(new Date());
  const A = await loadArmoury();
  const files = new Map();

  for (const [name, t] of Object.entries(THEMES)) {
    for (const h of HEADINGS) files.set(`assets/headings/${slug(h)}-${name}.svg`, heading(t, h));
    if (!HOURLY) files.set(`assets/year-${name}.svg`, yearTile(t, data.year, data.stats));
    if (!HOURLY) files.set(`assets/ledger-${name}.svg`, ledger(t, data.calendar, name === 'dark'));
    data.dispatches.forEach((r, i) => files.set(`assets/dispatches/${i}-${name}.svg`, dispatchRow(t, r)));
    PROJECTS.forEach((p, i) => files.set(`assets/arsenal/${slug(p.name)}-${name}.svg`, projectCard(t, p, p.repo ? data.repoInfo.get(p.repo) : null, { right: i % 3 < 2, below: i < PROJECTS.length - 3, lines: projectLines() })));
    files.set(`assets/chronicle-${name}.svg`, timeline(t));
    files.set(`assets/armoury-${name}.svg`, armoury(t, A));
    LINKS.forEach((s, i) => files.set(`assets/seals/${s.id}-${name}.svg`, seal(t, s, { right: i < LINKS.length - 1, below: !!LETTER })));
    if (LETTER) files.set(`assets/seals/${LETTER.id}-${name}.svg`, letterRow(t, LETTER));
  }

  // Hold the Keep: the board as it stands. Moves themselves are played by scripts/keep/play.mjs.
  const state = await loadState();
  files.set('game/state.json', `${JSON.stringify(state, null, 1)}\n`);
  const keep = keepBoard(state, THEMES, { text, layout, fontCss, svg, frame, dotRule, pixelStar, wrapText, fit, TYPE, PAD, TRACK, CAP, COL, style: STYLE });
  for (const [rel, content] of keep.files) files.set(rel, content);

  const readme = template
    .replace(/^#{3,4} (?:❦ )?(.+)$/gm, (_, h) => headingPicture(h))
    .replace('{{LEDGER}}', ledgerBand())
    .replace('{{ARSENAL}}', arsenal())
    .replace('{{DISPATCHES}}', dispatches(data.dispatches))
    .replace('{{CHRONICLE}}', chronicle())
    .replace('{{ARMOURY}}', linked(ARMOURY_URL, picture('assets/armoury', armouryAlt(A))))
    .replace('{{SEALS}}', seals())
    .replace('{{KEEP}}', () => keep.markdown);
  const leftover = readme.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) throw new Error(`Unfilled placeholder in README.template.md: ${leftover[0]}`);
  // Content-hashed file names, so GitHub's image cache can never mix old and new versions.
  const svgs = new Map([...files].filter(([rel]) => rel.endsWith('.svg')));
  const hashed = hashNames(svgs, readme);
  for (const rel of svgs.keys()) files.delete(rel);
  for (const [rel, content] of hashed.files) files.set(rel, content);
  // Cards this run skipped (the hourly run leaves the year's numbers alone) keep the names they have now.
  const current = existsSync(path.join(ROOT, 'README.md')) ? readFileSync(path.join(ROOT, 'README.md'), 'utf8') : '';
  const final = hashed.md.replace(/assets\/([A-Za-z0-9_\/-]+?)\.svg/g, (p, base) => {
    if (/\.[0-9a-f]{8}$/.test(base)) return p;
    const prev = current.match(new RegExp(`assets/${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[0-9a-f]{8}\\.svg`));
    return prev ? prev[0] : p;
  });
  files.set('README.md', `<!-- Generated by scripts/build.mjs from README.template.md. Edit the template, not this file. -->\n\n${final}`);

  // Write only after everything built, so a failed fetch never leaves half-updated files.
  for (const dir of ['assets/seals', 'assets/keep', 'assets/headings', 'assets/arsenal', 'assets/chronicle', 'assets/dispatches', 'game']) await mkdir(path.join(ROOT, dir), { recursive: true });
  for (const [rel, content] of files) await writeFile(path.join(ROOT, rel), content);
  await pruneUnused(final, ['assets', 'assets/seals', 'assets/keep', 'assets/headings', 'assets/arsenal', 'assets/chronicle', 'assets/dispatches']);
  console.log(`Built ${files.size} files. ${data.stats.map((s) => `${s.label}: ${s.value}`).join(', ')}`);
}

export { STYLE, PROJECTS, THEMES, fetchData, loadFonts, layout, text, fontCss, svg, esc, r1, roman, longDate, fmt, frame, dotRule, pixelStar, wrapText, fit, TYPE, PAD, TRACK, CAP, COL };

// Run only when executed directly, so other scripts can import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
