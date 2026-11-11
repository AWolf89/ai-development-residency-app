# Skills & Practices Framework — vendored snapshot

This folder holds a **curated, committed snapshot** of the Tech Fleet Skills &
Practices Framework data, used by the reference-data importer (E4). It is
committed (unlike the O\*NET files) because it is small (~3 MB) and openly
licensed, which keeps imports reproducible and lets tests run offline.

- **Source repo:** <https://github.com/techfleetworks/skills-and-practices-framework>
- **Pinned commit:** `393b40add509d616428ad4ae2e2c78eae76939a6` (branch `main`, 2026-11-09)
- **Snapshot path in source:** `data/json/`
- **Manifest version:** `v1`

## What is vendored (curated subset)

`manifest.json` plus these entity files under `framework-data/`:

`skills`, `practices`, `practice-components`, `duties`, `job-functions`,
`deliverables`, `activities`, `specializations`, `milestones`, `data-types`.

## Refreshing

Re-download the same entity files from a newer pinned commit, update the commit
above, and re-run `npm run reference:import framework`. The import is idempotent
(upsert on `source, entity_type, external_id`), so re-running is safe.

## License / attribution

The Skills & Practices Framework by Tech Fleet is licensed under CC BY 4.0. See
[`docs/reference-data-attributions.md`](../../../docs/reference-data-attributions.md).
