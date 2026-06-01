#!/usr/bin/env node
// CLI entry — handy in the Claude Code terminal (where shell is allowed).
// In Cowork the same logic is reached via the MCP server (server.mjs).

import { reportOne, reportAll } from './usage-core.mjs';

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
// A ${...} token the harness never substituted should be treated as absent.
const real = (v) => (!v || v.includes('${') || v.startsWith('$') ? undefined : v);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: node context-usage.mjs [--session ID] [--project DIR] [--window N] [--all]');
  process.exit(0);
}

const windowOverride = Number(real(flag('--window')) || real(process.env.CONTEXT_WINDOW)) || 0;

if (argv.includes('--all')) {
  console.log(reportAll({ windowOverride }));
} else {
  console.log(
    reportOne({
      sessionId: real(flag('--session')) || real(process.env.CLAUDE_SESSION_ID),
      projectDir: real(flag('--project')) || real(process.env.CLAUDE_PROJECT_DIR) || process.cwd(),
      windowOverride,
    }),
  );
}
