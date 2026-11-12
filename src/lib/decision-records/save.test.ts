import { describe, it, expect, vi } from "vitest";
import { saveDecisionRecord, type DecisionRecordRepository } from "./save";
import type { DecisionRecordInput } from "./validation";

// Integration-level tests for the save orchestration. The Supabase data access
// is behind an interface (Dependency Inversion), so we inject a hand-written
// fake here — no network, no real project, no credentials (test Rule 1).
function makeFakeRepo(
  overrides: Partial<DecisionRecordRepository> = {}
): DecisionRecordRepository {
  return {
    insertRecord: vi.fn(async () => ({ id: "new-record-id" })),
    updateRecord: vi.fn(async () => {}),
    setEvidenceLink: vi.fn(async () => {}),
    ...overrides,
  };
}

const userId = "11111111-1111-1111-1111-111111111111";
const validInput: DecisionRecordInput = {
  title: "Rebuilt the nightly export",
  situation: "It kept timing out under load.",
  decision: "Switched to a streamed writer.",
  outcome: "40min -> 6min, no more failures.",
  source: "artifact",
};

describe("saveDecisionRecord", () => {
  it("inserts the record and links the supporting file (AC4)", async () => {
    const repo = makeFakeRepo();
    const result = await saveDecisionRecord(repo, {
      userId,
      input: validInput,
      fileId: "file-abc",
    });

    expect(result).toEqual({ ok: true, recordId: "new-record-id" });
    expect(repo.insertRecord).toHaveBeenCalledOnce();
    expect(repo.insertRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        title: validInput.title,
        source: "artifact",
        status: "confirmed",
      })
    );
    expect(repo.setEvidenceLink).toHaveBeenCalledWith({
      userId,
      decisionRecordId: "new-record-id",
      fileId: "file-abc",
    });
  });

  it("clears the file link when no file is chosen", async () => {
    const repo = makeFakeRepo();
    const result = await saveDecisionRecord(repo, {
      userId,
      input: validInput,
    });

    expect(result.ok).toBe(true);
    expect(repo.insertRecord).toHaveBeenCalledOnce();
    expect(repo.setEvidenceLink).toHaveBeenCalledWith({
      userId,
      decisionRecordId: "new-record-id",
      fileId: null,
    });
  });

  it("saves nothing and returns the error when a required field is missing (AC6)", async () => {
    const repo = makeFakeRepo();
    const result = await saveDecisionRecord(repo, {
      userId,
      input: { ...validInput, decision: "" },
      fileId: "file-abc",
    });

    expect(result).toEqual({
      ok: false,
      error: "Describe the decision you made.",
    });
    expect(repo.insertRecord).not.toHaveBeenCalled();
    expect(repo.updateRecord).not.toHaveBeenCalled();
    expect(repo.setEvidenceLink).not.toHaveBeenCalled();
  });

  it("updates an existing record and re-syncs its link (idempotent edit)", async () => {
    const repo = makeFakeRepo();
    const result = await saveDecisionRecord(repo, {
      userId,
      input: validInput,
      recordId: "existing-id",
      fileId: "file-xyz",
    });

    expect(result).toEqual({ ok: true, recordId: "existing-id" });
    expect(repo.updateRecord).toHaveBeenCalledWith(
      "existing-id",
      expect.objectContaining({ user_id: userId, title: validInput.title })
    );
    expect(repo.insertRecord).not.toHaveBeenCalled();
    expect(repo.setEvidenceLink).toHaveBeenCalledWith({
      userId,
      decisionRecordId: "existing-id",
      fileId: "file-xyz",
    });
  });
});
