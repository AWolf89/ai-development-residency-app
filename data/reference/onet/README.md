# O\*NET source files (not committed)

The O\*NET database is large and distributed under a license you must accept
yourself, so its files are **git-ignored** and live only on your machine. The
importer reads whatever curated files it finds here.

## How to populate this folder

1. Go to the O\*NET Resource Center database download page:
   <https://www.onetcenter.org/database.html> → **Download the database**.
2. Choose the **text / tab-delimited** version (a `.zip` of `.txt` files). Accept
   the license agreement there (this is yours to accept; the agent will not).
3. Unzip it and copy these files directly into this folder
   (`data/reference/onet/`):
   - `Occupation Data.txt`
   - `Content Model Reference.txt`
   - `Skills.txt`
   - `Abilities.txt`
   - `Knowledge.txt`
   - `Work Activities.txt`
   - `Task Statements.txt`
4. (Optional) set `ONET_RELEASE` in `.env.local` to the version you downloaded
   (e.g. `29.1`) so it is recorded with the rows.
5. Run the import:

   ```bash
   npm run reference:import onet
   ```

Only the files listed above are needed for the curated subset. Extra tables are
ignored; missing ones are skipped with a note. Nothing in this folder except this
README is committed to git.

## Attribution

O\*NET data is used under its license; see
[`docs/reference-data-attributions.md`](../../../docs/reference-data-attributions.md).
