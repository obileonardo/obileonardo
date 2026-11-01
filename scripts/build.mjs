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
    url: 'https://x.com/HalfwingsInc',
    what: 'The software and hardware development partner for technology businesses.',
    role: 'Software & hardware studio', // shown instead of "built with"
    get: { label: 'Follow', url: 'https://x.com/HalfwingsInc' },
    standing: 'Founded 2026',
  },
];

// Elsewhere. `mark` is the monogram painted on each tablet's shield.
const SEALS = [
  { id: 'portfolio', label: 'Portfolio', mark: 'E', url: 'https://elvisobi.com', alt: 'Portfolio: elvisobi.com' },
  { id: 'x', label: 'X', mark: 'X', url: 'https://x.com/TheObiLeonard', alt: 'X: @TheObiLeonard' },
  { id: 'linkedin', label: 'LinkedIn', mark: 'in', url: 'https://www.linkedin.com/in/elvisobi', alt: 'LinkedIn: in/elvisobi' },
  { id: 'contra', label: 'Contra', mark: 'C', url: 'https://contra.com/elvisobi', alt: 'Contra: elvisobi' },
  { id: 'letter', label: 'Write a letter', mark: '@', url: 'mailto:contact@elvisobi.com?subject=A%20letter%20for%20Elvis', alt: 'Email: contact@elvisobi.com' },
];

const QUOTE = { text: '“When we build, let us think that we build for ever.”', by: 'John Ruskin' };
const NAME = 'ELVIS OBI LEONARD';
const TAGLINE = 'Design Engineer  ·  The Medieval Artisan  ·  Nairobi, Kenya';
const ERAS = [456, 856, 1256, 1650]; // the current year is appended, as on elvisobi.com

// The Armoury: tools in use, from the resume, the portfolio and the repos. Up to six per hall.
// An icon is a Simple Icons slug vendored in scripts/icons.json, or { mono } for a typographic mark
// (Adobe's logos aren't in Simple Icons).
const ARMOURY = [
  { hall: 'The Drawing Room', kind: 'design', tools: [['figma', 'Figma'], [{ mono: 'Ai' }, 'Illustrator'], [{ mono: 'Ps' }, 'Photoshop'], ['framer', 'Framer']] },
  { hall: 'The Workshop', kind: 'game & 3D', tools: [['unrealengine', 'Unreal Engine'], ['blender', 'Blender'], ['threedotjs', 'Three.js']] },
  { hall: 'The Forge', kind: 'code', tools: [['swift', 'Swift'], ['typescript', 'TypeScript'], ['rust', 'Rust'], ['nextdotjs', 'Next.js'], ['python', 'Python']] },
  { hall: 'The Keep', kind: 'infrastructure', tools: [['vercel', 'Vercel'], ['supabase', 'Supabase'], ['docker', 'Docker'], ['githubactions', 'GitHub Actions'], ['homeassistant', 'Home Assistant'], ['homebrew', 'Homebrew']] },
];

