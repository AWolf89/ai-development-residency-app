---
status: proposed
date: 2026-11-07
decision-makers: Amanda Wolf
---

# 0004. Host the app on Vercel

## Context and Problem Statement

The app needs hosting that deploys the Next.js project automatically from GitHub, with both a production site and preview environments, and the residency build plan specifies Vercel. Where should the Career Evidence Agent be hosted?

## Decision Drivers

* The residency build plan names Vercel as the host
* Native, zero-config Next.js deployment
* Automatic deploys from GitHub on every merge, with per-branch preview URLs
* Free tier suitable for a student project

## Considered Options

* Vercel
* Netlify
* Self-managed (Docker on a virtual private server)

## Decision Outcome

Chosen option: "Vercel", because it meets the course requirement, deploys the Next.js app with no configuration, and gives production plus preview environments automatically from GitHub.

### Consequences

* Good, because every merge to `main` auto-deploys and every branch gets its own preview URL
* Good, because the free Hobby tier covers this project with no setup overhead
* Bad, because some platform features create vendor lock-in, and the free tier has serverless function limits to watch as AI features arrive

### Confirmation

Confirmed by review: the GitHub repo is connected to Vercel, production deploys from `main`, and the live URL serves the app.

## Pros and Cons of the Options

### Vercel

* Good, because it is the course-required host with native Next.js support and automatic environments
* Bad, because advanced features are platform-specific and the free tier limits serverless usage

### Netlify

* Good, because it also offers Git-based deploys and a free tier
* Bad, because Next.js support is via an adapter rather than first-party, and it is not the course-specified host

### Self-managed (Docker on a virtual private server)

* Good, because it gives full control and avoids lock-in
* Bad, because the resident would have to build deploys, scaling, and TLS by hand — far more work and not the course requirement

## More Information

Residency build plan: three-tier (Vercel + Supabase + GitHub). Live site: https://ai-development-residency-app.vercel.app/. Related: [ADR-0001](0001-use-next-js-with-the-app-router-and-typescript.md), [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md).
