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
import { board as keepBoard } from './keep/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIN = 'obileonardo';

// ---------------------------------------------------------------- content

// The Arsenal. Descriptions are curated here; stars and versions come from GitHub.
const PROJECTS = [
  {
    name: 'Hearth',
    mark: 'H',
    repo: 'obileonardo/hearth-macos',
    what: 'A native macOS menu-bar companion for Home Assistant.',
    built: 'Swift',
    get: { label: 'Homebrew', url: 'https://github.com/obileonardo/homebrew-hearth' },
  },
  {
    name: 'Clepso',
    mark: 'Cl',
    repo: 'obileonardo/clepso',
    what: "A native macOS menu-bar monitor for your AI coding agents' usage limits (Claude Code and Codex). Local-first, private by design.",
    built: 'Swift',
    get: { label: 'Website', url: 'https://clepso-app.vercel.app' },
  },
  {
    name: 'Capsa',
    mark: 'Ca',
    repo: 'obileonardo/capsa-oss',
    what: 'A local-first library for what you learn about working with AI, with the evidence each item came from. App, MCP server and command line.',
    built: 'TypeScript',
    get: { label: 'Releases', url: 'https://github.com/obileonardo/capsa-oss/releases' },
  },
  {
    name: 'Builders World',
    mark: 'BW',
    repo: 'builders-world/builders-world',
    what: 'A living, browser-based world set in real African cities, where your GitHub commits are your currency.',
    built: 'Three.js · Rust',
    get: { label: 'Play', url: 'https://buildersworld.vercel.app' },
    standing: 'Open source',
  },
  {
    name: 'Mazerance',
    url: 'https://x.com/Mazerance',
    what: 'A psychological co-op strategy game, built at FiveBlooded.',
    built: 'Unreal Engine 5',
    get: { label: 'Follow', url: 'https://x.com/Mazerance' },
    standing: 'In development',
  },
  {
    name: 'Halfwings',
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
  { id: 'portfolio', label: 'Portfolio', mark: 'E', url: 'https://elvisobi.com', alt: 'Portfolio: elvisobi.com' },
  { id: 'x', label: 'X', mark: 'X', url: 'https://x.com/TheObiLeonard', alt: 'X: @TheObiLeonard' },
  { id: 'linkedin', label: 'LinkedIn', mark: 'in', url: 'https://www.linkedin.com/in/elvisobi', alt: 'LinkedIn: in/elvisobi' },
  { id: 'contra', label: 'Contra', mark: 'C', url: 'https://contra.com/elvisobi', alt: 'Contra: elvisobi' },
  { id: 'letter', label: 'Write a letter', mark: '@', url: 'mailto:contact@elvisobi.com?subject=A%20letter%20for%20Elvis', alt: 'Email: contact@elvisobi.com' },
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

const THEMES = {
  // Paper and ink by day, indigo by night; cobalt and brass as the accents, matching the story.
  light: { bg: '#F4EFE6', edge: '#D9D3C6', ink: '#1C1A22', muted: '#5A5866', faint: '#B9B3A6', plate: '#EBE5D8', accent: '#2443C4', brass: '#8A6200' },
  dark: { bg: '#0A0C16', edge: '#232842', ink: '#F4EFE6', muted: '#9AA0B8', faint: '#3A3F5A', plate: '#11142A', accent: '#8FB0FF', brass: '#F2C86B' },
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
const FONT_FILES = {
  display: 'doto-bold',
  text: 'geist-mono',
  label: 'geist-mono-semibold',
};
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
  const X = x + w, Y = y + h;
  return `<path d="M${x + 2 * p} ${y}H${X - 2 * p}V${y + p}H${X - p}V${y + 2 * p}H${X}V${Y - 2 * p}H${X - p}V${Y - p}H${X - 2 * p}V${Y}H${x + 2 * p}V${Y - p}H${x + p}V${Y - 2 * p}H${x}V${y + 2 * p}H${x + p}V${y + p}Z" fill="${fill}"/>`;
}

function frame(W, H, t, p = PX) {
  const stud = (x, y) => `<rect x="${x}" y="${y}" width="${p}" height="${p}" fill="${t.brass}"/>`;
  return `${pixelShape(0, 0, W, H, p, t.edge)}${pixelShape(p, p, W - 2 * p, H - 2 * p, p, t.bg)}
  ${stud(2 * p, 2 * p)}${stud(W - 3 * p, 2 * p)}${stud(2 * p, H - 3 * p)}${stud(W - 3 * p, H - 3 * p)}`;
}

function dotRule(x0, x1, y, t, size = 4, gap = 6) {
  let out = '';
  for (let x = x0; x <= x1 - size; x += size + gap) out += `<rect x="${r1(x)}" y="${r1(y)}" width="${size}" height="${size}" fill="${t.edge}"/>`;
  return out;
}

function dotColumn(x, y0, y1, t, size = 4, gap = 6) {
  let out = '';
  for (let y = y0; y <= y1 - size; y += size + gap) out += `<rect x="${r1(x)}" y="${r1(y)}" width="${size}" height="${size}" fill="${t.edge}"/>`;
  return out;
}

// A monogram on a cobalt pixel block.
function badge(x, y, size, mark, t, p = 5) {
  const fs = mark.length > 1 ? size * 0.42 : size * 0.52;
  return `${pixelShape(x, y, size, size, p, t.accent)}
  ${text(mark, { font: 'display', size: r1(fs), x: x + size / 2, y: y + size / 2 + fs * 0.36, fill: t.bg, anchor: 'middle' })}`;
}

function pixelStar(x, y, s, fill) {
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

// ---------------------------------------------------------------- year in review

function yearCard(t, year, stats) {
  const W = 1280, H = 300, pad = 64;
  const colW = (W - 2 * pad) / stats.length;
  const cols = stats
    .map((s, i) => {
      const cx = pad + colW * (i + 0.5);
      const sep = i ? dotColumn(r1(pad + colW * i), 132, 252, t) : '';
      return `${sep}<g class="rise" style="animation-delay:${r1(0.1 + i * 0.12)}s">
    ${text(fmt(s.value), { font: 'display', size: 54, x: cx, y: 184, fill: t.ink, anchor: 'middle' })}
    ${text(s.label.toUpperCase(), { font: 'label', size: 15, spacing: 2.6, x: cx, y: 222, fill: t.muted, anchor: 'middle' })}
    ${text(roman(s.value) || ' ', { font: 'text', size: 18, x: cx, y: 248, fill: t.muted, style: 'opacity:.7', anchor: 'middle' })}
  </g>`;
    })
    .join('\n  ');

  const css = `${fontCss('display', 'text', 'label')}
.rise{opacity:0;animation:rise .7s cubic-bezier(.2,.7,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rise{animation:none;opacity:1}}`;

  const summary = stats.map((s) => `${fmt(s.value)} ${s.label.toLowerCase()}`).join(', ');
  return svg(
    W, H, `Year in review, ${year}: ${summary}.`, css,
    `${frame(W, H, t)}
  ${text(`ANNO DOMINI ${roman(year)}`, { font: 'label', size: 17, spacing: 4.5, x: pad, y: 70, fill: t.brass })}
  ${dotRule(pad, W - pad, 92, t)}
  ${cols}`,
  );
}

// ---------------------------------------------------------------- the ledger

// The contribution chart, as on the profile itself: a year of days, one square each, in cobalt
// rather than green, with months along the top and the weekdays down the side.
const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function levelColours(t, dark) {
  const ramp = dark ? [0.22, 0.42, 0.66, 1] : [0.22, 0.45, 0.72, 1];
  const mixHex = (a, b, k) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - k) + parseInt(b.slice(1 + i, 3 + i), 16) * k).toString(16).padStart(2, '0')).join('');
  return [t.plate, ...ramp.map((k) => mixHex(t.bg, t.accent, k))];
}

