import { describe, it, expect, vi } from "vitest";
import {
  indexUploadedFileEvidence,
  type UploadIndexDeps,
} from "./index-upload";

const params = {
  fileId: "file-1",
  storagePath: "user-1/abc-resume.pdf",
  fileName: "resume.pdf",
  mimeType: "application/pdf",
};

function deps(overrides: Partial<UploadIndexDeps> = {}): UploadIndexDeps {
  return {
    download: vi.fn(async () => new Uint8Array([1, 2, 3])),
    extract: vi.fn(async () => "extracted text"),
    index: vi.fn(async () => ({ indexed: 2 })),
    ...overrides,
  };
}

describe("indexUploadedFileEvidence", () => {
  it("downloads, extracts, then indexes under a file source", async () => {
    const d = deps();
    const result = await indexUploadedFileEvidence(params, d);

    expect(d.download).toHaveBeenCalledWith(params.storagePath);
    expect(d.extract).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      "application/pdf"
    );
    expect(d.index).toHaveBeenCalledWith("extracted text", {
      source_kind: "file",
      file_id: "file-1",
      title: "resume.pdf",
    });
    expect(result).toEqual({ indexed: 2 });
  });

  it("still calls the indexer with empty text (e.g. an image) so it can no-op", async () => {
    const index = vi.fn(async () => ({ indexed: 0 }));
    const d = deps({ extract: vi.fn(async () => ""), index });
    const result = await indexUploadedFileEvidence(
      { ...params, fileName: "photo.png", mimeType: "image/png" },
      d
    );
    expect(index).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ source_kind: "file" })
    );
    expect(result).toEqual({ indexed: 0 });
  });

  it("propagates a download failure to the caller (which runs it best-effort)", async () => {
    const d = deps({
      download: vi.fn(async () => {
        throw new Error("storage down");
      }),
    });
    await expect(indexUploadedFileEvidence(params, d)).rejects.toThrow(
      "storage down"
    );
    expect(d.index).not.toHaveBeenCalled();
  });
});
