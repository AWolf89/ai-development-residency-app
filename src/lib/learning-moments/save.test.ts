import { describe, it, expect, vi } from "vitest";
import { saveLearningMoment, type LearningMomentRepository } from "./save";

// The Supabase data access is behind an interface (Dependency Inversion), so we inject a
// hand-written fake here — no network, no real project, no credentials.
function makeFakeRepo(
  overrides: Partial<LearningMomentRepository> = {}
): LearningMomentRepository {
  return {
    insertRecord: vi.fn(async () => ({ id: "new-moment-id" })),
    updateRecord: vi.fn(async () => {}),
    setEvidenceLink: vi.fn(async () => {}),
    ...overrides,
  };
}

const userId = "11111111-1111-1111-1111-111111111111";
const validInput = {
  kind: "speed",
  context: "Joined a team using a stack I'd never touched.",
  shift: "Learned their CI + deploy pipeline.",
  result: "Shipped independently by the end of week two.",
  duration: "2 weeks",
};

describe("saveLearningMoment", () => {
  it("inserts the moment and links the supporting file (AC3)", async () => {
    const repo = makeFakeRepo();
    const result = await saveLearningMoment(repo, {
      userId,
      input: validInput,
      fileId: "file-abc",
    });

    expect(result).toEqual({ ok: true, recordId: "new-moment-id" });
    expect(repo.insertRecord).toHaveBeenCalledOnce();
    expect(repo.insertRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        kind: "speed",
        duration: "2 weeks",
      })
    );
    expect(repo.setEvidenceLink).toHaveBeenCalledWith({
      userId,
      learningMomentId: "new-moment-id",
      fileId: "file-abc",
    });
  });

  it("clears the file link when no file is chosen", async () => {
    const repo = makeFakeRepo();
    const result = await saveLearningMoment(repo, {
      userId,
      input: validInput,
    });

    expect(result.ok).toBe(true);
    expect(repo.setEvidenceLink).toHaveBeenCalledWith({
      userId,
      learningMomentId: "new-moment-id",
      fileId: null,
    });
  });

  it("updates an existing moment instead of inserting when a recordId is given", async () => {
    const repo = makeFakeRepo();
    const result = await saveLearningMoment(repo, {
      userId,
      input: validInput,
      recordId: "existing-id",
    });

    expect(result).toEqual({ ok: true, recordId: "existing-id" });
    expect(repo.updateRecord).toHaveBeenCalledWith(
      "existing-id",
      expect.objectContaining({ user_id: userId })
    );
    expect(repo.insertRecord).not.toHaveBeenCalled();
  });

  // AC4: invalid input saves nothing — no insert, no update, no link.
  it("writes nothing when validation fails (AC4)", async () => {
    const repo = makeFakeRepo();
    const result = await saveLearningMoment(repo, {
      userId,
      input: { kind: "speed", context: "", shift: "", result: "" },
    });

    expect(result.ok).toBe(false);
    expect(repo.insertRecord).not.toHaveBeenCalled();
    expect(repo.updateRecord).not.toHaveBeenCalled();
    expect(repo.setEvidenceLink).not.toHaveBeenCalled();
  });

  // AC5: the saved row and its link are always scoped to the server-resolved user, never a
  // client-supplied id. (DB-level enforcement is the migration's own-rows RLS policies.)
  it("always stamps the caller's user id, ignoring any user_id in the input (AC5)", async () => {
    const repo = makeFakeRepo();
    await saveLearningMoment(repo, {
      userId,
      input: {
        ...validInput,
        user_id: "99999999-9999-9999-9999-999999999999",
        userId: "99999999-9999-9999-9999-999999999999",
      },
      fileId: "file-xyz",
    });

    expect(repo.insertRecord).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: userId })
    );
    expect(repo.setEvidenceLink).toHaveBeenCalledWith(
      expect.objectContaining({ userId })
    );
  });
});