function ledger(t, calendar, dark) {
  const cell = 15, gap = 4, step = cell + gap;
  const weeks = calendar.weeks;
  const pad = 40, left = pad + 44, top = 132;
  const W = left + weeks.length * step - gap + pad;
  const H = top + 7 * step - gap + 64;
  const colours = levelColours(t, dark);
  let squares = '';
  let months = '';
  let lastMonth = -1;
  weeks.forEach((w, i) => {
    const x = left + i * step;
    w.contributionDays.forEach((d) => {
      const day = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const lvl = Math.max(0, LEVELS.indexOf(d.contributionLevel));
      squares += `<rect x="${x}" y="${top + day * step}" width="${cell}" height="${cell}" rx="2" fill="${colours[lvl]}"><title>${d.contributionCount} on ${d.date}</title></rect>`;
    });
    const first = w.contributionDays[0];
    const m = new Date(`${first.date}T00:00:00Z`).getUTCMonth();
    if (m !== lastMonth && i < weeks.length - 2) {
      months += text(SHORT_MONTHS[m], { font: 'text', size: 15, x, y: top - 12, fill: t.muted });
      lastMonth = m;
    }
  });
  const days = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([d, l]) => text(l, { font: 'text', size: 14, x: pad, y: top + d * step + 12, fill: t.muted })).join('');
  const legendY = top + 7 * step + 26;
  const lx = W - pad - 5 * step - 50;
  const legend = `${text('Less', { font: 'text', size: 14, x: lx - 8, y: legendY + 12, fill: t.muted, anchor: 'end' })}${colours.map((c, i) => `<rect x="${lx + i * step}" y="${legendY}" width="${cell}" height="${cell}" rx="2" fill="${c}"/>`).join('')}${text('More', { font: 'text', size: 14, x: lx + 5 * step + 4, y: legendY + 12, fill: t.muted })}`;
  const total = fmt(calendar.totalContributions);
  return svg(
    W, H, `${total} contributions in the last year.`, fontCss('display', 'text', 'label'),
    `${frame(W, H, t)}
  ${text(total, { font: 'display', size: 44, spacing: 1, x: pad, y: 78, fill: t.ink })}
  ${text('CONTRIBUTIONS IN THE LAST YEAR', { font: 'label', size: 15, spacing: 2.4, x: pad + layout(total, 'display', 44, 1).width + 18, y: 76, fill: t.brass })}
  ${text('github.com/obileonardo', { font: 'text', size: 15, x: W - pad, y: 76, fill: t.accent, anchor: 'end' })}
  ${months}
  ${days}
  ${squares}
  ${text('Every square is a day. Brighter means more.', { font: 'text', size: 14, x: pad, y: legendY + 12, fill: t.muted })}
  ${legend}`,
  );
}

