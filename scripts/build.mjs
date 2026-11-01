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
import { loadState, prunePanels } from './keep/play.mjs';
import { board as keepBoard, versionUrls } from './keep/render.mjs';
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
  { id: 'letter', handle: 'contact@elvisobi.com', label: 'Write a letter', mark: '@', url: 'mailto:contact@elvisobi.com?subject=A%20letter%20for%20Elvis', alt: 'Email: contact@elvisobi.com' },
];


// The Chronicle: roles, newest first.
const CHRONICLE = [
  { role: 'Founder', house: 'Halfwings', url: 'https://x.com/HalfwingsInc', field: 'Software and hardware development for technology businesses', since: 2026 },
  { role: 'Co-founder', house: 'FiveBlooded', url: 'https://x.com/FiveBlooded', field: 'Games: Mazerance', since: 2025 },
  { role: 'Top Creator & Designer', house: 'Figma Config', url: 'https://www.youtube.com/watch?v=JUTFghsG8nI', field: 'Recognised at the opening keynote, one of ~60 worldwide', since: 2022 },
  { role: 'Mentor', house: 'ADPList and other platforms', url: 'https://adplist.org/mentors/elvis-obi', field: '500+ design students', since: 2022 },
  { role: 'Product Designer', house: 'Independent and studios', field: 'Products, brands and websites. Design Engineer since 2026, designing and building my own software', since: 2019 },
];

// The Armoury: tools in use, from the resume, the portfolio and the repos. Up to six per hall.
// An icon is a Simple Icons slug vendored in scripts/icons.json, or { mono } for a typographic mark
// (Adobe's logos aren't in Simple Icons).
const ARMOURY = [
  { hall: 'The Drawing Room', kind: 'design', tools: [['figma', 'Figma'], [{ mono: 'Ai' }, 'Illustrator'], [{ mono: 'Ps' }, 'Photoshop'], ['framer', 'Framer']] },
  { hall: 'The Workshop', kind: 'game & 3D', tools: [['unrealengine', 'Unreal Engine'], ['blender', 'Blender'], ['threedotjs', 'Three.js']] },
  { hall: 'The Forge', kind: 'code', tools: [['swift', 'Swift'], ['typescript', 'TypeScript'], ['rust', 'Rust'], ['nextdotjs', 'Next.js'], ['python', 'Python']] },
  { hall: 'The Keep', kind: 'infrastructure', tools: [['vercel', 'Vercel'], ['supabase', 'Supabase'], ['docker', 'Docker'], ['githubactions', 'GitHub Actions'], ['homeassistant', 'Home Assistant'], ['homebrew', 'Homebrew']] },
];

// Two looks share one layout:
//   clean (live): Geist, rounded cards, hairlines, soft neutral surfaces.
//   pixel: Doto, stepped pixel frames, brass studs, dotted rules.
// Build the pixel look with `PROFILE_STYLE=pixel node scripts/build.mjs`; the workflow builds clean.
const STYLE = process.env.PROFILE_STYLE === 'pixel' ? 'pixel' : 'clean';
const PIXEL = STYLE === 'pixel';
const caps = (s) => (PIXEL ? s.toUpperCase() : s); // display names: capitals in Doto, as written in Geist
const ds = (n) => (PIXEL ? n : 0); // display letter spacing: Doto's dots want air, Geist doesn't

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
const FONT_FILES = PIXEL
  ? { display: 'doto-bold', text: 'geist-mono', label: 'geist-mono-semibold' }
  : { display: 'geist-semibold', text: 'geist-regular', label: 'geist-mono-semibold' };
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
  if (!PIXEL) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(14, Math.max(6, p * 2.2))}" fill="${fill}"/>`;
  const X = x + w, Y = y + h;
  return `<path d="M${x + 2 * p} ${y}H${X - 2 * p}V${y + p}H${X - p}V${y + 2 * p}H${X}V${Y - 2 * p}H${X - p}V${Y - p}H${X - 2 * p}V${Y}H${x + 2 * p}V${Y - p}H${x + p}V${Y - 2 * p}H${x}V${y + 2 * p}H${x + p}V${y + p}Z" fill="${fill}"/>`;
}

