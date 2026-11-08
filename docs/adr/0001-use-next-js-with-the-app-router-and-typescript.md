---
status: proposed
date: 2026-11-07
decision-makers: Amanda Wolf
---

# 0001. Use Next.js with the App Router and TypeScript

## Context and Problem Statement

The Career Evidence Agent needs a web framework that pairs well with Vercel hosting and Material UI, and the residency's Week 3 class materials explicitly call for building with Next.js. As a solo builder still learning, type safety and a single framework for both UI and server code are valuable. Which framework and language should the app be built on?

## Decision Drivers

* The residency curriculum names Next.js as the required framework
* First-class, zero-config deployment on Vercel
* One codebase for UI, server rendering, and API routes
* Type safety to catch mistakes early for a beginner

## Considered Options

* Next.js (App Router) with TypeScript
* Plain React single-page app (Vite) with a separate API
* Remix with TypeScript

## Decision Outcome

Chosen option: "Next.js (App Router) with TypeScript", because it satisfies the course requirement, deploys to Vercel with no configuration, and keeps UI and server code in one typed project.

### Consequences

* Good, because UI, server components, and API routes live in one framework with one deploy
* Good, because TypeScript surfaces errors before they reach the browser
* Bad, because this Next.js version has breaking changes and a learning curve (the repo's `AGENTS.md` warns that its APIs differ from older docs)

### Confirmation

Confirmed by code review: the app is a Next.js project (`next.config.ts`, `src/app/`), TypeScript is enabled (`tsconfig.json`), and `npm run build` type-checks cleanly.

## Pros and Cons of the Options

### Next.js (App Router) with TypeScript

* Good, because it is the course-required framework with native Vercel support
* Good, because server components and route handlers remove the need for a separate backend
* Bad, because the App Router and this version's conventions are new and must be learned carefully

### Plain React single-page app (Vite) with a separate API

* Good, because it is simpler and closer to plain React
* Bad, because it needs a separate hosted backend and does not match the course requirement

### Remix with TypeScript

* Good, because it also offers server rendering and good data loading
* Bad, because it is not the course-specified stack and has weaker turnkey Vercel integration

## More Information

Week 3 class materials require Next.js + Material UI. See the repo's `AGENTS.md` for version-specific guidance. Related: [ADR-0002](0002-use-material-ui-for-the-interface.md), [ADR-0004](0004-host-the-app-on-vercel.md).