// ---------------------------------------------------------------- armoury

function shield(cx, y0, t) {
  return `${pixelShape(cx - 31, y0, 62, 62, 5, t.edge)}${pixelShape(cx - 27, y0 + 4, 54, 54, 5, t.plate)}`;
}

function armoury(t) {
  const W = 1280, pad = 64, hallW = 250, cell = 152, rowH = 158, top = 124;
  const H = top + ARMOURY.length * rowH + 8;
  let n = 0;
  const rows = ARMOURY.map((row, ri) => {
    const y = top + ri * rowH;
    const sep = ri ? dotRule(pad, W - pad, y - 16, t, 3, 9) : '';
    const hall = `${text(row.hall.toUpperCase(), { font: 'label', size: 17, spacing: 2.6, x: pad, y: y + 40, fill: t.ink })}
    ${text(row.kind, { font: 'text', size: 19, x: pad, y: y + 68, fill: t.muted })}`;
    const tools = row.tools.map(([slug, label], i) => {
      const cx = pad + hallW + cell * (i + 0.5);
      let glyph;
      if (slug.mono) {
        glyph = `<rect x="${r1(cx - 15)}" y="${y + 14}" width="30" height="30" rx="6" fill="none" stroke="${t.ink}" stroke-width="2.2"/>
      ${text(slug.mono, { font: 'display', size: 16, x: cx, y: y + 35, fill: t.ink, anchor: 'middle' })}`;
      } else {
        if (!icons[slug]) throw new Error(`Missing icon in scripts/icons.json: ${slug}`);
        glyph = `<path transform="translate(${r1(cx - 14)} ${y + 15}) scale(${r1(28 / 24 * 1000) / 1000})" d="${icons[slug]}" fill="${t.ink}"/>`;
      }
      const caps = label.toUpperCase();
      let size = 14;
      while (size > 10 && layout(caps, 'label', size, 1.6).width > cell - 14) size -= 0.5;
      return `<g class="rise" style="animation-delay:${r1(0.08 + n++ * 0.05)}s">${shield(cx, y, t)}
      ${glyph}
      ${text(caps, { font: 'label', size, spacing: 1.6, x: cx, y: y + 100, fill: t.ink, anchor: 'middle' })}</g>`;
    });
    return `${sep}${hall}\n    ${tools.join('\n    ')}`;
  });

  const css = `${fontCss('display', 'text', 'label')}
.rise{opacity:0;animation:rise .6s cubic-bezier(.2,.7,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rise{animation:none;opacity:1}}`;

  const title = `The Armoury. ${ARMOURY.map((r) => `${r.kind[0].toUpperCase()}${r.kind.slice(1)}: ${r.tools.map(([, l]) => l).join(', ')}`).join('. ')}.`;
  return svg(
    W, H, title, css,
    `${frame(W, H, t)}
  ${text('TOOLS OF THE TRADE', { font: 'label', size: 17, spacing: 4.5, x: pad, y: 70, fill: t.brass })}
  ${dotRule(pad, W - pad, 92, t)}
  ${rows.join('\n  ')}`,
  );
}

