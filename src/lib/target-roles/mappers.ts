/**
 * Pure mapping from a validated intake to the database row shapes.
 *
 * Humble Object: no network, unit-testable. `target_roles` and `role_requirements`
 * already exist; here we only build the rows (company is not collected in this
 * slice, so it is null).
 */
import type { TargetRoleIntakeInput } from "./validation";
import type { ResolvedSource } from "./source";

export type TargetRoleRow = {
  user_id: string;
  title: string;
  company: string | null;
  job_description: string;
};

export type RoleRequirementRow = {
  user_id: string;
  target_role_id: string;
  requirement_text: string;
  source: ResolvedSource["source"];
  reference_item_id: string | null;
};

export function mapTargetRoleRow(
  intake: TargetRoleIntakeInput,
  userId: string
): TargetRoleRow {
  return {
    user_id: userId,
    title: intake.title,
    company: null,
    job_description: intake.jobDescription,
  };
}

export function mapRequirementRow(params: {
  userId: string;
  targetRoleId: string;
  text: string;
  resolved: ResolvedSource;
}): RoleRequirementRow {
  return {
    user_id: params.userId,
    target_role_id: params.targetRoleId,
    requirement_text: params.text,
    source: params.resolved.source,
    reference_item_id: params.resolved.referenceItemId,
  };
}
