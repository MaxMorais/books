---
name: books-development
description: Work effectively in the Frappe Books Vue, TypeScript, Fyo, and Electron codebase.
---

# Frappe Books development

## Architecture

- `src/` is the Vue 3 renderer, including pages, controls, router, and UI utilities.
- `fyo/` contains the document, model, database, configuration, and translation abstractions used by the renderer.
- `models/`, `schemas/`, `reports/`, and `regional/` define accounting behavior and domain-specific features.
- `backend/` owns SQLite access, migrations, and backend-only helpers.
- `main/` and `main.ts` implement the Electron main process and preload IPC surface.
- `web/` supplies the local browser runtime without Electron.

Keep domain behavior in Fyo/models rather than embedding it in Vue components. Keep renderer access to host capabilities behind `ipc`.

## Development workflow

- Use Node `20.18.1` and Yarn Classic, matching CI.
- Run `yarn dev` for Electron development and `yarn web` for the local browser runtime.
- Run the smallest relevant test with `yarn test <path>` when changing business logic.
- Run `yarn lint` and `yarn prettier --check .` before submitting broad TypeScript or Vue changes.
- Use TypeScript in both `.ts` and `.vue` files. Follow the repository's Prettier configuration.

## Change guidelines

- Preserve progressive disclosure: large features belong behind existing feature flags or settings.
- Prefer readable, short functions and early exits. Add comments only for logic that cannot be clear from names and structure.
- Add tests for changed accounting, model, or database behavior. Do not alter unrelated existing tests.
- Update user-facing documentation for behavior that needs explanation.

