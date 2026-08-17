---
name: books-web-runtime
description: Develop and validate Frappe Books browser mode while preserving Electron compatibility and local-only security.
---

# Frappe Books web runtime

## Runtime model

`yarn web` builds the Vite renderer, restores the Node SQLite binding, and starts `web/server.ts`. The server binds only to `127.0.0.1:8080` by default.

- `web/ipcFallback.ts` installs `window.ipc` only when Electron has not provided it.
- `web/server.ts` serves `dist_web`, provides local RPC endpoints, and owns the SQLite process.
- `web/prepare.cjs` restores the Node `better-sqlite3` prebuild before server startup.
- `web/start.cjs` runs the TypeScript server with `ts-node` and path aliases.

Do not expose this server to the network without adding authentication, authorization, and a complete filesystem security review.

## Browser fallback rules

Keep the Electron preload API and browser fallback API behaviorally compatible:

- Persist browser configuration in local storage so values such as language survive reloads.
- Send database operations through `/api/rpc`; keep SQLite access server-side.
- Upload user-selected files to the local server before passing a path to backend code.
- Use browser downloads for exports and browser print windows for printing.
- Route database file destinations to the server-managed local database directory, not a download URL.
- Preserve valid `null` database values while converting JSON-serialized optional arguments back to `undefined` where required.

## Validation

- Run `yarn web:build` after renderer or fallback changes.
- Run `yarn web` and confirm `http://127.0.0.1:8080` serves the app.
- Exercise database create, connect, query, file upload, language persistence, and export behavior for changes that affect them.
- Verify direct browser routes return the SPA entry page rather than a static 404.

