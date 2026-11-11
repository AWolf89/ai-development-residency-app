---
status: proposed
date: 2026-11-11
decision-makers: Amanda Wolf
---

# 0007. Handle user career data with a privacy-by-default policy

## Context and Problem Statement

The Career Evidence Agent stores personal, sometimes sensitive career data: uploaded documents (resumes, performance reviews) and their extracted text, target roles, and decision records — all keyed to a Supabase auth user and isolated per user by Row-Level Security (see [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md)). The app is intended for real external users, which brings obligations under GDPR and CCPA, and Week 4 will send some of this data to third-party language models. Before building further on this data, we need one decision covering what we store, where it lives, who can see it, how it is deleted, and the rule for exposing it to AI providers.

## Decision Drivers

* Real external users means GDPR/CCPA obligations: a lawful basis, data-subject rights (access, correction, export, erasure), and agreements with every sub-processor
* Career documents can contain sensitive data about the user and about named third parties
* The largest exposure is the deferred AI features sending career text to third-party model providers (Week 4)
* Deletion must be complete: today, deleting a user removes database rows but leaves the file bytes orphaned in Storage
* Keep the policy right-sized for a pre-launch MVP while committing to the correct defaults now

## Considered Options

* Adopt a privacy-by-default data-handling policy now, scoped for external users
* Defer any formal data-privacy policy until just before public launch
* Handle privacy ad hoc per feature, with no central policy

## Decision Outcome

Chosen option: "Adopt a privacy-by-default data-handling policy now, scoped for external users", because it commits to the correct defaults while the data surface is small and cheap to change, and it closes known gaps before they ship. The policy has five parts.

1. **What we store (data minimization).** Only data the product needs: identity (Supabase `auth.users` email and hashed password, `profiles.display_name`), uploaded files and their extracted text, target roles and parsed requirements, decision records and their versions, and processing logs. Nothing is collected "just in case."
2. **Lawful basis and consent.** Processing of career documents relies on the user's consent, captured at sign-up alongside a privacy policy. Each third party that processes user data — Supabase (database and storage), Vercel (hosting), and, from Week 4, OpenRouter and the model providers it routes to — is a sub-processor under a data-processing agreement.
3. **Who can see it.** Only the owning user. Enforced by Row-Level Security on every application table and by per-user folder policies on the `user-files` Storage bucket, which stays private (see [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md)). The Supabase service role bypasses RLS and is used only in trusted server-side code, never exposed to the browser. No cross-user sharing exists.
4. **How it is deleted.** Users can delete their account, and individual files, themselves. Deletion is an immediate hard delete: all database rows are removed (via `on delete cascade` from the auth user) and the application explicitly removes the corresponding objects from the `user-files` Storage bucket. Automated database backups retain data until they age out on their normal retention cycle; backups are not surgically edited, and this is disclosed in the privacy policy.
5. **AI exposure (binding on Week 4).** When AI features send career text to model providers, calls may go only to providers that do not retain prompts and do not train on them; only the minimum extracted text needed is sent, never raw file bytes; and this is a hard requirement the Week 4 `llm-integration` work must satisfy.

Data residency: the Supabase project is hosted in **us-east-1 (AWS US East, N. Virginia)**. Standard Contractual Clauses (the standard legal mechanism for moving EU/UK personal data outside its region) are the transfer basis for any user outside the US. The final region is revisited based on real user geography before public launch.

### Consequences

* Good, because the correct privacy defaults are committed now, while the data surface is small and easy to change
* Good, because it closes the Storage-deletion gap before real user files exist
* Good, because Week 4 AI work starts from a clear, binding privacy constraint instead of a retrofit
* Bad, because it commits us to building real erasure, consent capture, and sub-processor paperwork that an MVP could otherwise postpone
* Bad, because the account-deletion flow and privacy policy become required work, not optional
* Bad, because hosting in us-east-1 relies on SCCs for non-US users rather than in-region storage

### Confirmation

Enforced three ways: (1) code review of the account-deletion path confirms it removes Storage objects as well as database rows; (2) the Week 4 `llm-integration` change must show its provider routing honors the no-retention/no-training rule; (3) the rule below keeps the `user-files` Storage bucket private in migrations, checked in CI once this ADR is accepted.

```adr-rules
[
  {"id": "user-files-bucket-stays-private",
   "description": "Keep the user-files storage bucket private; do not create or set it public.",
   "files": ["supabase/migrations/**/*.sql"],
   "forbid": "(public\\s*=\\s*true|'user-files'[^)]*,\\s*true)",
   "allow_in": []}
]
```

## Pros and Cons of the Options

### Adopt a privacy-by-default data-handling policy now, scoped for external users

* Good, because it sets the right defaults cheaply while the app is small and pre-launch
* Good, because it closes a known gap (Storage deletion) and constrains the riskiest future feature (AI exposure)
* Bad, because it obliges us to build erasure, consent, and sub-processor agreements sooner

### Defer any formal data-privacy policy until just before public launch

* Good, because it keeps near-term effort focused on features
* Bad, because schema and habits harden in the meantime, making privacy a costly retrofit, and it leaves the Storage-deletion gap and AI exposure unaddressed

### Handle privacy ad hoc per feature, with no central policy

* Good, because each feature can move without waiting on a policy
* Bad, because inconsistent handling is how leaks and incomplete deletion happen, with no single place that states the rules

## More Information

Revisit before public launch: finalize data residency against real user geography, confirm the privacy-policy and consent copy, and complete sub-processor data-processing agreements. Related: [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md) (RLS and per-user ownership) and [ADR-0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md) (AI features deferred to Weeks 4/6/7). The binding AI rule in part 5 must be honored by the Week 4 `llm-integration` work.
