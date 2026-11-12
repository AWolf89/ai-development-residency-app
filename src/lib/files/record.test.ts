import { describe, it, expect, vi } from "vitest";
import { recordUploadedFile, type FileRepository } from "./record";

const USER = "11111111-1111-1111-1111-111111111111";

function makeRepo(overrides: Partial<FileRepository> = {}): FileRepository {
  return {
    insertFile: vi.fn(async () => ({ id: "file-1" })),
    removeObject: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
    ...overrides,
  };
}

const validParams = {
  userId: USER,
  storagePath: `${USER}/uuid-resume.pdf`,
  fileName: "resume.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
};

describe("recordUploadedFile", () => {
  it("inserts the metadata row and returns its id on success (AC1)", async () => {
    const repo = makeRepo();
    const result = await recordUploadedFile(repo, validParams);

    expect(result).toEqual({ ok: true, id: "file-1" });
    expect(repo.insertFile).toHaveBeenCalledWith({
      user_id: USER,
      storage_path: `${USER}/uuid-resume.pdf`,
      file_name: "resume.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
    });
    expect(repo.removeObject).not.toHaveBeenCalled();
  });

  it("rejects a disallowed type and cleans up the uploaded object (AC4)", async () => {
    const repo = makeRepo();
    const result = await recordUploadedFile(repo, {
      ...validParams,
      mimeType: "application/x-msdownload",
    });

    expect(result.ok).toBe(false);
    expect(repo.insertFile).not.toHaveBeenCalled();
    expect(repo.removeObject).toHaveBeenCalledWith(validParams.storagePath);
  });

  it("rejects a storage key outside the user's folder (AC5)", async () => {
    const repo = makeRepo();
    const result = await recordUploadedFile(repo, {
      ...validParams,
      storagePath: "someone-else/uuid-resume.pdf",
    });

    expect(result.ok).toBe(false);
    expect(repo.insertFile).not.toHaveBeenCalled();
    expect(repo.removeObject).toHaveBeenCalledWith(
      "someone-else/uuid-resume.pdf"
    );
  });

  it("cleans up the orphaned object when the metadata insert fails", async () => {
    const repo = makeRepo({
      insertFile: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const result = await recordUploadedFile(repo, validParams);

    expect(result.ok).toBe(false);
    expect(repo.removeObject).toHaveBeenCalledWith(validParams.storagePath);
  });

  it("still returns an error (not a throw) when cleanup also fails", async () => {
    const repo = makeRepo({
      insertFile: vi.fn(async () => {
        throw new Error("db down");
      }),
      removeObject: vi.fn(async () => {
        throw new Error("storage down");
      }),
    });
    const result = await recordUploadedFile(repo, validParams);

    expect(result).toEqual({
      ok: false,
      error: "Could not save your file. Please try again.",
    });
  });
});
