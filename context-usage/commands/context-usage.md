---
description: Show this chat's context-window usage (tokens and % of the model limit)
argument-hint: "[--all]"
allowed-tools: Bash(node:*)
---
Show the user the output below **exactly as printed** — it is already formatted, so do not summarize, reword, or add commentary unless they ask a follow-up question.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/context-usage.mjs" --session "${CLAUDE_SESSION_ID}" --project "${CLAUDE_PROJECT_DIR}" $ARGUMENTS`
