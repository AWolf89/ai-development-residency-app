# O\*NET source files (not committed)

The O\*NET database is large and distributed under a license you must accept
yourself, so its files are **git-ignored** and live only on your machine. The
importer reads whatever curated files it finds here.

## How to populate this folder

1. Go to the O\*NET Resource Center database download page:
   <https://www.onetcenter.org/database.html> → **Excel, CSV, JSON** tab.
2. Choose the **JSON** format and accept the license agreement there (this is
   yours to accept; the agent will not). Download either the **All Files**
   archive (one download; only the curated files below are imported) or the
   individual files listed below.
3. Unzip and copy these `.json` files directly into this folder
   (`data/reference/onet/`):
   - `Occupation Data.json`
   - `Content Model Reference.json`
   - `Essential Skills.json`
   - `Transferable Skills.json`
   - `Abilities.json`
   - `Knowledge.json`
   - `Work Activities.json`
   - `Task Statements.json`
4. (Optional) set `ONET_RELEASE` in `.env.local` to the version you downloaded
   (e.g. `31.0`) so it is recorded with the rows.
5. Run the import:

   ```bash
   npm run reference:import onet
   ```

Only the files listed above are needed for the curated subset. Extra files are
ignored; missing ones are skipped with a note. Nothing in this folder except this
README is committed to git.

> O\*NET 31.0 ships JSON (not the old tab-delimited text) and splits skills into
> **Essential Skills** and **Transferable Skills** — both are loaded.

## Attribution

O\*NET data is used under its license; see
[`docs/reference-data-attributions.md`](../../../docs/reference-data-attributions.md).
