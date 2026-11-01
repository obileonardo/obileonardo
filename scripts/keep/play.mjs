#!/usr/bin/env node
// Hold the Keep: plays every open move issue, oldest first, and redraws the board.
//
//   node scripts/keep/play.mjs            sweep open issues, write state, tiles and README section
//   node scripts/keep/play.mjs --reply    post the replies from the last sweep and close the issues
//   node scripts/keep/play.mjs --issues f  play the issues saved in f (a JSON list), for local tries
//
// The two halves are separate workflow steps so a reply only goes out after the new state is pushed.
// If the push fails, the issues stay open and the next run plays them again from the old state.
//
// Every run sweeps all open moves rather than the one issue that triggered it: GitHub keeps only
// one pending run per concurrency group and cancels the rest, so a burst of moves can lose runs but
// never moves. Issue titles are untrusted; they reach the rules only through parseMove's strict
// patterns, and nothing from an issue is ever run as code.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newAge, play } from './rules.mjs';
import { board, splice, versionUrls, REPO } from './render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = path.join(ROOT, 'game/state.json');
const OUTBOX = process.env.KEEP_OUTBOX || path.join(ROOT, 'game/.outbox.json');
const MAX_PER_RUN = 50;

function token() {
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (t) return t;
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
}

async function api(method, url, body) {
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hold-the-keep',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${url}: HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function loadState(now = new Date().toISOString()) {
  try {
    return JSON.parse(await readFile(STATE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return newAge(1, now);
  }
}

// Removes status panels that no longer describe the board. Shared with scripts/build.mjs.
export async function prunePanels(keep) {
  for (const f of await readdir(path.join(ROOT, 'assets/keep'))) {
    if ((f.startsWith('panel-') || f.startsWith('forgebar-')) && !keep.has(`assets/keep/${f}`)) await unlink(path.join(ROOT, 'assets/keep', f));
  }
}

// Writes the state, the tiles and panel it needs, and the README section.
async function writeBoard(state, B) {
  await mkdir(path.join(ROOT, 'game'), { recursive: true });
  await mkdir(path.join(ROOT, 'assets/keep'), { recursive: true });
  await writeFile(STATE, `${JSON.stringify(state, null, 1)}\n`);
  const { files, markdown } = board(state, B.THEMES, B);
  for (const [rel, svg] of files) await writeFile(path.join(ROOT, rel), svg);
  await prunePanels(new Set(files.keys()));
  const file = path.join(ROOT, 'README.md');
  await writeFile(file, splice(await readFile(file, 'utf8'), versionUrls(markdown, (rel) => files.get(rel) ?? null)));
}

async function openMoves() {
  // --issues <file> plays a saved list instead, for trying moves locally without GitHub.
  const i = process.argv.indexOf('--issues');
  const issues = i > 0
    ? JSON.parse(await readFile(process.argv[i + 1], 'utf8'))
    : await api('GET', `/repos/${REPO}/issues?state=open&sort=created&direction=asc&per_page=100`);
  return issues.filter((i) => !i.pull_request && /^\s*keep\s*:/i.test(i.title)).slice(0, MAX_PER_RUN);
}

async function sweep() {
  const B = await import('../build.mjs');
  await B.loadFonts();
  let state = await loadState();
  const outbox = [];
  for (const issue of await openMoves()) {
    const r = play(state, { title: issue.title, user: issue.user.login, at: issue.created_at, id: issue.number });
    state = r.state;
    outbox.push({ number: issue.number, ok: r.ok, reply: r.duplicate ? null : r.reply });
    console.log(`#${issue.number} ${issue.user.login}: ${issue.title} -> ${r.ok ? 'played' : r.duplicate ? 'already played' : 'refused'}`);
  }
  await writeBoard(state, B);
  await writeFile(OUTBOX, JSON.stringify(outbox));
  console.log(`Swept ${outbox.length} move(s). Age ${state.age}, keep ${state.cells.D4.hp}.`);
}

async function reply() {
  let outbox;
  try {
    outbox = JSON.parse(await readFile(OUTBOX, 'utf8'));
  } catch {
    return console.log('Nothing to reply to.');
  }
  for (const m of outbox) {
    if (m.reply) await api('POST', `/repos/${REPO}/issues/${m.number}/comments`, { body: m.reply });
    await api('PATCH', `/repos/${REPO}/issues/${m.number}`, { state: 'closed', state_reason: m.ok || !m.reply ? 'completed' : 'not_planned' });
  }
  console.log(`Replied to ${outbox.length} move(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv.includes('--reply') ? reply() : sweep()).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