function frame(W, H, t, p = PX) {
  if (!PIXEL) return `<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="16" fill="${t.bg}" stroke="${t.edge}" stroke-width="1.5"/>`;
  const stud = (x, y) => `<rect x="${x}" y="${y}" width="${p}" height="${p}" fill="${t.brass}"/>`;
  return `${pixelShape(0, 0, W, H, p, t.edge)}${pixelShape(p, p, W - 2 * p, H - 2 * p, p, t.bg)}
  ${stud(2 * p, 2 * p)}${stud(W - 3 * p, 2 * p)}${stud(2 * p, H - 3 * p)}${stud(W - 3 * p, H - 3 * p)}`;
}

function dotRule(x0, x1, y, t, size = 4, gap = 6) {
  if (!PIXEL) return `<line x1="${r1(x0)}" y1="${r1(y) + 1}" x2="${r1(x1)}" y2="${r1(y) + 1}" stroke="${t.edge}" stroke-width="1.5"/>`;
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
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r1(size * 0.26)}" fill="${t.plate}" stroke="${t.edge}" stroke-width="1.5"/>
  ${text(mark, { font: 'display', size: r1(f), x: x + size / 2, y: y + size / 2 + f * 0.36, fill: t.accent, anchor: 'middle' })}`;
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

// ---------------------------------------------------------------- headings

// GitHub sets README text in its own font, so section titles are small images in the display face.
// Each is sized to its words and shown at a fixed height, so it stays the same size on a phone.
const HEADING_H = 60;
function heading(t, label) {
  if (!PIXEL) {
    const w = layout(label, 'display', 34).width;
    return svg(Math.ceil(w + 6), HEADING_H, label, fontCss('display'), `${text(label, { font: 'display', size: 34, x: 0, y: HEADING_H / 2 + 12, fill: t.ink })}`);
  }
  const size = 40, pad = 34;
  const w = layout(label, 'display', size, 1).width;
  const W = Math.ceil(pad + w + 6);
  return svg(
    W, HEADING_H, label, fontCss('display'),
    `<rect x="2" y="${HEADING_H / 2 - 9}" width="14" height="14" fill="${t.accent}"/>
  ${text(label, { font: 'display', size, spacing: 1, x: pad, y: HEADING_H / 2 + 14, fill: t.ink })}`,
  );
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------- the ledger band
//
// The contribution chart and the year's numbers sit side by side in one band, like tiles in a bento
// grid. The chart sets the band's height; the numbers tile is drawn to the same rendered height.

const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEDGER_PCT = 63, YEAR_PCT = 35;
const L = { cell: 11, gap: 3, pad: 26, days: 34, top: 92, foot: 46 };

function levelColours(t, dark) {
  const ramp = dark ? [0.22, 0.42, 0.66, 1] : [0.22, 0.45, 0.72, 1];
  const mixHex = (a, b, k) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - k) + parseInt(b.slice(1 + i, 3 + i), 16) * k).toString(16).padStart(2, '0')).join('');
  return [t.plate, ...ramp.map((k) => mixHex(t.bg, t.accent, k))];
}

function ledgerSize(calendar) {
  const step = L.cell + L.gap;
  return { W: L.pad + L.days + calendar.weeks.length * step - L.gap + L.pad, H: L.top + 7 * step - L.gap + L.foot };
}

function ledger(t, calendar, dark) {
  const { cell, gap, pad, days: dw, top } = L;
  const step = cell + gap, left = pad + dw;
  const { W, H } = ledgerSize(calendar);
  const colours = levelColours(t, dark);
  let squares = '', months = '', lastMonth = -1;
  calendar.weeks.forEach((w, i) => {
    const x = left + i * step;
    w.contributionDays.forEach((d) => {
      const day = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const lvl = Math.max(0, LEVELS.indexOf(d.contributionLevel));
      squares += `<rect x="${x}" y="${top + day * step}" width="${cell}" height="${cell}" rx="1.5" fill="${colours[lvl]}"><title>${d.contributionCount} on ${d.date}</title></rect>`;
    });
    const m = new Date(`${w.contributionDays[0].date}T00:00:00Z`).getUTCMonth();
    if (m !== lastMonth && i < calendar.weeks.length - 2) { months += text(SHORT_MONTHS[m], { font: 'text', size: 12, x, y: top - 9, fill: t.muted }); lastMonth = m; }
  });
  const dayLabels = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([d, l]) => text(l, { font: 'text', size: 11, x: pad, y: top + d * step + 9, fill: t.muted })).join('');
  const ly = top + 7 * step + 16;
  const lx = W - pad - 5 * step - 34;
  const legend = `${text('Less', { font: 'text', size: 11, x: lx - 6, y: ly + 9, fill: t.muted, anchor: 'end' })}${colours.map((c, i) => `<rect x="${lx + i * step}" y="${ly}" width="${cell}" height="${cell}" rx="1.5" fill="${c}"/>`).join('')}${text('More', { font: 'text', size: 11, x: lx + 5 * step + 3, y: ly + 9, fill: t.muted })}`;
  const total = fmt(calendar.totalContributions);
  return svg(
    W, H, `${total} contributions in the last year.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 5)}
  ${text(total, { font: 'display', size: 30, spacing: ds(1), x: pad, y: 52, fill: t.ink })}
  ${text('CONTRIBUTIONS IN THE LAST YEAR', { font: 'label', size: 11.5, spacing: 2, x: pad + layout(total, 'display', 30, 1).width + 14, y: 50, fill: t.brass })}
  ${months}${dayLabels}${squares}
  ${text('github.com/obileonardo', { font: 'text', size: 11, x: pad, y: ly + 9, fill: t.accent })}
  ${legend}`,
  );
}

// The year's numbers, quietly: a small label, then one line per figure.
function yearTile(t, year, stats, calendar) {
  const lg = ledgerSize(calendar);
  const W = 460, H = Math.round((lg.H / lg.W) * (LEDGER_PCT / YEAR_PCT) * W);
  const pad = 28, top = 70;
  const rowH = (H - top - 18) / stats.length;
  const size = Math.min(24, rowH * 0.72);
  const rows = stats.map((s, i) => {
    const y = top + rowH * (i + 0.72);
    const sep = i ? dotRule(pad, W - pad, r1(top + rowH * i - 2), t, 2, 8) : '';
    return `${sep}${text(fmt(s.value), { font: 'display', size: r1(size), spacing: ds(0.5), x: pad, y: r1(y), fill: t.ink })}
    ${text(s.label.toLowerCase(), { font: 'text', size: 13, x: W - pad, y: r1(y - 2), fill: t.muted, anchor: 'end' })}`;
  }).join('\n  ');
  const summary = stats.map((s) => `${fmt(s.value)} ${s.label.toLowerCase()}`).join(', ');
  return svg(
    W, H, `${year} so far: ${summary}.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 5)}
  ${text(`ANNO DOMINI ${roman(year)}`, { font: 'label', size: 11.5, spacing: 2, x: pad, y: 44, fill: t.brass })}
  ${rows}`,
  );
}

// ---------------------------------------------------------------- the armoury: one wall of tools

function armoury(t) {
  const tools = ARMOURY.flatMap((r) => r.tools);
  const cols = 9, cellW = 106, cellH = 116, pad = 32, top = 74;
  const W = pad * 2 + cols * cellW, H = top + Math.ceil(tools.length / cols) * cellH + 14;
  const cells = tools.map(([slug, label], i) => {
    const cx = pad + cellW * ((i % cols) + 0.5), y0 = top + Math.floor(i / cols) * cellH;
    let glyph;
    if (slug.mono) {
      glyph = text(slug.mono, { font: 'display', size: 17, x: cx, y: y0 + 32, fill: t.ink, anchor: 'middle' });
    } else {
      if (!icons[slug]) throw new Error(`Missing icon in scripts/icons.json: ${slug}`);
      glyph = `<path transform="translate(${r1(cx - 13)} ${y0 + 13}) scale(${r1(26 / 24 * 1000) / 1000})" d="${icons[slug]}" fill="${t.ink}"/>`;
    }
    const caps = label.toUpperCase();
    let size = 11;
    while (size > 8 && layout(caps, 'label', size, 1.2).width > cellW - 10) size -= 0.5;
    return `<g class="rise" style="animation-delay:${r1(0.05 + i * 0.03)}s">${pixelShape(cx - 26, y0, 52, 52, 4, t.edge)}${pixelShape(cx - 23, y0 + 3, 46, 46, 4, t.plate)}
    ${glyph}
    ${text(caps, { font: 'label', size, spacing: 1.2, x: cx, y: y0 + 76, fill: t.ink, anchor: 'middle' })}</g>`;
  });
  const halls = ARMOURY.map((r) => r.kind).join(' · ');
  const title = `The Armoury. ${ARMOURY.map((r) => `${r.kind[0].toUpperCase()}${r.kind.slice(1)}: ${r.tools.map(([, l]) => l).join(', ')}`).join('. ')}.`;
  return svg(
    W, H, title, `${fontCss('display', 'text', 'label')}\n${CSS_RISE}`,
    `${frame(W, H, t)}
  <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><rect x="9" y="9" width="2" height="2" fill="${t.edge}"/></pattern></defs>
  <rect x="${PX * 2}" y="${PX * 2}" width="${W - PX * 4}" height="${H - PX * 4}" fill="url(#grid)" opacity=".7"/>
  ${text('TOOLS OF THE TRADE', { font: 'label', size: 13, spacing: 3, x: pad, y: 48, fill: t.brass })}
  ${text(halls, { font: 'text', size: 14, x: W - pad, y: 48, fill: t.muted, anchor: 'end' })}
  ${cells.join('\n  ')}`,
  );
}

// ---------------------------------------------------------------- the arsenal: small project cards

function projectCard(t, p, info) {
  const W = 320, H = 176, pad = 18, x = pad + 52;
  const name = caps(p.name);
  let ns = 18;
  while (ns > 13 && layout(name, 'display', ns, 0.5).width > W - x - pad) ns -= 0.5;
  const desc = wrapText(p.short ?? p.what, 'text', 13, W - 2 * pad).slice(0, 2);
  let standing;
  if (info?.stars || info?.latest) {
    const ver = info.latest ? info.latest.tagName : '';
    const verW = ver ? layout(ver, 'text', 12).width : 0;
    const starX = W - pad - verW - (ver ? 12 : 0) - (info.stars ? 34 : 0);
    standing = `${info.stars ? `${pixelStar(starX, 147, 2, t.brass)}${text(String(info.stars), { font: 'text', size: 12, x: starX + 14, y: 157, fill: t.ink })}` : ''}${ver ? text(ver, { font: 'text', size: 12, x: W - pad, y: 157, fill: t.brass, anchor: 'end' }) : ''}`;
  } else {
    standing = text(p.standing ?? '', { font: 'text', size: 12, x: W - pad, y: 157, fill: t.muted, anchor: 'end' });
  }
  return svg(
    W, H, `${p.name}: ${p.what} Built with ${p.built}. ${p.get.label}.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 4)}
  ${badge(pad, pad, 40, p.mark ?? p.name[0], t, 4)}
  ${text(name, { font: 'display', size: r1(ns), spacing: ds(0.5), x, y: pad + 17, fill: t.ink })}
  ${text(`→ ${p.get.label.toUpperCase()}`, { font: 'label', size: 10.5, spacing: 1.4, x, y: pad + 36, fill: t.accent })}
  ${desc.map((l, i) => text(l, { font: 'text', size: 13, x: pad, y: 90 + i * 18, fill: t.muted })).join('\n  ')}
  ${dotRule(pad, W - pad, 132, t, 3, 7)}
  ${text(p.built, { font: 'text', size: 12, x: pad, y: 157, fill: t.muted })}
  ${standing}`,
  );
}

// ---------------------------------------------------------------- the chronicle: one timeline

function timeline(t) {
  const items = [...CHRONICLE].sort((a, b) => a.since - b.since);
  const W = 1040, pad = 34, stepX = 160, x0 = 56, textW = 296;
  // Each entry is a block of lines read top to bottom; the year always sits next to the line.
  const blocks = items.map((c) => ({ c, field: wrapText(c.field, 'text', 12.5, textW).slice(0, 3) }));
  const blockH = (b) => 28 + 22 + 20 + b.field.length * 17;
  const upH = Math.max(...blocks.filter((_, i) => i % 2 === 0).map(blockH));
  const downH = Math.max(...blocks.filter((_, i) => i % 2 === 1).map(blockH));
  const lineY = pad + upH + 18, H = lineY + 18 + downH + pad;
  const parts = [dotRule(pad, W - pad, lineY - 2, t, 4, 6)];
  blocks.forEach((b, i) => {
    const x = x0 + i * stepX, above = i % 2 === 0;
    parts.push(`<rect x="${x - 1}" y="${lineY - 9}" width="8" height="16" fill="${i === blocks.length - 1 ? t.accent : t.brass}"/>`);
    const lines = [
      ['year', String(b.c.since)], ['role', caps(b.c.role)], ['house', b.c.house], ...b.field.map((f) => ['field', f]),
    ];
    const order = above ? [lines[1], lines[2], ...lines.slice(3), lines[0]] : lines;
    let y = above ? lineY - 14 - blockH(b) : lineY + 16;
    for (const [kind, str] of order) {
      const h = kind === 'year' ? 28 : kind === 'role' ? 22 : kind === 'house' ? 20 : 17;
      y += h;
      const base = y - (kind === 'year' ? 4 : 5);
      const st = {
        year: { font: 'display', size: 24, spacing: ds(1), fill: t.brass },
        role: { font: 'display', size: 15, spacing: ds(0.6), fill: t.ink },
        house: { font: 'text', size: 13, fill: b.c.url ? t.accent : t.muted },
        field: { font: 'text', size: 12.5, fill: t.muted },
      }[kind];
      parts.push(text(str, { ...st, x: x + 14, y: base }));
    }
  });
  return svg(
    W, H, `The Chronicle: ${items.map((c) => `${c.since}, ${c.role}, ${c.house}: ${c.field}`).join('; ')}.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t)}\n  ${parts.join('\n  ')}`,
  );
}

// ---------------------------------------------------------------- dispatches: a compact changelog

function dispatchRow(t, r) {
  const W = 1000, H = 54, p = 3;
  const name = caps(r.project);
  const nameW = layout(name, 'display', 17, 0.6).width;
  const date = r.publishedAt.slice(0, 10);
  return svg(
    W, H, `${r.project} ${r.tagName}, released ${longDate(r.publishedAt)}.`, fontCss('display', 'text', 'label'),
    `${pixelShape(0, 0, W, H, p, t.edge)}${pixelShape(p, p, W - 2 * p, H - 2 * p, p, t.bg)}
  ${text(date, { font: 'text', size: 15, x: 24, y: 33, fill: t.muted })}
  ${badge(150, 12, 30, r.mark ?? r.project[0], t, 3)}
  ${text(name, { font: 'display', size: 17, spacing: ds(0.6), x: 194, y: 33, fill: t.ink })}
  ${text(r.tagName, { font: 'text', size: 15, x: 194 + nameW + 14, y: 33, fill: t.brass })}
  ${text('release notes →', { font: 'text', size: 13, x: W - 24, y: 32, fill: t.accent, anchor: 'end' })}`,
  );
}

function dispatchAlt(list) {
  if (!list.length) return 'Latest dispatches: no releases yet.';
  return `Latest dispatches: ${list.map((r) => `${r.project} ${r.tagName}, ${longDate(r.publishedAt)}`).join('; ')}.`;
}

// ---------------------------------------------------------------- elsewhere: link cards

function seal(t, s) {
  const W = 220, H = 150, pad = 18;
  let hs = 13;
  while (hs > 9 && layout(s.handle, 'text', hs).width > W - 2 * pad) hs -= 0.5;
  return svg(
    W, H, s.alt, fontCss('display', 'text', 'label'),
    `${frame(W, H, t, 4)}
  ${badge(pad, pad, 34, s.mark, t, 4)}
  ${text('→', { font: 'text', size: 22, x: W - pad, y: pad + 24, fill: t.accent, anchor: 'end' })}
  ${text(caps(s.label), { font: 'display', size: s.label.length > 10 ? 15 : 18, spacing: ds(0.6), x: pad, y: 98, fill: t.ink })}
  ${text(s.handle, { font: 'text', size: r1(hs), x: pad, y: 124, fill: t.muted })}`,
  );
}

// ---------------------------------------------------------------- markdown

function picture(base, alt, attrs = 'width="100%"') {
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${esc(alt)}" src="${base}-light.svg" ${attrs}></picture>`;
}