// ---------------------------------------------------------------- dispatches

// ---------------------------------------------------------------- tiles
//
// The Arsenal, the Chronicle and the dispatches are stacks of tiles, one image per row, so each row
// can be its own link. They share the card frame, scaled down.

const TILE_W = 1000, TILE_P = 5;

function projectTile(t, p, info) {
  const pad = 30, x = 124;
  const desc = wrapText(p.what, 'text', 20, 540);
  const H = Math.max(128, 84 + desc.length * 27 + 18);
  const right = TILE_W - pad - 6;
  let standing;
  if (info?.stars || info?.latest) {
    const parts = [];
    if (info.stars) parts.push(`${pixelStar(right - 98 - (info.latest ? layout(info.latest.tagName, 'text', 19).width + 26 : 0), 92, 3, t.brass)}`);
    standing = `${parts.join('')}${info.stars ? text(String(info.stars), { font: 'text', size: 19, x: right - 76 - (info.latest ? layout(info.latest.tagName, 'text', 19).width + 26 : 0), y: 106, fill: t.ink }) : ''}
    ${info.latest ? text(info.latest.tagName, { font: 'text', size: 19, x: right, y: 106, fill: t.brass, anchor: 'end' }) : ''}`;
  } else {
    standing = text(p.standing ?? '', { font: 'text', size: 19, x: right, y: 106, fill: t.muted, anchor: 'end' });
  }
  return svg(
    TILE_W, H, `${p.name}: ${p.what} Built with ${p.built}. ${p.get.label}.`, fontCss('display', 'text', 'label'),
    `${frame(TILE_W, H, t, TILE_P)}
  ${badge(pad + 4, 30, 68, p.mark ?? p.name[0], t)}
  ${text(p.name.toUpperCase(), { font: 'display', size: 30, spacing: 1, x, y: 60, fill: t.ink })}
  ${text(`→ ${p.get.label}`, { font: 'label', size: 14, spacing: 1.6, x: x + layout(p.name.toUpperCase(), 'display', 30, 1).width + 18, y: 56, fill: t.accent })}
  ${desc.map((l, i) => text(l, { font: 'text', size: 20, x, y: 92 + i * 27, fill: t.muted })).join('\n  ')}
  ${text('BUILT WITH', { font: 'label', size: 13, spacing: 2, x: right, y: 46, fill: t.muted, anchor: 'end' })}
  ${text(p.built, { font: 'text', size: 19, x: right, y: 72, fill: t.ink, anchor: 'end' })}
  ${standing}`,
  );
}

