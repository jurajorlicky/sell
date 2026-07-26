<!-- Copilot instructions for repository contributors & AI agents -->
# Repository-focused Copilot instructions

Purpose: help AI coding agents be immediately productive in this codebase (frontend React + Supabase).

- **Big picture**: Single-page React app (Vite + TypeScript) that uses Supabase for auth, Realtime and Postgres access. Server-side code lives under `supabase/functions/` and SQL migrations under `supabase/migrations/`.

- **Key files/places to inspect**:
  - [src/lib/supabase.ts](../src/lib/supabase.ts) — Supabase client, required env vars and lightweight connection test.
  - [src/App.tsx](../src/App.tsx) — Auth flow, admin-status caching, lazy routes, short-query timeouts (Promise.race patterns).
  - [src/main.tsx](../src/main.tsx) — Error boundary + app bootstrap and `ToastProvider` usage.
  - [vite.config.ts](../vite.config.ts) — Build configuration, `version.json` emission, manualChunks config.
  - [package.json](../package.json) — Dev scripts: `npm run dev`, `npm run build` (runs `tsc && vite build`), `npm run deploy` (gh-pages).
  - `supabase/functions/` — server-side edge functions; inspect for API-like logic and DB access patterns. See [supabase/functions](../supabase/functions).
  - `supabase/migrations/` — DB migration SQL and naming conventions. See [supabase/migrations](../supabase/migrations).
  - [src/lib/pdfGenerator.ts](../src/lib/pdfGenerator.ts), [src/lib/email.ts](../src/lib/email.ts) — domain utilities (PDF/email behavior).

- **Environment & run instructions**:
  - Required env vars (use `.env` during local dev): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `src/lib/supabase.ts`).
  - Local dev: `npm run dev` (starts Vite). Build: `npm run build` (runs `tsc` then `vite build`). Deploy: `npm run deploy`.
  - Tailwind is used (`tailwind.config.js`, `postcss.config.js`) — rebuilds are handled by Vite.

- **Project-specific patterns & conventions** (important for code changes):
  - Query timeouts: many Supabase calls use `Promise.race` with short timeouts (1.5–3s). Preserve this pattern when adding network calls to avoid long UI hangs (examples in `src/App.tsx` and `src/lib/supabase.ts`).
  - Admin status caching: `App` uses an in-memory cache + `sessionStorage` keys prefixed `admin_` for admin membership checks — when modifying admin logic update both caches. See `checkAdminStatus` in `src/App.tsx`.
  - Lazy routes: pages/components are loaded with `React.lazy()` to produce separate chunks — follow this pattern for large admin pages (see `src/App.tsx`). Vite manualChunks are tuned in `vite.config.ts`.
  - Error handling: central `logger` (`src/lib/logger.ts`) is used across code; global error boundary exists in `src/main.tsx`. Use `logger.debug/info/warn/error` instead of console logs.
  - Edge/server code: `supabase/functions/*` are treated as server-side; avoid using browser-only APIs there.

- **Common integration gotchas**:
  - Build emits `version.json` (see `vite.config.ts`) and the app checks this file to auto-reload on new deploys. Don't break `version.json` emission.
  - `supabase.auth` flows are central. When changing auth handlers ensure `supabase.auth.onAuthStateChange` behavior in `src/App.tsx` remains consistent.
  - SQL migrations and storage policies live in `supabase/` — schema changes should be accompanied by SQL migration files.

- **When editing/adding code**:
  - Keep TypeScript types strict and run `tsc` locally (build runs `tsc` before `vite build`).
  - Follow existing caching/timeouts patterns rather than introducing unbounded waits.
  - For UI additions, prefer lazy-loaded page chunks for large admin views; add imports in `src/App.tsx` following existing lazy-import pattern.

- **Tests & validation**:
  - There are no unit tests in the repo by default. Validate changes by running `npm run dev`, exercising affected flows (auth, admin pages, PDF export, imports).

If anything here is unclear or you'd like more detail about a specific area (edge functions, migrations, or auth flows), tell me which part and I will expand the instructions.
