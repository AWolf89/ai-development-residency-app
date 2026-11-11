/**
 * Pure parser and mappers for the O*NET curated subset (E4c).
 *
 * O*NET publishes its database as tab-delimited text files, one per table, each
 * with a header row. These functions parse that text and map rows into validated
 * ReferenceItems. No file IO here — the boundary script reads the files the user
 * placed in the git-ignored data/reference/onet/ folder and calls these.
 *
 * O*NET® is a trademark of the U.S. Department of Labor, Employment and Training
 * Administration. See docs/reference-data-attributions.md.
 */
import { referenceItemSchema, type ReferenceItem } from "./types";

export const ONET_SOURCE = "onet";

/** Parse O*NET tab-delimited text into row objects keyed by header name. */
export function parseOnetTsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

export interface OnetTableConfig {
  /** File name as distributed by O*NET, e.g. "Occupation Data.txt". */
  file: string;
  /** entity_type written to reference_items, e.g. "occupation". */
  entityType: string;
  /** Build the row's external id (must be unique within the entity_type). */
  externalId: (row: Record<string, string>) => string;
  /** Build the display name. */
  name: (row: Record<string, string>) => string;
  /** Optional description. */
  description?: (row: Record<string, string>) => string | null;
}

const SOC = "O*NET-SOC Code";
const ELEMENT_ID = "Element ID";
const ELEMENT_NAME = "Element Name";
const SCALE_ID = "Scale ID";

/**
 * The curated subset we load: occupations, the four rated attribute tables,
 * tasks, and the content-model reference so element codes resolve to names.
 * An occupation×element rating row is unique by SOC + element + scale.
 */
export const ONET_TABLES: OnetTableConfig[] = [
  {
    file: "Occupation Data.txt",
    entityType: "occupation",
    externalId: (r) => r[SOC],
    name: (r) => r["Title"],
    description: (r) => r["Description"] || null,
  },
  {
    file: "Content Model Reference.txt",
    entityType: "content_model_element",
    externalId: (r) => r[ELEMENT_ID],
    name: (r) => r[ELEMENT_NAME],
    description: (r) => r["Description"] || null,
  },
  {
    file: "Skills.txt",
    entityType: "occupation_skill",
    externalId: (r) => `${r[SOC]}:${r[ELEMENT_ID]}:${r[SCALE_ID]}`,
    name: (r) => r[ELEMENT_NAME],
  },
  {
    file: "Abilities.txt",
    entityType: "occupation_ability",
    externalId: (r) => `${r[SOC]}:${r[ELEMENT_ID]}:${r[SCALE_ID]}`,
    name: (r) => r[ELEMENT_NAME],
  },
  {
    file: "Knowledge.txt",
    entityType: "occupation_knowledge",
    externalId: (r) => `${r[SOC]}:${r[ELEMENT_ID]}:${r[SCALE_ID]}`,
    name: (r) => r[ELEMENT_NAME],
  },
  {
    file: "Work Activities.txt",
    entityType: "occupation_work_activity",
    externalId: (r) => `${r[SOC]}:${r[ELEMENT_ID]}:${r[SCALE_ID]}`,
    name: (r) => r[ELEMENT_NAME],
  },
  {
    file: "Task Statements.txt",
    entityType: "occupation_task",
    externalId: (r) => r["Task ID"],
    name: (r) => r["Task"],
  },
];

/** Map one parsed O*NET row to a validated ReferenceItem. */
export function mapOnetRow(
  config: OnetTableConfig,
  row: Record<string, string>,
  sourceVersion: string | null
): ReferenceItem {
  const description = config.description ? config.description(row) : null;
  return referenceItemSchema.parse({
    source: ONET_SOURCE,
    entity_type: config.entityType,
    external_id: config.externalId(row),
    name: config.name(row),
    description,
    payload: row,
    source_version: sourceVersion,
  });
}
