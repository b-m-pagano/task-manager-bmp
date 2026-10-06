# Project rules

- vite.config.ts embeds the public backend URL/publishable key as a build-time fallback (`define`) — the published build once shipped without them and broke every page.

- In-app assistant chat streams from the `/api/assistant` server route with its own task tools; conversations persist per user in assistant_threads/assistant_messages and the open thread lives in the `?chat=` URL param, so reloads restore it.
- Agenda operations (day schedule, scheduling, subtasks, replan) live once in src/lib/agent/operations.ts and are wrapped by both MCP tools and the in-app assistant, so both agents behave identically.