const linked = (href, inner) => (href ? `<a href="${esc(href)}">${inner}</a>` : inner);

function ledgerBand() {
  return `<p>${linked('https://github.com/obileonardo?tab=repositories', picture('assets/ledger', 'Contribution chart: a year of contributions, one square per day, brighter for busier days.', `width="${LEDGER_PCT}%"`))} ${picture('assets/year', "This year's numbers: contributions, commits, pull requests, releases and stars.", `width="${YEAR_PCT}%"`)}</p>`;
}

function arsenal() {
  return `<p>\n${PROJECTS.map((p) => linked(p.get.url, picture(`assets/arsenal/${slug(p.name)}`, `${p.name}: ${p.what}`, 'width="32%"'))).join('\n')}\n</p>`;
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
  return `<h3><picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${esc(h)}" src="${base}-light.svg" height="${HEADING_H / 2}"></picture></h3>`;
}

function seals() {
  return `<p align="center">\n${SEALS.map((s) => linked(s.url, picture(`assets/seals/${s.id}`, s.alt, 'width="18.6%"'))).join('\n')}\n</p>`;
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
  const files = new Map();

  for (const [name, t] of Object.entries(THEMES)) {
    for (const h of HEADINGS) files.set(`assets/headings/${slug(h)}-${name}.svg`, heading(t, h));
    if (!HOURLY) files.set(`assets/year-${name}.svg`, yearTile(t, data.year, data.stats, data.calendar));
    if (!HOURLY) files.set(`assets/ledger-${name}.svg`, ledger(t, data.calendar, name === 'dark'));
    data.dispatches.forEach((r, i) => files.set(`assets/dispatches/${i}-${name}.svg`, dispatchRow(t, r)));
    for (const p of PROJECTS) files.set(`assets/arsenal/${slug(p.name)}-${name}.svg`, projectCard(t, p, p.repo ? data.repoInfo.get(p.repo) : null));
    files.set(`assets/chronicle-${name}.svg`, timeline(t));
    files.set(`assets/armoury-${name}.svg`, armoury(t));
    for (const s of SEALS) files.set(`assets/seals/${s.id}-${name}.svg`, seal(t, s));
  }

  // Hold the Keep: the board as it stands. Moves themselves are played by scripts/keep/play.mjs.
  const state = await loadState();
  files.set('game/state.json', `${JSON.stringify(state, null, 1)}\n`);
  const keep = keepBoard(state, THEMES, { text, layout, fontCss, svg, frame, dotRule, pixelStar, wrapText, style: STYLE });
  for (const [rel, content] of keep.files) files.set(rel, content);

  const readme = template
    .replace(/^#{3,4} (?:❦ )?(.+)$/gm, (_, h) => headingPicture(h))
    .replace('{{LEDGER}}', ledgerBand())
    .replace('{{ARSENAL}}', arsenal())
    .replace('{{DISPATCHES}}', dispatches(data.dispatches))
    .replace('{{CHRONICLE}}', chronicle())
    .replace('{{SEALS}}', seals())
    .replace('{{KEEP}}', () => keep.markdown);
  const leftover = readme.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) throw new Error(`Unfilled placeholder in README.template.md: ${leftover[0]}`);
  const fromDisk = (rel) => (existsSync(path.join(ROOT, rel)) ? readFileSync(path.join(ROOT, rel)) : null);
  const versioned = versionUrls(readme, (rel) => files.get(rel) ?? fromDisk(rel));
  files.set('README.md', `<!-- Generated by scripts/build.mjs from README.template.md. Edit the template, not this file. -->\n\n${versioned}`);

  // Write only after everything built, so a failed fetch never leaves half-updated files.
  for (const dir of ['assets/seals', 'assets/keep', 'assets/headings', 'assets/arsenal', 'assets/chronicle', 'assets/dispatches', 'game']) await mkdir(path.join(ROOT, dir), { recursive: true });
  for (const [rel, content] of files) await writeFile(path.join(ROOT, rel), content);
  await prunePanels(new Set(files.keys()));
  console.log(`Built ${files.size} files. ${data.stats.map((s) => `${s.label}: ${s.value}`).join(', ')}`);
}

export { STYLE, PROJECTS, THEMES, fetchData, loadFonts, layout, text, fontCss, svg, esc, r1, roman, longDate, fmt, frame, dotRule, pixelStar, wrapText };

// Run only when executed directly, so other scripts can import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
