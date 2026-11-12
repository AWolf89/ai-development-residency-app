import { describe, it, expect, vi } from "vitest";
import { saveTargetRole, type TargetRoleRepository } from "./save";

function makeFakeRepo(
  overrides: Partial<TargetRoleRepository> = {}
): TargetRoleRepository {
  return {
    getFrameworkItems: vi.fn(async () => [{ id: "sql", name: "SQL" }]),
    searchOnet: vi.fn(async () => null),
    insertTargetRole: vi.fn(async () => ({ id: "new-role-id" })),
    updateTargetRole: vi.fn(async () => {}),
    replaceRequirements: vi.fn(async () => {}),
    ...overrides,
  };
}

const userId = "11111111-1111-1111-1111-111111111111";
const validInput = {
  title: "Data Engineer",
  jobDescription:
    "A fairly long job description that passes the validation length.",
  requirements: ["SQL experience", "Teamwork and leadership", "Agile delivery"],
};

describe("saveTargetRole", () => {
  it("inserts the role and resolves each requirement's source (AC4–AC8)", async () => {
    const repo = makeFakeRepo({
      // O*NET matches the teamwork requirement, nothing else.
      searchOnet: vi.fn(async (req: string) =>
        req.includes("Teamwork") ? { id: "onet-1" } : null
      ),
    });

    const result = await saveTargetRole(repo, { userId, input: validInput });

    expect(result).toEqual({ ok: true, recordId: "new-role-id" });
    expect(repo.insertTargetRole).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        title: "Data Engineer",
        company: null,
      })
    );
    // SQL matched the framework, so O*NET is only consulted for the other two.
    expect(repo.searchOnet).toHaveBeenCalledTimes(2);
    expect(repo.replaceRequirements).toHaveBeenCalledWith(
      "new-role-id",
      userId,
      [
        expect.objectContaining({
          requirement_text: "SQL experience",
          source: "framework",
          reference_item_id: "sql",
        }),
        expect.objectContaining({
          requirement_text: "Teamwork and leadership",
          source: "onet",
          reference_item_id: "onet-1",
        }),
        expect.objectContaining({
          requirement_text: "Agile delivery",
          source: "job_description",
          reference_item_id: null,
        }),
      ]
    );
  });

  it("saves nothing and returns the error when the intake is invalid (AC9)", async () => {
    const repo = makeFakeRepo();
    const result = await saveTargetRole(repo, {
      userId,
      input: { ...validInput, title: "" },
    });

    expect(result.ok).toBe(false);
    expect(repo.insertTargetRole).not.toHaveBeenCalled();
    expect(repo.updateTargetRole).not.toHaveBeenCalled();
    expect(repo.replaceRequirements).not.toHaveBeenCalled();
  });

  it("updates an existing role and replaces its requirements (idempotent edit)", async () => {
    const repo = makeFakeRepo();
    const result = await saveTargetRole(repo, {
      userId,
      input: validInput,
      recordId: "existing-role",
    });

    expect(result).toEqual({ ok: true, recordId: "existing-role" });
    expect(repo.updateTargetRole).toHaveBeenCalledWith(
      "existing-role",
      expect.objectContaining({ title: "Data Engineer" })
    );
    expect(repo.insertTargetRole).not.toHaveBeenCalled();
    expect(repo.replaceRequirements).toHaveBeenCalledWith(
      "existing-role",
      userId,
      expect.any(Array)
    );
  });
});
