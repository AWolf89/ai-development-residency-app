# Reference data attributions

The Career Evidence Agent's reference-data layer (E4) includes data from the
sources below. These attributions are required by the sources' licenses and must
be preserved anywhere the data is displayed or redistributed. See
[ADR-0008](adr/0008-store-reference-data-in-one-generic-read-only-table.md).

## Tech Fleet Skills & Practices Framework

> The Skills & Practices Framework by Tech Fleet, licensed under
> [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- Source: <https://github.com/techfleetworks/skills-and-practices-framework>
- Used in: `reference_items` rows where `source = 'techfleet-spf'`
- A vendored snapshot and its pinned version are recorded in
  [`data/reference/techfleet-spf/PROVENANCE.md`](../data/reference/techfleet-spf/PROVENANCE.md).

## O\*NET

This product includes information from the O\*NET Database, used under the
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license. O\*NET® is a
trademark of the U.S. Department of Labor, Employment and Training Administration
(USDOL/ETA). The Career Evidence Agent has not been reviewed or endorsed by
USDOL/ETA.

- Source: O\*NET Resource Center — <https://www.onetcenter.org/>
- License terms: <https://www.onetcenter.org/license_agreements.html>
- Used in: `reference_items` rows where `source = 'onet'`
- O\*NET files are provided locally and not committed; see
  [`data/reference/onet/README.md`](../data/reference/onet/README.md).

> Confirm the exact required wording against the current O\*NET license page when
> the data is first displayed in the app UI, and update this statement if O\*NET's
> terms have changed.
