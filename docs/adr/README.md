# Architecture Decision Records

This folder records the important technical decisions for this project: what we chose, what else we considered, and the costs we accepted. Code shows *what* the system does; these files explain *why*.

- One decision per file, named `NNNN-short-title.md`, numbered in order. Numbers are never reused.
- Format: MADR 4.0.0 (https://github.com/adr/madr), or Nygard's short format for small decisions.
- Accepted records are not edited. A changed decision gets a new record that supersedes the old one.
- Create one: `python3 tools/adr/new_adr.py "Use Supabase for the database"`
- Check them: `python3 tools/adr/check_adr.py` and `python3 tools/adr/check_adr_rules.py`

| ADR | Title | Status |
|---|---|---|
| [0001](0001-use-next-js-with-the-app-router-and-typescript.md) | Use Next.js with the App Router and TypeScript | proposed |
| [0002](0002-use-material-ui-for-the-interface.md) | Use Material UI for the interface | proposed |
| [0003](0003-use-supabase-for-the-database-with-row-level-security.md) | Use Supabase for the database with row-level security | proposed |
| [0004](0004-host-the-app-on-vercel.md) | Host the app on Vercel | proposed |
| [0005](0005-defer-ai-agent-features-to-later-weeks-for-the-week-3-releas.md) | Defer AI agent features to later weeks for the Week 3 release | proposed |
| [0006](0006-disable-cache-components-for-standard-supabase-authenticatio.md) | Disable Cache Components for standard Supabase authentication | proposed |
