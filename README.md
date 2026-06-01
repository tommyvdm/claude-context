# claude-context

A tiny plugin that shows how full your **context window** is in a Claude Cowork (or Claude Code) chat — like Claude Code's `/context`, but as an installable, shareable command.

It reads the session transcript the app already writes to disk and reports the tokens occupying the window on the latest turn, as a percentage of the model's limit. The work is done by a small **local MCP tool** (no shell access required), so it runs inside Cowork.

## Install — Cowork (desktop app)

1. Open **Settings → Plugins** (it may be labelled *Marketplaces* or *Browse plugins*).
2. Choose **Add marketplace** and paste the repo URL:
   ```
   https://github.com/tommyvdm/claude-context
   ```
3. Install **context-usage** from the list.
4. Installing enables a local MCP server named `context-usage` — **approve it** if Cowork asks, then **restart Cowork** so the server loads.
5. Run it in any chat: `/context-usage`

## Install — Claude Code (CLI)

```
/plugin marketplace add tommyvdm/claude-context
/plugin install context-usage@claude-context
```

## Use

```
/context-usage          # this chat's usage
/context-usage all      # every chat, most recent first
```

You can also just ask: *"what's my context usage?"* — the model will call the `context_usage` tool.

Example:
```
Context usage — claude-opus-4-8
██████████████░░░░░░░░░░  57.8%   🟢 ok
115,565 / 200,000 tokens  (assuming 200K window)

Last turn breakdown:
  cached (read back)     111,049
  newly cached             4,514
  fresh input                  2
  ─────────────────────────────
  in context             115,565
  (reply output)             243
```

## How it works

- Every chat is logged to `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.
- Each assistant turn records `message.usage`. Tokens in the window =
  `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` on the
  most recent assistant turn.
- The plugin runs a **zero-dependency local MCP server** (`scripts/server.mjs`)
  exposing a `context_usage` tool. The `/context-usage` command calls that tool,
  which finds the active chat's transcript (or the one you name) and returns the
  meter. Using MCP instead of a shell command is what lets it work inside Cowork,
  where the model can't run ad-hoc shell.
- A CLI entry (`scripts/context-usage.mjs`) is also included for Claude Code
  terminal use; both share `scripts/usage-core.mjs`.

## Caveats

- The window size defaults to **200K** (auto-bumps to **1M** if usage exceeds 200K, or pass `window`). Extended-context plans can't always be detected from the transcript alone.
- This reports the **true %** of the model window. Claude Code's `/context` factors in an internal auto-compact buffer (threshold undocumented), so numbers won't match exactly.
- The "current chat" is resolved as the most recently active transcript; pass a `session_id` to target a specific one.
- Works wherever transcripts are on disk (Cowork, Claude Code). It cannot work in claude.ai chat, which keeps conversations server-side.
