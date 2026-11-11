/**
 * Pure mappers for the Tech Fleet Skills & Practices Framework (E4b).
 *
 * The framework publishes one JSON file per entity plus a manifest that names
 * each entity's file and its primary (display-name) field. These functions turn
 * a raw framework record into a validated ReferenceItem. No file or network IO
 * here — the boundary script reads the files and calls these (Humble Object).
 */
import { referenceItemSchema, type ReferenceItem } from "./types";

export const FRAMEWORK_SOURCE = "techfleet-spf";

/** The entity datasets we load (curated subset relevant to gap checks). */
export const FRAMEWORK_ENTITIES = [
  "skills",
  "practices",
  "practice-components",
  "duties",
  "job-functions",
  "deliverables",
  "activities",
  "specializations",
  "milestones",
  "data-types",
] as const;

export interface ManifestEntity {
  entity: string;
  file: string;
  count: number;
  primaryField: string;
}

export interface FrameworkManifest {
  framework: string;
  version: string;
  entities: ManifestEntity[];
}

/**
 * Return the manifest entries we intend to load, in manifest order, skipping
 * any the manifest does not describe. `allowed` defaults to FRAMEWORK_ENTITIES.
 */
export function selectManifestEntities(
  manifest: FrameworkManifest,
  allowed: readonly string[] = FRAMEWORK_ENTITIES
): ManifestEntity[] {
  const allow = new Set(allowed);
  return manifest.entities.filter((entry) => allow.has(entry.entity));
}

/**
 * Map one framework record to a validated ReferenceItem. Prefers the stable
 * `slug` as the external id and falls back to the numeric `id`. Throws (via Zod)
 * if the result is missing a name or an external id.
 */
export function mapFrameworkRecord(
  entityType: string,
  record: Record<string, unknown>,
  primaryField: string,
  sourceVersion: string | null
): ReferenceItem {
  const slug = typeof record.slug === "string" ? record.slug.trim() : "";
  const id = record.id;
  const externalId = slug !== "" ? slug : id != null ? String(id) : "";

  const rawName = record[primaryField];
  const name = typeof rawName === "string" ? rawName.trim() : "";

  return referenceItemSchema.parse({
    source: FRAMEWORK_SOURCE,
    entity_type: entityType,
    external_id: externalId,
    name,
    description: null,
    payload: record,
    source_version: sourceVersion,
  });
}

/** Map every record in one entity file. */
export function mapFrameworkEntity(
  entity: ManifestEntity,
  records: Record<string, unknown>[],
  sourceVersion: string | null
): ReferenceItem[] {
  return records.map((record) =>
    mapFrameworkRecord(
      entity.entity,
      record,
      entity.primaryField,
      sourceVersion
    )
  );
}