function chronicleTile(t, c) {
  const pad = 30, x = 172;
  const field = wrapText(c.field, 'text', 19, 760);
  const H = 70 + field.length * 26 + 22;
  return svg(
    TILE_W, H, `${c.role}, ${c.house}, since ${c.since}. ${c.field}.`, fontCss('display', 'text', 'label'),
    `${frame(TILE_W, H, t, TILE_P)}
  ${text(String(c.since), { font: 'display', size: 40, spacing: 1, x: pad + 6, y: 70, fill: t.brass })}
  ${text(c.role.toUpperCase(), { font: 'display', size: 26, spacing: 1, x, y: 56, fill: t.ink })}
  ${text(c.house, { font: 'text', size: 19, x: TILE_W - pad - 6, y: 54, fill: c.url ? t.accent : t.muted, anchor: 'end' })}
  ${field.map((l, i) => text(l, { font: 'text', size: 19, x, y: 90 + i * 26, fill: t.muted })).join('\n  ')}`,
  );
}

function dispatchTile(t, r) {
  const pad = 30, H = 88, x = 104;
  const name = r.project.toUpperCase();
  const nameW = layout(name, 'display', 26, 1).width;
  return svg(
    TILE_W, H, `${r.project} ${r.tagName}, released ${longDate(r.publishedAt)}.`, fontCss('display', 'text', 'label'),
    `${frame(TILE_W, H, t, TILE_P)}
  ${badge(pad + 4, 20, 48, r.mark ?? r.project[0], t, 4)}
  ${text(name, { font: 'display', size: 26, spacing: 1, x, y: 54, fill: t.ink })}
  ${text(r.tagName, { font: 'text', size: 20, x: x + nameW + 18, y: 54, fill: t.brass })}
  ${text(longDate(r.publishedAt), { font: 'text', size: 19, x: TILE_W - pad - 6, y: 54, fill: t.muted, anchor: 'end' })}`,
  );
}

function dispatchAlt(list) {
  if (!list.length) return 'Latest dispatches: no releases yet.';
  return `Latest dispatches: ${list.map((r) => `${r.project} ${r.tagName}, ${longDate(r.publishedAt)}`).join('; ')}.`;
}

// ---------------------------------------------------------------- seals

function seal(t, s) {
  const H = 52, p = 4;
  const label = s.label.toUpperCase();
  const lw = layout(label, 'label', 14, 2).width;
  const W = Math.ceil(10 + 32 + 14 + lw + 22);
  return svg(
    W, H, s.alt, fontCss('display', 'label'),
    `${pixelShape(0, 0, W, H, p, t.edge)}${pixelShape(p, p, W - 2 * p, H - 2 * p, p, t.bg)}
  ${badge(10, 10, 32, s.mark, t, 4)}
  ${text(label, { font: 'label', size: 14, spacing: 2, x: 56, y: 31, fill: t.ink })}`,
  );
}

// ---------------------------------------------------------------- markdown

function picture(base, alt, attrs = 'width="100%"') {
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${esc(alt)}" src="${base}-light.svg" ${attrs}></picture>`;
}

function tileStack(items) {
  return items.map(({ href, base, alt }) => (href ? `<a href="${esc(href)}">${picture(base, alt)}</a>` : picture(base, alt))).join('\n');
}

function arsenal(repoInfo) {
  return tileStack(PROJECTS.map((p) => ({ href: p.get.url, base: `assets/arsenal/${slug(p.name)}`, alt: `${p.name}: ${p.what}` })));
}

