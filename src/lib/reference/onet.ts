/**
 * Pure parser and mappers for the O*NET curated subset (E4c).
 *
 * O*NET 31.0 distributes its database as Excel, CSV, or JSON (the old
 * tab-delimited text download is gone). Each JSON file is an object of the form
 * { table_id, title, description, column, row }, where `row` is an array of row
 * objects keyed by snake_case column_id (e.g. "onetsoc_code", "element_id").
 * These functions extract and map those rows into validated ReferenceItems. No
 * file IO here — the boundary script reads the files the user unzipped into the
 * git-ignored data/reference/onet/ folder.
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

/**
 * Extract the row array from an O*NET JSON file. O*NET 31.0 wraps rows in a
 * { column, row } object; a plain array is also accepted defensively.
 */
export function parseOnetJson(text: string): OnetRow[] {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data as OnetRow[];
  if (data && typeof data === "object" && Array.isArray(data.row)) {
    return data.row as OnetRow[];
  }
  throw new Error("O*NET JSON file has no row array");
}

export interface OnetTableConfig {
  /** File name as distributed by O*NET 31.0, e.g. "occupation_data.json". */
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

const SOC = "onetsoc_code";
const ELEMENT_ID = "element_id";
const ELEMENT_NAME = "element_name";
const SCALE_ID = "scale_id";

/** A rated attribute row (occupation × element × scale) — shared id/name shape. */
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
    file: "occupation_data.json",
    entityType: "occupation",
    externalId: (r) => cell(r, SOC),
    name: (r) => cell(r, "title"),
    description: (r) => cell(r, "description") || null,
  },
  {
    file: "content_model_reference.json",
    entityType: "content_model_element",
    externalId: (r) => cell(r, ELEMENT_ID),
    name: (r) => cell(r, ELEMENT_NAME),
    description: (r) => cell(r, "description") || null,
  },
  ratingTable("essential_skills.json", "occupation_skill"),
  ratingTable("transferable_skills.json", "occupation_transferable_skill"),
  ratingTable("abilities.json", "occupation_ability"),
  ratingTable("knowledge.json", "occupation_knowledge"),
  ratingTable("work_activities.json", "occupation_work_activity"),
  {
    file: "task_statements.json",
    entityType: "occupation_task",
    externalId: (r) => cell(r, "task_id"),
    name: (r) => cell(r, "task"),
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
