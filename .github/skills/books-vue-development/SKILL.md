---
name: books-vue-development
description: Build Vue 3 pages and components that follow Frappe Books renderer, routing, styling, and UI conventions.
---

# Frappe Books Vue development

## Renderer conventions

- Vue code lives under `src/`; use TypeScript in every component.
- Existing components primarily use `defineComponent` with the Options API. Follow the local component style unless Composition API is clearly a better fit for shared reactive setup.
- Use `setup()` for injections, refs, and composables when needed; register components, props, computed values, and methods through `defineComponent`.
- The global `fyo` instance is initialized in `src/initFyo.ts`. Keep accounting and document logic in Fyo/models rather than duplicating it in components.
- Use shared helpers from `src/utils/` for routing, dialogs, toasts, printing, files, and error handling.

## Components and state

- Reuse primitives in `src/components/` before adding a new control, modal, button, or dropdown.
- Keep page-level screens in `src/pages/` and domain-specific reusable UI in `src/components/`.
- Use props and emitted events for parent-child communication. Use provide/inject keys from `src/utils/injectionKeys` for application-wide services.
- Handle asynchronous actions with existing error and dialog helpers so failures are visible to users.
- Use `ipc` for host operations. It is supplied by Electron preload or `web/ipcFallback.ts` in browser mode.

## Routing

- Declare routes in `src/router.ts` using `createWebHistory()`.
- Preserve named views and route-prop mappings where a page supports quick edit.
- Use the existing `routeTo` helper or Vue Router APIs rather than manually mutating URLs.
- The web server must serve `index.html` for extensionless browser routes so direct links continue to work.

## Styling and accessibility

- Prefer Tailwind utility classes and existing CSS variables from `src/styles/index.css`.
- Support the existing dark-mode classes and RTL language direction.
- Preserve Electron-only drag regions by using `window-drag` and `window-no-drag` only where appropriate; they are harmless browser fallbacks.
- Keep controls keyboard accessible, label inputs, and use clear, concise UI text.
- Add `data-testid` attributes for stable UI-test targets when a user interaction is tested.

## Validation

- Run `yarn web:build` for renderer or browser-fallback changes.
- Use `yarn dev` to validate Electron behavior when changing desktop-specific UI or IPC use.
- Run `yarn uitest` for flows covered by Playwright after building the Electron source.
- Manually validate dark mode, the affected route, and relevant responsive or RTL behavior for visible UI changes.

