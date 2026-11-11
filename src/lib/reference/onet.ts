/**
 * Pure parser and mappers for the O*NET curated subset (E4c).
 *
 * O*NET 31.0 distributes its database as Excel, CSV, or JSON (the old
 * tab-delimited text download is gone). We use the JSON files: each is an array
 * of row objects keyed by column name. These functions parse that JSON and map
 * rows into validated ReferenceItems. No file IO here — the boundary script reads
 * the files the user placed in the git-ignored data/reference/onet/ folder.
 *
 * O*NET® is a trademark of the U.S. Department of Labor, Employment and Training
 * Administration. See docs/reference-data-attributions.md.
 */
import { referenceItemSchema, type ReferenceItem } from "./types";

export const ONET_SOURCE = "onet";

export type OnetRow = Record<string, unknown>;

/** Coerce a (possibly missing or non-string) cell value to a trimmed string. */
export function cell(row: OnetRow, key: string): string {
  const value = row[key];
  return value == null ? "" : String(value).trim();
}

/** Parse an O*NET JSON file (an array of row objects). Throws if not an array. */
export function parseOnetJson(text: string): OnetRow[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error("O*NET JSON file is not an array of rows");
  }
  return data as OnetRow[];
}

export interface OnetTableConfig {
  /** File name as distributed by O*NET 31.0, e.g. "Occupation Data.json". */
  file: string;
  /** entity_type written to reference_items, e.g. "occupation". */
  entityType: string;
  /** Build the row's external id (must be unique within the entity_type). */
  externalId: (row: OnetRow) => string;
  /** Build the display name. */
  name: (row: OnetRow) => string;
  /** Optional description. */
  description?: (row: OnetRow) => string | null;
}

const SOC = "O*NET-SOC Code";
const ELEMENT_ID = "Element ID";
const ELEMENT_NAME = "Element Name";
const SCALE_ID = "Scale ID";

/** A rated attribute row (SOC × element × scale) — shared id/name shape. */
function ratingTable(file: string, entityType: string): OnetTableConfig {
  return {
    file,
    entityType,
    externalId: (r) =>
      `${cell(r, SOC)}:${cell(r, ELEMENT_ID)}:${cell(r, SCALE_ID)}`,
    name: (r) => cell(r, ELEMENT_NAME),
  };
}

/**
 * The curated subset we load from O*NET 31.0: occupations, the rated attribute
 * tables (31.0 splits skills into Essential and Transferable), tasks, and the
 * content-model reference so element codes resolve to names. Files absent from
 * the download are skipped by the importer.
 */
export const ONET_TABLES: OnetTableConfig[] = [
  {
    file: "Occupation Data.json",
    entityType: "occupation",
    externalId: (r) => cell(r, SOC),
    name: (r) => cell(r, "Title"),
    description: (r) => cell(r, "Description") || null,
  },
  {
    file: "Content Model Reference.json",
    entityType: "content_model_element",
    externalId: (r) => cell(r, ELEMENT_ID),
    name: (r) => cell(r, ELEMENT_NAME),
    description: (r) => cell(r, "Description") || null,
  },
  ratingTable("Essential Skills.json", "occupation_skill"),
  ratingTable("Transferable Skills.json", "occupation_transferable_skill"),
  ratingTable("Abilities.json", "occupation_ability"),
  ratingTable("Knowledge.json", "occupation_knowledge"),
  ratingTable("Work Activities.json", "occupation_work_activity"),
  {
    file: "Task Statements.json",
    entityType: "occupation_task",
    externalId: (r) => cell(r, "Task ID"),
    name: (r) => cell(r, "Task"),
  },
];

/** Map one O*NET row to a validated ReferenceItem. */
export function mapOnetRow(
  config: OnetTableConfig,
  row: OnetRow,
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
