#!/usr/bin/env node
// context-usage — report a chat's context-window usage by reading the session
// transcript JSONL that Claude Code / Cowork writes under ~/.claude/projects/.
//
// Each assistant turn in the transcript carries message.usage. The tokens
// currently occupying the window = input_tokens + cache_creation_input_tokens
// + cache_read_input_tokens on the most recent assistant turn.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`context-usage — show context-window usage from session transcripts

Usage:
  node context-usage.mjs [--session ID] [--project DIR] [--window N] [--all]

Options:
  --session ID   Session id (UUID) of the chat to inspect.
  --project DIR  Project working directory (used to locate / fall back).
  --window N     Override the context-window size (e.g. 1000000).
  --all          List every chat's usage instead of just the current one.
  --help         Show this help.

Env fallbacks: CLAUDE_SESSION_ID, CLAUDE_PROJECT_DIR, CONTEXT_WINDOW.`);
  process.exit(0);
}

function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

// A ${...} token that the harness never substituted should be treated as absent.
function real(v) {
  if (!v) return undefined;
  if (v.includes('${') || v.startsWith('$')) return undefined;
  return v;
}

const showAll = argv.includes('--all');
const sessionId = real(flag('--session')) || real(process.env.CLAUDE_SESSION_ID);
const projectDir =
  real(flag('--project')) || real(process.env.CLAUDE_PROJECT_DIR) || process.cwd();
const windowOverride =
  Number(real(flag('--window')) || real(process.env.CONTEXT_WINDOW)) || 0;

const projectsRoot = path.join(os.homedir(), '.claude', 'projects');

const safeReaddir = (d) => {
  try { return fs.readdirSync(d); } catch { return []; }
};
const isFile = (p) => {
  try { return fs.statSync(p).isFile(); } catch { return false; }
};
const mtime = (p) => {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
};

// cwd path -> the encoded folder name Claude uses under ~/.claude/projects
const encodeProject = (dir) => dir.replace(/[:\\/]/g, '-');

function findCurrentTranscript() {
  // 1) exact match by session id (the filename IS the session id)
  if (sessionId) {
    const direct = path.join(projectsRoot, encodeProject(projectDir), sessionId + '.jsonl');
    if (isFile(direct)) return direct;
    for (const d of safeReaddir(projectsRoot)) {
      const p = path.join(projectsRoot, d, sessionId + '.jsonl');
      if (isFile(p)) return p;
    }
  }
  // 2) fall back to the newest transcript in this project's folder
  const dir = path.join(projectsRoot, encodeProject(projectDir));
  return safeReaddir(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(dir, f))
    .filter(isFile)
    .sort((a, b) => mtime(b) - mtime(a))[0];
}

// Walk a transcript from the end; return the latest assistant usage + model.
function latestUsage(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return undefined; }
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const msg = rec && rec.message;
    if (rec.type === 'assistant' && msg && msg.usage) {
      return { usage: msg.usage, model: msg.model || 'unknown' };
    }
  }
  return undefined;
}

const usedTokens = (u) =>
  (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);

const windowFor = (used) => (windowOverride ? windowOverride : used > 200000 ? 1000000 : 200000);

const fmt = (n) => n.toLocaleString('en-US');

function bar(pct, width = 24) {
  const f = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '█'.repeat(f) + '░'.repeat(width - f);
}

const tier = (pct) => (pct >= 90 ? '🔴 critical' : pct >= 75 ? '⚠️ high' : '🟢 ok');

function reportOne() {
  const file = findCurrentTranscript();
  if (!file) {
    console.log('Context usage: could not find a transcript for this chat.');
    console.log(`Looked under: ${path.join(projectsRoot, encodeProject(projectDir))}`);
    return;
  }
  const data = latestUsage(file);
  if (!data) {
    console.log('Context usage: this chat has no model reply yet — nothing to measure.');
    return;
  }
  const u = data.usage;
  const used = usedTokens(u);
  const win = windowFor(used);
  const pct = (used / win) * 100;
  const note = windowOverride
    ? ''
    : win === 200000
      ? '  (assuming 200K window)'
      : '  (assuming 1M window)';

  console.log(`Context usage — ${data.model}`);
  console.log(`${bar(pct)}  ${pct.toFixed(1)}%   ${tier(pct)}`);
  console.log(`${fmt(used)} / ${fmt(win)} tokens${note}`);
  console.log('');
  const line = (label, n) => `  ${label.padEnd(20)}${fmt(n).padStart(9)}`;
  console.log('Last turn breakdown:');
  console.log(line('cached (read back)', u.cache_read_input_tokens || 0));
  console.log(line('newly cached', u.cache_creation_input_tokens || 0));
  console.log(line('fresh input', u.input_tokens || 0));
  console.log('  ' + '─'.repeat(29));
  console.log(line('in context', used));
  console.log(line('(reply output)', u.output_tokens || 0));
}

function reportAll() {
  const rows = [];
  for (const d of safeReaddir(projectsRoot)) {
    const dir = path.join(projectsRoot, d);
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    for (const f of safeReaddir(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const p = path.join(dir, f);
      if (!isFile(p)) continue;
      const data = latestUsage(p);
      if (!data) continue;
      const used = usedTokens(data.usage);
      const win = windowFor(used);
      rows.push({
        project: d.replace(/^[A-Za-z]--/, '').slice(0, 36),
        session: f.replace('.jsonl', ''),
        used,
        win,
        pct: (used / win) * 100,
        mtime: mtime(p),
      });
    }
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  if (!rows.length) {
    console.log('No chats with usage found.');
    return;
  }
  console.log(`All chats — ${rows.length} found (most recent activity first)`);
  console.log('');
  console.log('   %   used / window       session    project');
  for (const r of rows) {
    const pct = (r.pct.toFixed(0) + '%').padStart(4);
    const tok = `${fmt(r.used)}/${fmt(r.win)}`.padEnd(18);
    console.log(`${pct}  ${tok}  ${r.session.slice(0, 8)}   ${r.project}`);
  }
}

if (showAll) reportAll();
else reportOne();