// Carved stone and heraldry. s1/s2: stone gradient; hi/shadow: the light and dark lips of a cut;
// iron: brackets and rivets; recess: sunken shields; accent: painted heraldry.
const THEMES = {
  light: { s1: '#E2DED6', s2: '#C3BDB2', ink: '#2E2924', muted: '#5E574E', hi: '#F7F4EE', shadow: '#948D81', iron: '#36322E', ironHi: '#8C857B', recess: '#CFCAC1', accent: '#7E1C06' },
  dark: { s1: '#302D29', s2: '#1C1A18', ink: '#E7E1D6', muted: '#A69E91', hi: '#4A463F', shadow: '#0B0A09', iron: '#121110', ironHi: '#6E675E', recess: '#24221F', accent: '#D67756' },
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

const FONT_FILES = {
  black: 'playfair-black',
  regular: 'playfair-regular',
  italic: 'playfair-italic',
  caps: 'cinzel-bold',
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

// ---------------------------------------------------------------- stone, iron and carving

// Shared <defs> for every card: the stone gradient, rivet shading and a fine grain.
function defs(t) {
  return `<defs>
  <linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.s1}"/><stop offset="1" stop-color="${t.s2}"/></linearGradient>
  <radialGradient id="rv" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="${t.ironHi}"/><stop offset="1" stop-color="${t.iron}"/></radialGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0"/><feComposite operator="in" in2="SourceGraphic"/></filter>
</defs>`;
}

const rivet = (x, y, r) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="url(#rv)"/>`;

// An iron corner bracket for the top-left corner; mirrored for the others. `b` is its arm length.
function bracket(t, b = 62) {
  const w = Math.round(b * 0.23);
  return `<path d="M4 4H${b}V${4 + w}H${4 + w}V${b}H4Z" fill="${t.iron}"/><path d="M4 4H${b}V8H8V${b}H4Z" fill="${t.ironHi}" opacity=".35"/>
  ${rivet(11, 11, 4.5)}${rivet(b - 14, 11, 3.5)}${rivet(11, b - 14, 3.5)}`;
}

// A stone tablet with a sunken panel and iron brackets at the corners.
function frame(W, H, t, b = 62) {
  const k = bracket(t, b);
  const i = 16;
  return `${defs(t)}
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="url(#st)"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="#000" filter="url(#grain)" opacity=".18"/>
  <path d="M${i} ${H - i}V${i}H${W - i}" fill="none" stroke="${t.shadow}" stroke-width="2.5"/>
  <path d="M${W - i} ${i}V${H - i}H${i}" fill="none" stroke="${t.hi}" stroke-width="2.5"/>
  <path d="M1.5 ${H - 1.5}V11A9.5 9.5 0 0 1 11 1.5H${W - 11}" fill="none" stroke="${t.hi}" stroke-width="2" opacity=".8"/>
  <g>${k}</g><g transform="translate(${W} 0) scale(-1 1)">${k}</g>
  <g transform="translate(0 ${H}) scale(1 -1)">${k}</g><g transform="translate(${W} ${H}) scale(-1 -1)">${k}</g>`;
}

// Text cut into the stone: a light lip under the letters, then the letters.
function carve(str, o, t, depth = 1.2) {
  return text(str, { ...o, y: o.y + depth, fill: t.hi, cls: '' }) + text(str, { ...o, fill: o.fill ?? t.ink, cls: '' });
}

// A groove: a shadowed line with a light lip under it.
function groove(x1, y1, x2, y2, t, extra = '') {
  const vertical = x1 === x2;
  const [dx, dy] = vertical ? [1.5, 0] : [0, 1.5];
  return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${t.shadow}" stroke-width="1.5"${extra}/><line x1="${r1(x1 + dx)}" y1="${r1(y1 + dy)}" x2="${r1(x2 + dx)}" y2="${r1(y2 + dy)}" stroke="${t.hi}" stroke-width="1"${extra}/>`;
}

function shieldPath(x, y, w, h) {
  const cx = x + w / 2;
  return `M${r1(x)} ${r1(y)}H${r1(x + w)}V${r1(y + h * 0.48)}C${r1(x + w)} ${r1(y + h * 0.8)} ${r1(cx + w * 0.22)} ${r1(y + h - 6)} ${r1(cx)} ${r1(y + h)}C${r1(cx - w * 0.22)} ${r1(y + h - 6)} ${r1(x)} ${r1(y + h * 0.8)} ${r1(x)} ${r1(y + h * 0.48)}Z`;
}

// A painted heraldic shield bearing a monogram.
function heraldShield(x, y, w, mark, t) {
  const h = w * 1.12;
  const size = mark.length > 1 ? w * 0.42 : w * 0.6;
  return `<path d="${shieldPath(x, y, w, h)}" fill="${t.accent}" stroke="${t.iron}" stroke-width="${w > 40 ? 3 : 2}"/>
  <path d="${shieldPath(x + w * 0.09, y + w * 0.09, w * 0.82, h * 0.8)}" fill="none" stroke="${t.s1}" stroke-width="1" opacity=".45"/>
  ${text(mark, { font: 'black', size, x: x + w / 2, y: y + h * 0.42 + size * 0.36, fill: t.s1, anchor: 'middle' })}`;
}

function heading(W, label, sub, t, pad = 72) {
  return `${carve(label, { font: 'caps', size: 17, spacing: 4.5, x: pad, y: 74, fill: t.accent }, t)}
  ${carve(sub, { font: 'italic', size: 22, x: W - pad, y: 74, fill: t.muted, anchor: 'end' }, t)}
  ${groove(pad, 96, W - pad, 96, t)}`;
}

function svg(W, H, title, css, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${css}</style>
${body}
</svg>
`;
}

const RISE = (dir = 'Y', dist = 8) => `.rise{opacity:0;animation:rise .6s cubic-bezier(.2,.7,.2,1) both}
@keyframes rise{from{opacity:0;transform:translate${dir}(${dist}px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rise{animation:none;opacity:1}}`;

function wrap(str, font, size, maxW, maxLines) {
  const lines = [];
  let cur = '';
  for (const w of str.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (layout(next, font, size).width <= maxW) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && layout(`${last}…`, font, size).width > maxW) last = last.split(' ').slice(0, -1).join(' ');
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

function star(cx, cy, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${r1(cx + rr * Math.cos(a))},${r1(cy + rr * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

// ---------------------------------------------------------------- banner

function crown(cx, cy, t) {
  const pts = [[-18, 10], [-18, -8], [-9, 1], [0, -12], [9, 1], [18, -8], [18, 10]].map(([x, y]) => `${cx + x},${cy + y}`).join(' ');
  const jewels = [[-18, -8], [0, -12], [18, -8]].map(([x, y]) => rivet(cx + x, cy + y - 3, 3.2)).join('');
  const body = (dy, c) => `<polygon points="${pts}" transform="translate(0 ${dy})" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round"/>
  <line x1="${cx - 18}" y1="${cy + 15 + dy}" x2="${cx + 18}" y2="${cy + 15 + dy}" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`;
  return `${body(1.2, t.hi)}${body(0, t.muted)}${jewels}`;
}

function banner(t, year) {
  const W = 1280, H = 480, STEP = 0.7;
  const years = [...ERAS, year];
  const last = years.length - 1;

  // AD + year, centred on the final year.
  const AD = { size: 140 }, YR = { size: 134, spacing: 22 };
  const adW = layout('AD', 'black', AD.size).width;
  const yrW = layout(String(year), 'regular', YR.size, YR.spacing).width;
  const gap = 34;
  const x0 = (W - (adW + gap + yrW)) / 2;
  const baseline = 276;

  const frames = years
    .map((y, i) => `<g class="${i === last ? 'f last' : 'f'}" style="animation-delay:${r1(i * STEP)}s">${carve(String(y), { font: 'regular', size: YR.size, spacing: YR.spacing, x: x0 + adW + gap, y: baseline }, t, 2)}</g>`)
    .join('\n  ');

  // Timeline of eras, cut as a groove with iron studs.
  const tx0 = 170, tx1 = W - 170, ty = 400;
  const span = tx1 - tx0;
  const marks = years
    .map((y, i) => {
      const x = tx0 + (span * i) / last;
      const stud = i === last ? `<circle cx="${r1(x)}" cy="${ty}" r="7" fill="${t.accent}" stroke="${t.iron}" stroke-width="2"/>` : rivet(x, ty, 6.5);
      return `<g class="lab" style="animation-delay:${r1(i * STEP)}s">${stud}
  ${carve(roman(y), { font: 'caps', size: 16, spacing: 2.6, x, y: ty + 40, fill: i === last ? t.accent : t.ink, anchor: 'middle' }, t)}</g>`;
    })
    .join('\n  ');

  const css = `${fontCss('black', 'regular', 'italic', 'caps')}
.f{opacity:0;animation:flash ${STEP}s linear both}
.f.last{animation:hold .6s ease-out both}
.lab{opacity:.3;animation:lit .35s ease-out forwards}
.prog{stroke-dasharray:${span};stroke-dashoffset:${span};animation:draw ${r1(STEP * last)}s linear forwards}
@keyframes flash{0%,100%{opacity:0}10%,90%{opacity:1}}
@keyframes hold{from{opacity:0}to{opacity:1}}
@keyframes lit{to{opacity:1}}
@keyframes draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){.f{animation:none;opacity:0}.f.last{animation:none;opacity:1}.lab{animation:none;opacity:1}.prog{animation:none;stroke-dashoffset:0}}`;

  return svg(
    W, H, `Elvis Obi Leonard, Design Engineer. AD ${year}.`, css,
    `${frame(W, H, t, 84)}
  ${carve(`${QUOTE.text}  —  ${QUOTE.by}`, { font: 'italic', size: 22, x: W / 2, y: 76, fill: t.muted, anchor: 'middle' }, t)}
  ${crown(W / 2, 122, t)}
  ${carve('AD', { font: 'black', size: AD.size, x: x0, y: baseline - 6 }, t, 2.2)}
  ${frames}
  ${carve(NAME, { font: 'caps', size: 32, spacing: 11, x: W / 2, y: 330, anchor: 'middle' }, t, 1.6)}
  ${carve(TAGLINE, { font: 'italic', size: 21, x: W / 2, y: 362, fill: t.muted, anchor: 'middle' }, t)}
  ${groove(tx0, ty - 1, tx1, ty - 1, t)}
  <line class="prog" x1="${tx0}" y1="${ty}" x2="${tx1}" y2="${ty}" stroke="${t.iron}" stroke-width="3"/>
  ${marks}`,
  );
}

// ---------------------------------------------------------------- arsenal cards

function projectCard(t, p, info) {
  const W = 560, H = 318;
  const stars = info?.stars ?? 0;
  const version = info?.latest?.tagName ?? null;
  const desc = wrap(p.what, 'regular', 19, W - 128, 3)
    .map((l, i) => carve(l, { font: 'regular', size: 19, x: 64, y: 172 + i * 27 }, t))
    .join('');

  let x = 64;
  const fy = H - 46;
  let foot = '';
  if (stars) {
    foot += star(x + 8, fy - 6, 9, t.accent) + carve(String(stars), { font: 'black', size: 19, x: x + 22, y: fy }, t);
    x += 22 + layout(String(stars), 'black', 19).width + 18;
  }
  if (version) foot += carve(version, { font: 'italic', size: 19, x, y: fy, fill: t.accent }, t);
  if (!stars && !version) foot += carve(p.standing ?? '', { font: 'italic', size: 19, x, y: fy, fill: t.muted }, t);
  foot += carve(p.get.label.toUpperCase(), { font: 'caps', size: 13, spacing: 2, x: W - 64, y: fy, fill: t.muted, anchor: 'end' }, t);

  return svg(
    W, H, projectAlt(p, info), fontCss('black', 'regular', 'italic', 'caps'),
    `${frame(W, H, t)}
  ${heraldShield(64, 48, 62, p.name[0], t)}
  ${carve(p.name.toUpperCase(), { font: 'caps', size: 25, spacing: 3, x: 150, y: 88 }, t)}
  ${carve(p.role ?? p.built, { font: 'italic', size: 18, x: 150, y: 114, fill: t.muted }, t)}
  ${groove(64, 140, W - 64, 140, t)}
  ${desc}
  ${foot}`,
  );
}

function projectAlt(p, info) {
  const bits = [`${p.name}: ${p.what}`, p.built ? `Built with ${p.built}.` : p.role ? `${p.role}.` : ''];
  if (info?.stars) bits.push(`${info.stars} stars.`);
  if (info?.latest) bits.push(`Latest release ${info.latest.tagName}.`);
  if (!info?.stars && !info?.latest && p.standing) bits.push(`${p.standing}.`);
  return bits.filter(Boolean).join(' ');
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---------------------------------------------------------------- year in review

function yearCard(t, year, stats) {
  const W = 1280, H = 310, pad = 72;
  const colW = (W - 2 * pad) / stats.length;
  const cols = stats
    .map((s, i) => {
      const cx = pad + colW * (i + 0.5);
      const sep = i ? groove(pad + colW * i, 132, pad + colW * i, 258, t) : '';
      return `${sep}<g class="rise" style="animation-delay:${r1(0.1 + i * 0.12)}s">
    ${carve(fmt(s.value), { font: 'black', size: 66, x: cx, y: 194, anchor: 'middle' }, t, 1.8)}
    ${carve(s.label.toUpperCase(), { font: 'caps', size: 15, spacing: 2.6, x: cx, y: 228, fill: t.muted, anchor: 'middle' }, t)}
    ${carve(roman(s.value) || ' ', { font: 'italic', size: 18, x: cx, y: 254, fill: t.accent, anchor: 'middle' }, t)}
  </g>`;
    })
    .join('\n  ');

  const summary = stats.map((s) => `${fmt(s.value)} ${s.label.toLowerCase()}`).join(', ');
  return svg(
    W, H, `Year in review, ${year}: ${summary}.`, `${fontCss('black', 'italic', 'caps')}\n${RISE()}`,
    `${frame(W, H, t)}
  ${heading(W, 'YEAR IN REVIEW', `Anno Domini ${roman(year)}`, t)}
  ${cols}`,
  );
}

// ---------------------------------------------------------------- armoury

function toolShield(cx, y0, t) {
  const w = 62, h = 70;
  return `<path d="${shieldPath(cx - w / 2, y0, w, h)}" fill="${t.recess}" stroke="${t.shadow}" stroke-width="1.5"/>
  <path d="${shieldPath(cx - w / 2 + 4, y0 + 4, w - 8, h - 9)}" fill="none" stroke="${t.hi}" stroke-width="1" opacity=".9"/>
  ${rivet(cx - w / 2 + 7, y0 + 7, 2.6)}${rivet(cx + w / 2 - 7, y0 + 7, 2.6)}`;
}

function armoury(t) {
  const W = 1280, pad = 72, hallW = 250, cell = 150, rowH = 158, top = 128;
  const H = top + ARMOURY.length * rowH + 14;
  let n = 0;
  const rows = ARMOURY.map((row, ri) => {
    const y = top + ri * rowH;
    const sep = ri ? groove(pad, y - 14, W - pad, y - 14, t, ' stroke-dasharray="3 6"') : '';
    const hall = `${carve(row.hall.toUpperCase(), { font: 'caps', size: 17, spacing: 2.6, x: pad, y: y + 40 }, t)}
    ${carve(row.kind, { font: 'italic', size: 19, x: pad, y: y + 68, fill: t.muted }, t)}`;
    const tools = row.tools.map(([icon, label], i) => {
      const cx = pad + hallW + cell * (i + 0.5);
      let glyph;
      if (icon.mono) {
        glyph = `<rect x="${r1(cx - 15)}" y="${y + 16}" width="30" height="30" rx="6" fill="none" stroke="${t.ink}" stroke-width="2.2"/>
      ${text(icon.mono, { font: 'black', size: 16, x: cx, y: y + 37, fill: t.ink, anchor: 'middle' })}`;
      } else {
        if (!icons[icon]) throw new Error(`Missing icon in scripts/icons.json: ${icon}`);
        glyph = `<path transform="translate(${r1(cx - 14)} ${y + 17}) scale(${r1((28 / 24) * 1000) / 1000})" d="${icons[icon]}" fill="${t.ink}"/>`;
      }
      const caps = label.toUpperCase();
      let size = 14;
      while (size > 10 && layout(caps, 'caps', size, 1.6).width > cell - 14) size -= 0.5;
      return `<g class="rise" style="animation-delay:${r1(0.08 + n++ * 0.05)}s">${toolShield(cx, y, t)}
      ${glyph}
      ${carve(caps, { font: 'caps', size, spacing: 1.6, x: cx, y: y + 102, anchor: 'middle' }, t)}</g>`;
    });
    return `${sep}${hall}\n    ${tools.join('\n    ')}`;
  });

  const title = `The Armoury. ${ARMOURY.map((r) => `${r.kind[0].toUpperCase()}${r.kind.slice(1)}: ${r.tools.map(([, l]) => l).join(', ')}`).join('. ')}.`;
  return svg(
    W, H, title, `${fontCss('black', 'italic', 'caps')}\n${RISE()}`,
    `${frame(W, H, t)}
  ${heading(W, 'THE ARMOURY', 'Tools of the trade', t)}
  ${rows.join('\n  ')}`,
  );
}

// ---------------------------------------------------------------- dispatches

function dispatchCard(t, list) {
  const W = 1280, pad = 72, rowH = 74, top = 122;
  const H = top + Math.max(list.length, 1) * rowH + 26;
  const dateX = W - pad;
  const rows = list.map((r, i) => {
    const y = top + i * rowH;
    const cy = y + rowH / 2;
    const name = r.project.toUpperCase();
    const nameX = pad + 62;
    const nameW = layout(name, 'caps', 20, 2.4).width;
    const verX = nameX + nameW + 18;
    const verW = layout(r.tagName, 'italic', 23).width;
    const date = longDate(r.publishedAt);
    const dateW = layout(date, 'italic', 20).width;
    const lead0 = verX + verW + 18, lead1 = dateX - dateW - 18;
    const leader = lead1 - lead0 > 24 ? `<line x1="${r1(lead0)}" y1="${r1(cy + 6)}" x2="${r1(lead1)}" y2="${r1(cy + 6)}" stroke="${t.shadow}" stroke-width="2" stroke-linecap="round" stroke-dasharray="0 9"/>` : '';
    const sep = i ? groove(pad, y, W - pad, y, t) : '';
    return `${sep}<g class="rise" style="animation-delay:${r1(0.1 + i * 0.1)}s">
    ${heraldShield(pad + 2, cy - 22, 38, r.mark ?? r.project[0], t)}
    ${carve(name, { font: 'caps', size: 20, spacing: 2.4, x: nameX, y: cy + 7 }, t)}
    ${carve(r.tagName, { font: 'italic', size: 23, x: verX, y: cy + 7, fill: t.accent }, t)}
    ${leader}
    ${carve(date, { font: 'italic', size: 20, x: dateX, y: cy + 7, fill: t.muted, anchor: 'end' }, t)}
  </g>`;
  });
  const empty = list.length ? '' : carve('No dispatches yet.', { font: 'italic', size: 22, x: W / 2, y: top + 46, fill: t.muted, anchor: 'middle' }, t);

  return svg(
    W, H, dispatchAlt(list), `${fontCss('black', 'italic', 'caps')}\n${RISE('X', -10)}`,
    `${frame(W, H, t)}
  ${heading(W, 'LATEST DISPATCHES', 'Releases, as they leave the workshop', t)}
  ${rows.join('\n  ')}${empty}`,
  );
}

function dispatchAlt(list) {
  if (!list.length) return 'Latest dispatches: no releases yet.';
  return `Latest dispatches: ${list.map((r) => `${r.project} ${r.tagName}, ${longDate(r.publishedAt)}`).join('; ')}.`;
}

// ---------------------------------------------------------------- elsewhere tablets

function seal(t, s) {
  const H = 52;
  const label = s.label.toUpperCase();
  const lw = layout(label, 'caps', 13, 2).width;
  const W = Math.ceil(22 + 30 + 14 + lw + 30);
  return svg(
    W, H, s.alt, fontCss('black', 'caps'),
    `${defs(t)}
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="7" fill="url(#st)" stroke="${t.iron}" stroke-width="2"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="7" fill="#000" filter="url(#grain)" opacity=".18"/>
  <path d="M6 ${H - 6}V6H${W - 6}" fill="none" stroke="${t.hi}" stroke-width="1.5" opacity=".9"/>
  <path d="M${W - 6} 6V${H - 6}H6" fill="none" stroke="${t.shadow}" stroke-width="1.5"/>
  ${heraldShield(20, 9, 30, s.mark, t)}
  ${carve(label, { font: 'caps', size: 13, spacing: 2, x: 64, y: H / 2 + 5 }, t)}
  ${rivet(W - 13, H / 2, 3.5)}`,
  );
}

// ---------------------------------------------------------------- markdown

const themed = (base, alt, width, extra = '') =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.svg"><img alt="${esc(alt)}" src="${base}-light.svg" width="${width}"${extra}></picture>`;

function arsenal(repoInfo) {
  const cards = PROJECTS.map((p) => {
    const info = p.repo ? repoInfo.get(p.repo) : null;
    return `<a href="${esc(info?.url ?? p.url)}">${themed(`assets/arsenal/${slug(p.name)}`, projectAlt(p, info), '49%')}</a>`;
  });
  // Each card is one link; the "get it" destinations go underneath.
  const get = PROJECTS.map((p) => `<a href="${esc(p.get.url)}">${esc(p.name)}: ${esc(p.get.label)}</a>`).join(' · ');
  return `<p align="center">\n${cards.join('\n')}\n</p>\n\n<p align="center"><sub>${get}</sub></p>`;
}

function dispatches(list) {
  const picture = `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/dispatches-dark.svg">
  <img alt="${esc(dispatchAlt(list))}" src="assets/dispatches-light.svg" width="100%">
</picture>`;
  // The card is an image, so its rows can't be clicked; link each release underneath.
  const links = list.map((r) => `<a href="${esc(r.url)}">${esc(r.project)} ${esc(r.tagName)}</a>`).join(' · ');
  return list.length ? `${picture}\n\n<p align="center"><sub>${links}</sub></p>` : picture;
}

function seals() {
  const items = SEALS.map((s) => `<a href="${esc(s.url)}">${themed(`assets/seals/${s.id}`, s.alt, '', ' height="46"').replace(' width=""', '')}</a>`);
  return `<p align="center">\n  ${items.join('\n  ')}\n</p>`;
}

// ---------------------------------------------------------------- main

// --hourly refreshes everything except the year-in-review card, whose contribution count changes with
// nearly every commit; that card refreshes once a day so the bot doesn't commit every hour.
const HOURLY = process.argv.includes('--hourly');

async function main() {
  await loadFonts();
  const data = await fetchData(new Date());
  const files = new Map();

  for (const [name, t] of Object.entries(THEMES)) {
    files.set(`assets/banner-${name}.svg`, banner(t, data.year));
    if (!HOURLY) files.set(`assets/year-${name}.svg`, yearCard(t, data.year, data.stats));
    files.set(`assets/dispatches-${name}.svg`, dispatchCard(t, data.dispatches));
    files.set(`assets/armoury-${name}.svg`, armoury(t));
    for (const p of PROJECTS) files.set(`assets/arsenal/${slug(p.name)}-${name}.svg`, projectCard(t, p, p.repo ? data.repoInfo.get(p.repo) : null));
    for (const s of SEALS) files.set(`assets/seals/${s.id}-${name}.svg`, seal(t, s));
  }

  const template = await readFile(path.join(ROOT, 'README.template.md'), 'utf8');
  const readme = template
    .replace('{{ARSENAL}}', arsenal(data.repoInfo))
    .replace('{{DISPATCHES}}', dispatches(data.dispatches))
    .replace('{{SEALS}}', seals());
  const leftover = readme.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) throw new Error(`Unfilled placeholder in README.template.md: ${leftover[0]}`);
  files.set('README.md', `<!-- Generated by scripts/build.mjs from README.template.md. Edit the template, not this file. -->\n\n${readme}`);

  // Write only after everything built, so a failed fetch never leaves half-updated files.
  await mkdir(path.join(ROOT, 'assets/seals'), { recursive: true });
  await mkdir(path.join(ROOT, 'assets/arsenal'), { recursive: true });
  for (const [rel, content] of files) await writeFile(path.join(ROOT, rel), content);
  console.log(`Built ${files.size} files. ${data.stats.map((s) => `${s.label}: ${s.value}`).join(', ')}`);
}

export { PROJECTS, THEMES, fetchData, loadFonts, layout, text, fontCss, svg, esc, r1, roman, longDate, fmt };

// Run only when executed directly, so other scripts can import the helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
