# Career Evidence Agent

Turn hidden experience into defensible, honest evidence for interviews and portfolios.

Built for the Tech Fleet AI Development Residency (premium specialization project).

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Material UI v9** (MUI) for interface components
- **Supabase** (Postgres + Auth) — added in E3
- Hosted on **Vercel**

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

Open http://localhost:3000.

## Accounts

Email/password sign-up and log-in are built on Supabase Auth (standard server-side
SSR pattern, see [ADR-0006](docs/adr/0006-disable-cache-components-for-standard-supabase-authenticatio.md)).

- **Sign up** at `/signup`, **log in** at `/login`, **log out** from `/dashboard` or the homepage.
- `/dashboard` is protected — signed-out visitors are redirected to `/login`.
- Each user sees and edits only their own data, enforced by Supabase Row-Level Security.

Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
`.env.local` (see `.env.example`).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — lint with ESLint
- `npm test` — run unit tests (Vitest)
- `npm run test:watch` — run unit tests in watch mode
- `npm run test:coverage` — unit tests with coverage (80% floor on pure-logic modules)

## Build plan (Foundation epics)

| Epic | Status |
| --- | --- |
| E1 · Repository and dev ops setup | Done |
| E2 · Hosting and environments (Vercel) | Done |
| E3 · Database and security foundation (Supabase) | Done — schema, RLS, and accounts |

See the CEA Kanban board and FigJam vision/scope for the full backlog.
