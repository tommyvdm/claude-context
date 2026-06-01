# claude-context

A tiny plugin that shows how full your **context window** is in any Claude Cowork (or Claude Code) chat — like Claude Code's `/context`, but as an installable command you can share.

It reads the session transcript that the app already writes to disk and reports the tokens occupying the window on the latest turn, as a percentage of the model's limit.

This repo doubles as a one-plugin **marketplace**, so installing is the same idea everywhere: point your client at the repo, then enable the `context-usage` plugin.

## Install — Cowork (desktop app)

1. Open **Settings → Plugins** (it may be labelled *Marketplaces* or *Browse plugins*).
2. Choose **Add marketplace** and paste the repo URL:
   ```
   https://github.com/tommyvdm/claude-context
   ```
3. Install **context-usage** from the list.
4. Run it in any chat: `/context-usage`

## Install — Claude Code (CLI)

```
/plugin marketplace add tommyvdm/claude-context
/plugin install context-usage@claude-context
```

## Use

```
/context-usage          # this chat's usage
/context-usage --all    # every chat, most recent first
```

Example:
```
Context usage — claude-opus-4-7
████████░░░░░░░░░░░░░░░░  34.2%   🟢 ok
68,400 / 200,000 tokens  (assuming 200K window)

Last turn breakdown:
  cached (read back)   61,200
  newly cached          5,100
  fresh input           2,100
  ─────────────────────
  in context           68,400
  (reply output)        1,240
```

## How it works

- Every chat is logged to `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.
- Each assistant turn records `message.usage`. Tokens in the window =
  `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` on the
  most recent assistant turn.
- The command passes the current `${CLAUDE_SESSION_ID}` / `${CLAUDE_PROJECT_DIR}`
  to `scripts/context-usage.mjs`, which finds that transcript (falling back to
  the newest transcript in the project folder) and prints the meter.

## Caveats

- The window size defaults to **200K** (auto-bumps to **1M** if usage exceeds 200K, or set `--window`). Extended-context plans can't always be detected from the transcript alone.
- This reports the **true %** of the model window. Claude Code's `/context` factors in an internal auto-compact buffer (threshold undocumented), so numbers won't match exactly.
- Works wherever transcripts are on disk (Cowork, Claude Code). It cannot work in claude.ai chat, which keeps conversations server-side.
