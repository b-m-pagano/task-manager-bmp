# Project rules

- vite.config.ts embeds the public backend URL/publishable key as a build-time fallback (`define`) — the published build once shipped without them and broke every page.
