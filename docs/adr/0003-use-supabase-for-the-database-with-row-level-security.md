---
status: proposed
date: 2026-11-07
decision-makers: Amanda Wolf
---

# 0003. Use Supabase for the database with row-level security

## Context and Problem Statement

The Career Evidence Agent stores sensitive per-user data (career records, uploaded files) and must guarantee that each signed-in user can only ever see their own data. The residency build plan specifies Supabase, and the app also needs user sign-in and file storage. Which database and per-user security approach should the app use?

## Decision Drivers

* The residency build plan names Supabase as the database
* Hard requirement: each user sees only their own rows and files
* One service that bundles Postgres, authentication, and file storage
* Free tier suitable for a student project

## Considered Options

* Supabase (Postgres + Auth + Storage) with row-level security
* Firebase (Firestore + Auth)
* Raw Postgres with a hand-built auth layer

## Decision Outcome

Chosen option: "Supabase (Postgres + Auth + Storage) with row-level security", because it meets the course requirement and enforces per-user isolation inside the database itself through row-level security policies, while bundling auth and storage.

### Consequences

* Good, because row-level security enforces ownership at the database layer, not just in app code
* Good, because database, auth, and file storage come from one service with a free tier
* Bad, because a row-level security policy must be written and maintained for every table, adding complexity
* Bad, because tooling (the Supabase CLI and dashboard) is vendor-specific, though the underlying Postgres is portable

### Confirmation

Confirmed by review and tests: every user table has row-level security enabled with owner-only policies (checked by the Supabase skill's `check_rls.py`), and a cross-user isolation test shows one user retrieves zero of another user's rows and files.

## Pros and Cons of the Options

### Supabase (Postgres + Auth + Storage) with row-level security

* Good, because isolation is enforced in the database and auth/storage are included
* Good, because it is standard Postgres underneath, keeping data portable
* Bad, because policies add per-table work and the tooling is specific to Supabase

### Firebase (Firestore + Auth)

* Good, because it also bundles auth, storage, and a managed database
* Bad, because it is a NoSQL document store (less natural for relational career records) and is not the course-specified service

### Raw Postgres with a hand-built auth layer

* Good, because it is the most flexible and fully self-owned
* Bad, because building and securing auth, storage, and isolation by hand is far more work and more error-prone for a solo beginner

## More Information

Residency build plan: three-tier (Vercel + Supabase + GitHub) with secured user accounts. Security requirements covered: FR-1, NFR-2–NFR-4, NFR-8, NFR-10–NFR-14, NFR-21, NFR-22, NFR-26, NFR-32. Related: [ADR-0001](0001-use-next-js-with-the-app-router-and-typescript.md), [ADR-0004](0004-host-the-app-on-vercel.md).
