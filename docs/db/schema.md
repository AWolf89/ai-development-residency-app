# Database schema — Career Evidence Agent

Entity-Relationship Diagram (ERD) of the Supabase Postgres schema created in E3
(Foundation). It is generated from the migration files in
[`supabase/migrations/`](../../supabase/migrations) and renders automatically on GitHub.

**Two things to know when reading it:**

- `auth_users` is Supabase's built-in authentication table (`auth.users`). The app does
  not create or own it; every application table links back to it.
- **Every application table carries a `user_id` and is protected by Row-Level Security
  (RLS)**, so a signed-in user can only ever read or write their own rows. `profiles` is
  the one exception to the column name: its primary key `id` *is* the user id (one
  profile per user). See [ADR-0003](../adr/0003-use-supabase-for-the-database-with-row-level-security.md).

Crow's-foot notation: `||` = exactly one, `o{` = zero-or-more (many).

```mermaid
erDiagram
    auth_users ||--|| profiles : "has"
    auth_users ||--o{ files : "owns"
    auth_users ||--o{ file_text : "owns"
    auth_users ||--o{ target_roles : "owns"
    auth_users ||--o{ role_requirements : "owns"
    auth_users ||--o{ decision_records : "owns"
    auth_users ||--o{ record_versions : "owns"
    auth_users ||--o{ evidence_links : "owns"
    auth_users ||--o{ record_requirement_links : "owns"
    auth_users ||--o{ extraction_runs : "owns"

    files ||--o{ file_text : "extracted into"
    files ||--o{ extraction_runs : "processed by"
    files ||--o{ evidence_links : "cited in"
    target_roles ||--o{ role_requirements : "broken into"
    decision_records ||--o{ record_versions : "snapshotted as"
    decision_records ||--o{ evidence_links : "supported by"
    decision_records ||--o{ record_requirement_links : "matched via"
    role_requirements ||--o{ record_requirement_links : "matched via"

    auth_users {
        uuid id PK "Supabase-managed auth user"
    }

    profiles {
        uuid id PK "= auth.users.id (1:1)"
        text display_name
        timestamptz created_at
        timestamptz updated_at
    }

    files {
        uuid id PK
        uuid user_id FK "owner"
        text storage_path
        text file_name
        text mime_type
        bigint size_bytes
        timestamptz created_at
        timestamptz updated_at
    }

    file_text {
        uuid id PK
        uuid user_id FK "owner"
        uuid file_id FK "source file"
        text content
        timestamptz created_at
        timestamptz updated_at
    }

    target_roles {
        uuid id PK
        uuid user_id FK "owner"
        text title
        text company
        text job_description
        timestamptz created_at
        timestamptz updated_at
    }

    role_requirements {
        uuid id PK
        uuid user_id FK "owner"
        uuid target_role_id FK "parent role"
        text requirement_text
        text category
        timestamptz created_at
        timestamptz updated_at
    }

    decision_records {
        uuid id PK
        uuid user_id FK "owner"
        text title
        text summary
        text reasoning
        text status "default 'draft'"
        timestamptz created_at
        timestamptz updated_at
    }

    record_versions {
        uuid id PK
        uuid user_id FK "owner"
        uuid decision_record_id FK "parent record"
        integer version_number
        jsonb content
        timestamptz created_at
    }

    evidence_links {
        uuid id PK
        uuid user_id FK "owner"
        uuid decision_record_id FK "record"
        uuid file_id FK "supporting file (nullable)"
        text note
        timestamptz created_at
    }

    record_requirement_links {
        uuid id PK
        uuid user_id FK "owner"
        uuid decision_record_id FK "record"
        uuid role_requirement_id FK "requirement"
        text match_strength
        timestamptz created_at
    }

    extraction_runs {
        uuid id PK
        uuid user_id FK "owner"
        uuid file_id FK "file processed (nullable)"
        text status "default 'pending'"
        text model
        text error
        timestamptz started_at
        timestamptz finished_at
        timestamptz created_at
    }
```

## Tables at a glance

| Table | Purpose |
| --- | --- |
| `profiles` | One row per user account, keyed to the auth user; created automatically on sign-up. |
| `files` | Metadata for a user's uploaded documents (the bytes live in Supabase Storage, bucket `user-files`). |
| `file_text` | Text extracted from a file. |
| `target_roles` | A job the user is aiming for. |
| `role_requirements` | One requirement parsed from a target role. |
| `decision_records` | A piece of career evidence — the core record. |
| `record_versions` | History snapshots of a decision record. |
| `evidence_links` | Connects a decision record to a supporting file. |
| `record_requirement_links` | Maps a decision record to a role requirement (the gap check). |
| `extraction_runs` | A log of each text-extraction / processing job. |

## Storage

File bytes are not stored in a table. They live in a private Supabase Storage bucket,
`user-files`, under a per-user folder (`<user_id>/<filename>`), with storage policies
that mirror the RLS rules above — a user can only touch objects in their own folder. See
[`supabase/migrations/20261107202128_create_storage_bucket.sql`](../../supabase/migrations/20261107202128_create_storage_bucket.sql).
