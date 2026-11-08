---
status: proposed
date: 2026-11-07
decision-makers: Amanda Wolf
---

# 0006. Disable Cache Components for standard Supabase authentication

## Context and Problem Statement

`create-next-app` enabled Next.js 16's experimental **Cache Components** feature (`cacheComponents: true`) in the scaffold. With it on, reading authentication cookies must happen behind a `<Suspense>` boundary or the build fails, which forces a more complex authentication pattern (a Data Access Layer, `use cache: private`, streamed auth UI). The app needs standard Supabase email sign-in with per-user data. Should the project keep Cache Components on or turn it off?

## Decision Drivers

* The Supabase server-side auth pattern reads cookies in server components and route handlers
* Beginner-friendly, well-documented code paths over bleeding-edge features
* Avoid build errors and extra complexity during the Week 3 hosting milestone
* Keep the option to revisit performance features later

## Considered Options

* Disable Cache Components (`cacheComponents: false`)
* Keep Cache Components on and adopt the cache-components auth pattern

## Decision Outcome

Chosen option: "Disable Cache Components (`cacheComponents: false`)", because it lets the app use the standard, documented Supabase server-side auth pattern without Suspense-boundary build errors, which is the right trade-off for a beginner project at the hosting stage.

### Consequences

* Good, because Supabase auth code works as documented, with no special caching boundaries
* Good, because there is less new, experimental surface area to learn and debug right now
* Bad, because the app forgoes Cache Components' prerendering/prefetching performance benefits for now (can be revisited in a later week with a superseding ADR)

### Confirmation

Confirmed by review: `next.config.ts` sets `cacheComponents: false`, and `npm run build` succeeds with the Supabase server client used directly in server components.

## Pros and Cons of the Options

### Disable Cache Components (`cacheComponents: false`)

* Good, because it enables the standard Supabase auth pattern and a clean build
* Bad, because it leaves newer caching performance features unused for now

### Keep Cache Components on and adopt the cache-components auth pattern

* Good, because it would use the newest performance model (streamed auth UI, cached session-derived data)
* Bad, because it requires Suspense boundaries, a Data Access Layer, and `use cache: private`, which is significantly more complex and error-prone for a beginner this week

## More Information

Background: Next.js "Authentication with Cache Components" guide (`node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`). Related: [ADR-0001](0001-use-next-js-with-the-app-router-and-typescript.md), [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md).
