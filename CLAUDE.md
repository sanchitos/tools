# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Tools Jamaica — Storefront + Admin (Phase 1)

E-commerce catalog and admin back-office for **Tools Jamaica** (tools, hardware & supplies).
Phase 1 = public product catalog + admin CRUD. Cart, checkout, customer accounts, and
payments are deliberately deferred behind clean seams.

Architecture mirrors the SolarWorld CR platform: **Express is the sole gateway** —
it serves the built React SPA and the API under `/api/v1` on one Railway service
(same-origin, first-party httpOnly cookies). The browser never talks to Supabase directly.

Front-end design is the **Stitch "Industrial Integrity" design system** (source of truth).
Read the architecture doc before planning or modifying anything:

@ARCHITECTURE.md

## Layout

```
apps/
  api/      Express backend (also serves the built SPA)
  web/      React + Vite SPA
packages/
  shared/   canonical DTO types (@tools-jamaica/shared)
```

## Requirements

- Node **>= 24.15.0** (see `.nvmrc`)

## Getting started

```bash
nvm use            # 24.15.0
npm install
cp apps/api/.env.example apps/api/.env   # then fill in Supabase + cookie secrets
npm run dev        # api on :3000, web on :5173
```

Health check: `GET http://localhost:3000/health`.

## Scripts

| Script              | What                                        |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | api + web concurrently                      |
| `npm run build`     | build web then api                          |
| `npm start`         | run built server (`apps/api/dist/index.js`) |
| `npm run typecheck` | typecheck all workspaces                    |
| `npm run lint`      | eslint                                      |
| `npm test`          | api tests (vitest + supertest)              |

## Database

SQL migrations live in `apps/api/supabase/migrations/` and are run **by hand** in the
Supabase SQL Editor, in order. Never run SQL against Supabase directly from code.

## Working notes

- **Never run SQL against Supabase.** Add the next numbered `.sql` in
  `apps/api/supabase/migrations/` and let the user run it manually in the SQL
  Editor. Make column adds idempotent (`add column if not exists`) when amending
  a file the user may have already run. Latest migration: `0010_homepage_content`.
- **Add a DTO field:** edit `packages/shared/src/index.ts`, then the relevant
  `mappers.ts` and the row type in `apps/api/src/types/db.ts`. Shared is consumed
  from source, so no rebuild is needed.
- **Add translatable content:** add a nullable `<col>_es` sibling column (never a
  default — NULL means "not translated yet"), resolve it in the mapper with
  `pick()`/`pickNullable()` from `apps/api/src/lib/locale.ts`, and expose the raw
  `<col>Es` field on the **admin** DTO only. The locale parameter on every mapper
  is trailing and defaulted on purpose: that is what keeps admin DTOs English so
  the editor can't save Spanish over the English columns.
- **Add a UI string:** add the key to `apps/web/src/i18n/en.ts` **and**
  `es.ts` — `es.ts` is typed as `Dictionary`, so a missing key is a compile
  error. Components in `apps/web/src/components/ui/*` must NEVER import from
  `i18n/`: they are shared with the English admin back-office, so they take
  English-defaulted label props and the *public* callers pass `t(...)`.

## UI conventions (web)

- **Dropdowns:** use the shared `Select` component (`apps/web/src/components/ui/Select.tsx`),
  never a native `<select>` — the native popup mispositions in device emulation
  and is clipped by scroll containers.
- **Confirmations:** all destructive/irreversible actions use the shared
  `ConfirmDialog` (`apps/web/src/components/ui/ConfirmDialog.tsx`), never `window.confirm`.
- **Loading states:** use the `Loader` spinner (`apps/web/src/components/ui/Loader.tsx`), not
  plain "Loading…" text.
- **Images:** render product/remote images through `ImageWithFallback` so broken
  URLs degrade to a placeholder.
- **Responsive grids:** always set a base `grid-cols-1` (so the mobile track is
  `minmax(0,1fr)`) to avoid content-driven horizontal overflow.

## Plans

When you finish a plan in plan mode, also write a copy to `docs/<slug>.md` before
calling ExitPlanMode, so plans are version-controlled alongside the code.