function chronicle() {
  return tileStack(CHRONICLE.map((c, i) => ({ href: c.url, base: `assets/chronicle/${i}`, alt: `${c.role}, ${c.house}, since ${c.since}: ${c.field}` })));
}

function dispatches(list) {
  if (!list.length) return '<p><i>No dispatches yet.</i></p>';
  return tileStack(list.map((r, i) => ({ href: r.url, base: `assets/dispatches/${i}`, alt: `${r.project} ${r.tagName}, ${longDate(r.publishedAt)}` })));
}

function headingPicture(h) {
  const base = `assets/headings/${slug(h)}`;
  return `<h3><picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${esc(h)}" src="${base}-light.svg" height="${HEADING_H / 2}"></picture></h3>`;
}

function seals() {
  const items = SEALS.map(
    (s) => `<a href="${esc(s.url)}"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/seals/${s.id}-dark.svg"><img alt="${esc(s.alt)}" src="assets/seals/${s.id}-light.svg" height="44"></picture></a>`,
  );
  return `<p align="center">\n  ${items.join('\n  ')}\n</p>`;
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
    if (!HOURLY) files.set(`assets/year-${name}.svg`, yearCard(t, data.year, data.stats));
    if (!HOURLY) files.set(`assets/ledger-${name}.svg`, ledger(t, data.calendar, name === 'dark'));
    data.dispatches.forEach((r, i) => files.set(`assets/dispatches/${i}-${name}.svg`, dispatchTile(t, r)));
    for (const p of PROJECTS) files.set(`assets/arsenal/${slug(p.name)}-${name}.svg`, projectTile(t, p, p.repo ? data.repoInfo.get(p.repo) : null));
    CHRONICLE.forEach((c, i) => files.set(`assets/chronicle/${i}-${name}.svg`, chronicleTile(t, c)));
    files.set(`assets/armoury-${name}.svg`, armoury(t));
    for (const s of SEALS) files.set(`assets/seals/${s.id}-${name}.svg`, seal(t, s));
  }

  // Hold the Keep: the board as it stands. Moves themselves are played by scripts/keep/play.mjs.
  const state = await loadState();
  files.set('game/state.json', `${JSON.stringify(state, null, 1)}\n`);
  const keep = keepBoard(state, THEMES, { text, layout, fontCss, svg, frame, dotRule, pixelStar, wrapText });
  for (const [rel, content] of keep.files) files.set(rel, content);

  const readme = template
    .replace(/^#{3,4} (?:❦ )?(.+)$/gm, (_, h) => headingPicture(h))
    .replace('{{ARSENAL}}', arsenal(data.repoInfo))
    .replace('{{DISPATCHES}}', dispatches(data.dispatches))
    .replace('{{CHRONICLE}}', chronicle())
    .replace('{{SEALS}}', seals())
    .replace('{{KEEP}}', () => keep.markdown);
  const leftover = readme.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) throw new Error(`Unfilled placeholder in README.template.md: ${leftover[0]}`);
  files.set('README.md', `<!-- Generated by scripts/build.mjs from README.template.md. Edit the template, not this file. -->\n\n${readme}`);

  // Write only after everything built, so a failed fetch never leaves half-updated files.
  for (const dir of ['assets/seals', 'assets/keep', 'assets/headings', 'assets/arsenal', 'assets/chronicle', 'assets/dispatches', 'game']) await mkdir(path.join(ROOT, dir), { recursive: true });
  for (const [rel, content] of files) await writeFile(path.join(ROOT, rel), content);
  await prunePanels(new Set(files.keys()));
  console.log(`Built ${files.size} files. ${data.stats.map((s) => `${s.label}: ${s.value}`).join(', ')}`);
}

export { PROJECTS, THEMES, fetchData, loadFonts, layout, text, fontCss, svg, esc, r1, roman, longDate, fmt, frame, dotRule, pixelStar, wrapText };

// Run only when executed directly, so other scripts can import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
