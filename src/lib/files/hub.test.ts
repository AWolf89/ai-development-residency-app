import { describe, it, expect, vi } from "vitest";
import {
  setFileCaption,
  setFileProject,
  attachRecordToFile,
  detachRecordFromFile,
  type FileHubRepository,
} from "./hub";
import { FILE_CAPTION_MAX } from "./validation";

function makeFakeRepo(
  overrides: Partial<FileHubRepository> = {}
): FileHubRepository {
  return {
    setCaption: vi.fn(async () => {}),
    setProject: vi.fn(async () => {}),
    insertRecordLink: vi.fn(async () => {}),
    deleteRecordLink: vi.fn(async () => {}),
    ...overrides,
  };
}

const userId = "11111111-1111-1111-1111-111111111111";

describe("setFileCaption", () => {
  it("writes a trimmed caption within the cap", async () => {
    const repo = makeFakeRepo();
    const result = await setFileCaption(repo, {
      fileId: "file-1",
      caption: "  Launch deck  ",
    });

    expect(result).toEqual({ ok: true });
    expect(repo.setCaption).toHaveBeenCalledWith("file-1", "Launch deck");
  });

  it("clears the caption (null) when blank", async () => {
    const repo = makeFakeRepo();
    await setFileCaption(repo, { fileId: "file-1", caption: "   " });
    expect(repo.setCaption).toHaveBeenCalledWith("file-1", null);
  });

  it("writes nothing and returns the error when the caption is too long", async () => {
    const repo = makeFakeRepo();
    const result = await setFileCaption(repo, {
      fileId: "file-1",
      caption: "a".repeat(FILE_CAPTION_MAX + 1),
    });

    expect(result.ok).toBe(false);
    expect(repo.setCaption).not.toHaveBeenCalled();
  });
});

describe("setFileProject", () => {
  it("assigns the file to a project", async () => {
    const repo = makeFakeRepo();
    const result = await setFileProject(repo, {
      fileId: "file-1",
      projectId: "project-9",
    });

    expect(result).toEqual({ ok: true });
    expect(repo.setProject).toHaveBeenCalledWith("file-1", "project-9");
  });

  it("clears the project when projectId is null", async () => {
    const repo = makeFakeRepo();
    await setFileProject(repo, { fileId: "file-1", projectId: null });
    expect(repo.setProject).toHaveBeenCalledWith("file-1", null);
  });
});

describe("attachRecordToFile / detachRecordFromFile", () => {
  it("inserts an evidence link scoped to the caller", async () => {
    const repo = makeFakeRepo();
    const result = await attachRecordToFile(repo, {
      userId,
      fileId: "file-1",
      decisionRecordId: "record-1",
    });

    expect(result).toEqual({ ok: true });
    expect(repo.insertRecordLink).toHaveBeenCalledWith({
      userId,
      fileId: "file-1",
      decisionRecordId: "record-1",
    });
  });

  it("deletes an evidence link by id", async () => {
    const repo = makeFakeRepo();
    const result = await detachRecordFromFile(repo, { linkId: "link-1" });

    expect(result).toEqual({ ok: true });
    expect(repo.deleteRecordLink).toHaveBeenCalledWith("link-1");
  });
});
