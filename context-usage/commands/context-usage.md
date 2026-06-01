---
description: Show this chat's context-window usage (tokens and % of the model limit)
argument-hint: "[all]"
---
Call the **`context_usage`** tool (from the `context-usage` MCP server) to measure this conversation's context-window usage, then show the user the text it returns **exactly as-is** — it is preformatted, so do not summarize, reword, or add commentary unless they ask a follow-up.

If the user's argument is `all`, call the tool with `all: true` to list every chat instead of just the current one.
