/**
 * Save orchestration for a target role — the testable core behind the thin Server
 * Action. Depends on a repository *interface* (Dependency Inversion), so it is
 * tested with an injected fake and no network.
 *
 * Flow: validate (AC9) → insert/update the target role → for each requirement,
 * resolve its source (framework in-memory match → O*NET lookup → job_description)
 * → replace the role's requirements idempotently (AC4/AC5/AC6/AC7/AC8). Only ever
 * reached from the explicit confirm step (AC3).
 */
import {
  validateTargetRoleIntake,
  validateTargetRoleFromTitle,
} from "./validation";
import {
  mapTargetRoleRow,
  mapRequirementRow,
  type TargetRoleRow,
  type RoleRequirementRow,
  type SourceOccupation,
} from "./mappers";
import { matchFramework, type FrameworkItem } from "./matching";
import { resolveSource } from "./source";

export interface TargetRoleRepository {
  getFrameworkItems(): Promise<FrameworkItem[]>;
  searchOnet(requirement: string): Promise<{ id: string } | null>;
  insertTargetRole(row: TargetRoleRow): Promise<{ id: string }>;
  updateTargetRole(id: string, row: TargetRoleRow): Promise<void>;
  /** Replace all of a role's requirements (idempotent on edit). */
  replaceRequirements(
    targetRoleId: string,
    userId: string,
    rows: RoleRequirementRow[]
  ): Promise<void>;
}

export type SaveTargetRoleParams = {
  userId: string;
  input: unknown;
  /** When present, update that existing target role instead of inserting (edit). */
  recordId?: string | null;
  /**
   * Paste path (default) requires a job description; the title path passes false,
   * since its requirements come from the chosen occupation instead.
   */
  requireJobDescription?: boolean;
  /** Title path only: the O*NET occupation the requirements were derived from. */
  sourceOccupation?: SourceOccupation | null;
};

export type SaveResult =
  { ok: true; recordId: string } | { ok: false; error: string };

export async function saveTargetRole(
  repo: TargetRoleRepository,
  params: SaveTargetRoleParams
): Promise<SaveResult> {
  const validated =
    params.requireJobDescription === false
      ? validateTargetRoleFromTitle(params.input)
      : validateTargetRoleIntake(params.input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const roleRow = mapTargetRoleRow(
    validated.value,
    params.userId,
    params.sourceOccupation ?? null
  );

  let recordId: string;
  if (params.recordId) {
    await repo.updateTargetRole(params.recordId, roleRow);
    recordId = params.recordId;
  } else {
    const inserted = await repo.insertTargetRole(roleRow);
    recordId = inserted.id;
  }

  const frameworkItems = await repo.getFrameworkItems();
  const rows: RoleRequirementRow[] = [];
  for (const text of validated.value.requirements) {
    const frameworkMatch = matchFramework(text, frameworkItems);
    const onetMatch = frameworkMatch ? null : await repo.searchOnet(text);
    const resolved = resolveSource({ frameworkMatch, onetMatch });
    rows.push(
      mapRequirementRow({
        userId: params.userId,
        targetRoleId: recordId,
        text,
        resolved,
      })
    );
  }

  await repo.replaceRequirements(recordId, params.userId, rows);

  return { ok: true, recordId };
}
