/**
 * Pure, dependency-free validation for a project (create + edit).
 *
 * Humble Object: no network, no framework, no Supabase — just plain inputs and a
 * result object, so every branch is unit-testable with canned values. The Server
 * Action calls this before writing, so a blank or malformed project never reaches
 * the database.
 */

/** Length caps. A project `name` is required; the rest are optional. */
export const PROJECT_NAME_MAX = 120;
export const PROJECT_ROLE_MAX = 120;
export const PROJECT_ORG_MAX = 160;
export const PROJECT_SUMMARY_MAX = 2000;

/** The lifecycle states a project can be in. */
export const PROJECT_STATUSES = ["active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectInput = {
  name: string;
  role: string | null;
  organisation: string | null;
  summary: string | null;
  status: ProjectStatus;
  startedOn: string | null;
  endedOn: string | null;
};

export type ProjectValidationResult =
  { ok: true; value: ProjectInput } | { ok: false; error: string };

/** Trim a possibly-absent string; an empty result becomes null. */
function cleanOptional(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True for a real ISO calendar date, e.g. "2024-01-15" (rejects "2024-13-40"). */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/**
 * Validate a project's fields. Returns the cleaned value (trimmed, optionals
 * nulled, status defaulted to "active") or a single human-readable error.
 */
export function validateProjectInput(input: unknown): ProjectValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Enter a project name." };
  }
  const obj = input as Record<string, unknown>;

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (name.length === 0) {
    return { ok: false, error: "Enter a project name." };
  }
  if (name.length > PROJECT_NAME_MAX) {
    return {
      ok: false,
      error: `Project name is too long (max ${PROJECT_NAME_MAX} characters).`,
    };
  }

  const role = cleanOptional(obj.role);
  if (role !== null && role.length > PROJECT_ROLE_MAX) {
    return {
      ok: false,
      error: `Role is too long (max ${PROJECT_ROLE_MAX} characters).`,
    };
  }

  const organisation = cleanOptional(obj.organisation);
  if (organisation !== null && organisation.length > PROJECT_ORG_MAX) {
    return {
      ok: false,
      error: `Organisation is too long (max ${PROJECT_ORG_MAX} characters).`,
    };
  }

  const summary = cleanOptional(obj.summary);
  if (summary !== null && summary.length > PROJECT_SUMMARY_MAX) {
    return {
      ok: false,
      error: `Summary is too long (max ${PROJECT_SUMMARY_MAX} characters).`,
    };
  }

  // Status defaults to "active" when absent; any other value is rejected.
  let status: ProjectStatus = "active";
  if (obj.status !== undefined && obj.status !== null && obj.status !== "") {
    if (!(PROJECT_STATUSES as readonly unknown[]).includes(obj.status)) {
      return { ok: false, error: "Choose a valid project status." };
    }
    status = obj.status as ProjectStatus;
  }

  const startedOn = cleanOptional(obj.startedOn);
  if (startedOn !== null && !isIsoDate(startedOn)) {
    return { ok: false, error: "Enter a valid start date." };
  }

  const endedOn = cleanOptional(obj.endedOn);
  if (endedOn !== null && !isIsoDate(endedOn)) {
    return { ok: false, error: "Enter a valid end date." };
  }

  // ISO date strings compare correctly as plain strings.
  if (startedOn !== null && endedOn !== null && endedOn < startedOn) {
    return { ok: false, error: "End date can't be before the start date." };
  }

  return {
    ok: true,
    value: { name, role, organisation, summary, status, startedOn, endedOn },
  };
}
