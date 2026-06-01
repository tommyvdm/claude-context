#!/usr/bin/env node
// Minimal, zero-dependency MCP stdio server exposing a `context_usage` tool.
// Speaks newline-delimited JSON-RPC 2.0. Using MCP (rather than an ad-hoc shell
// command) is what lets this run inside Cowork, where the model can't shell out.

import { reportOne, reportAll } from './usage-core.mjs';

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const result = (id, res) => send({ jsonrpc: '2.0', id, result: res });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

const TOOLS = [
  {
    name: 'context_usage',
    description:
      "Report Claude's context-window usage (tokens in use vs the model's limit) for the current chat, read from the local session transcript. Pass all=true for a table of every chat.",
    inputSchema: {
      type: 'object',
      properties: {
        all: { type: 'boolean', description: 'List every chat instead of just the current one.' },
        session_id: { type: 'string', description: 'Optional session id (UUID) to inspect a specific chat.' },
        window: { type: 'number', description: 'Override the context-window size, e.g. 1000000.' },
      },
    },
  },
];

function handle(method, params, id) {
  const hasId = id !== undefined && id !== null;
  switch (method) {
    case 'initialize':
      return result(id, {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'context-usage', version: '0.2.0' },
      });
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      if (name !== 'context_usage') return fail(id, -32602, `Unknown tool: ${name}`);
      try {
        const windowOverride = Number(args.window) || 0;
        const text = args.all
          ? reportAll({ windowOverride })
          : reportOne({
              sessionId: args.session_id,
              projectDir: process.env.CLAUDE_PROJECT_DIR,
              windowOverride,
            });
        return result(id, { content: [{ type: 'text', text }] });
      } catch (e) {
        return result(id, {
          content: [{ type: 'text', text: 'context_usage failed: ' + (e && e.message) }],
          isError: true,
        });
      }
    }
    default:
      // Notifications (no id) are ignored; unknown requests get a clean error.
      if (hasId) return fail(id, -32601, `Method not found: ${method}`);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const batch = Array.isArray(msg) ? msg : [msg];
    for (const m of batch) handle(m.method, m.params, m.id);
  }
});
process.stdin.on('end', () => process.exit(0));
