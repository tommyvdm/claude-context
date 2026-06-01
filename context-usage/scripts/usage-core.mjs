// Shared logic for the context-usage plugin: locate a chat's transcript and
// compute context-window occupancy from the latest assistant turn's usage.
// No dependencies — imported by both the MCP server and the CLI entry.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const projectsRoot = path.join(os.homedir(), '.claude', 'projects');

const safeReaddir = (d) => {
  try { return fs.readdirSync(d); } catch { return []; }
};
const isFile = (p) => {
  try { return fs.statSync(p).isFile(); } catch { return false; }
};
const isDir = (p) => {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
};
const mtime = (p) => {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
};

// cwd path -> the encoded folder name Claude uses under ~/.claude/projects
const encodeProject = (dir) => dir.replace(/[:\\/]/g, '-');

export function findBySession(sessionId, projectDir) {
  if (!sessionId) return undefined;
  if (projectDir) {
    const direct = path.join(projectsRoot, encodeProject(projectDir), sessionId + '.jsonl');
    if (isFile(direct)) return direct;
  }
  for (const d of safeReaddir(projectsRoot)) {
    const p = path.join(projectsRoot, d, sessionId + '.jsonl');
    if (isFile(p)) return p;
  }
  return undefined;
}

export function newestInProject(projectDir) {
  if (!projectDir) return undefined;
  const dir = path.join(projectsRoot, encodeProject(projectDir));
  return safeReaddir(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(dir, f))
    .filter(isFile)
    .sort((a, b) => mtime(b) - mtime(a))[0];
}

// The active chat = the most recently written top-level transcript anywhere.
export function newestAcrossProjects() {
  let best;
  let bestM = -1;
  for (const d of safeReaddir(projectsRoot)) {
    const dir = path.join(projectsRoot, d);
    if (!isDir(dir)) continue;
    for (const f of safeReaddir(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const p = path.join(dir, f);
      if (!isFile(p)) continue;
      const m = mtime(p);
      if (m > bestM) {
        bestM = m;
        best = p;
      }
    }
  }
  return best;
}

// Walk a transcript from the end; return the latest assistant usage + model.
export function latestUsage(file) {
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

export const usedTokens = (u) =>
  (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);

export const windowFor = (used, override) =>
  override ? override : used > 200000 ? 1000000 : 200000;

const fmt = (n) => n.toLocaleString('en-US');

function bar(pct, width = 24) {
  const f = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '█'.repeat(f) + '░'.repeat(width - f);
}

const tier = (pct) => (pct >= 90 ? '🔴 critical' : pct >= 75 ? '⚠️ high' : '🟢 ok');

// Resolve the transcript to report on: explicit session id, then this project's
// newest, then the most recently active chat anywhere.
function resolveFile({ sessionId, projectDir } = {}) {
  return (
    findBySession(sessionId, projectDir) ||
    newestInProject(projectDir) ||
    newestAcrossProjects()
  );
}

export function reportOne({ sessionId, projectDir, windowOverride } = {}) {
  const file = resolveFile({ sessionId, projectDir });
  if (!file) return 'Context usage: no chat transcript found.';
  const data = latestUsage(file);
  if (!data) return 'Context usage: this chat has no model reply yet — nothing to measure.';
  const u = data.usage;
  const used = usedTokens(u);
  const win = windowFor(used, windowOverride);
  const pct = (used / win) * 100;
  const note = windowOverride
    ? ''
    : win === 200000
      ? '  (assuming 200K window)'
      : '  (assuming 1M window)';
  const line = (label, n) => `  ${label.padEnd(20)}${fmt(n).padStart(9)}`;
  return [
    `Context usage — ${data.model}`,
    `${bar(pct)}  ${pct.toFixed(1)}%   ${tier(pct)}`,
    `${fmt(used)} / ${fmt(win)} tokens${note}`,
    '',
    'Last turn breakdown:',
    line('cached (read back)', u.cache_read_input_tokens || 0),
    line('newly cached', u.cache_creation_input_tokens || 0),
    line('fresh input', u.input_tokens || 0),
    '  ' + '─'.repeat(29),
    line('in context', used),
    line('(reply output)', u.output_tokens || 0),
  ].join('\n');
}

export function reportAll({ windowOverride } = {}) {
  const rows = [];
  for (const d of safeReaddir(projectsRoot)) {
    const dir = path.join(projectsRoot, d);
    if (!isDir(dir)) continue;
    for (const f of safeReaddir(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const p = path.join(dir, f);
      if (!isFile(p)) continue;
      const data = latestUsage(p);
      if (!data) continue;
      const used = usedTokens(data.usage);
      const win = windowFor(used, windowOverride);
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
  if (!rows.length) return 'No chats with usage found.';
  const out = [
    `All chats — ${rows.length} found (most recent activity first)`,
    '',
    '   %   used / window       session    project',
  ];
  for (const r of rows) {
    const pct = (r.pct.toFixed(0) + '%').padStart(4);
    const tok = `${fmt(r.used)}/${fmt(r.win)}`.padEnd(18);
    out.push(`${pct}  ${tok}  ${r.session.slice(0, 8)}   ${r.project}`);
  }
  return out.join('\n');
}
