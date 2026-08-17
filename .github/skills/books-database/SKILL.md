---
name: books-database
description: Change Frappe Books SQLite schemas, migrations, and renderer-to-backend database calls safely.
---

# Frappe Books database development

## Database boundary

- `backend/database/core.ts` implements SQLite and Knex operations.
- `backend/database/manager.ts` owns the active database connection, schema migration, patches, and allowed database methods.
- `fyo/core/dbHandler.ts` is the renderer-facing database abstraction.
- `fyo/demux/db.ts` bridges the renderer to the Electron or web IPC implementation.
- `utils/db/types.ts` defines shared database method signatures and query types.

Do not access SQLite directly from Vue code. Add behavior through the database manager/core and expose it through the existing demux interfaces.

## Schema and migration work

- Add or update schema definitions under `schemas/`.
- Make migrations and patches idempotent. Existing databases may be several releases behind.
- Use `backend/patches/` for versioned data or schema corrections; preserve patch ordering and version metadata.
- Keep custom-field handling and regional schemas in mind when changing schema maps.
- Test both a fresh database and an existing database migration path when practical.

## IPC compatibility

Electron IPC preserves `undefined` arguments, while browser JSON RPC serializes them as `null`. When exposing optional database arguments through web mode, normalize only optional call positions at the server boundary. Do not recursively convert `null`, because `null` can be valid persisted data.

## Native dependency requirements

SQLite uses `better-sqlite3`. Electron and Node have different native ABIs:

- Electron uses the repository's Electron rebuild workflow.
- Browser mode runs on Node and invokes `yarn web:prepare` before startup to restore the Node-compatible prebuild.

After changing the database boundary, verify an actual create/connect/query lifecycle rather than only loading the renderer.

