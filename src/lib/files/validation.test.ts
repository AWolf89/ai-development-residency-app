import { describe, it, expect } from "vitest";
import {
  validateFileUpload,
  sanitizeFileName,
  buildStoragePath,
  inferMimeType,
  MAX_FILE_BYTES,
  MAX_FILE_NAME_LENGTH,
} from "./validation";

// Pure-logic unit tests (Humble Object): no network, canned inputs, every branch.
// This is the single gate deciding whether an upload may proceed (UF 1 AC1–AC3).

describe("validateFileUpload", () => {
  const valid = {
    fileName: "resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
  };

  it("accepts an allowed type within the size cap and returns the trimmed value", () => {
    const result = validateFileUpload({ ...valid, fileName: "  resume.pdf  " });
    expect(result).toEqual({ ok: true, value: valid });
  });

  it("accepts a file exactly at the size cap", () => {
    const result = validateFileUpload({ ...valid, sizeBytes: MAX_FILE_BYTES });
    expect(result.ok).toBe(true);
  });

  it.each([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ])("accepts allowed mime type %s", (mimeType) => {
    const result = validateFileUpload({ ...valid, mimeType });
    expect(result.ok).toBe(true);
  });

  it("rejects a disallowed mime type (AC1)", () => {
    const result = validateFileUpload({
      ...valid,
      mimeType: "application/x-msdownload",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty file (AC2)", () => {
    const result = validateFileUpload({ ...valid, sizeBytes: 0 });
    expect(result).toEqual({ ok: false, error: "That file looks empty." });
  });

  it("rejects a file over the size cap (AC2)", () => {
    const result = validateFileUpload({
      ...valid,
      sizeBytes: MAX_FILE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-integer size", () => {
    const result = validateFileUpload({ ...valid, sizeBytes: 12.5 });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing file name", () => {
    const result = validateFileUpload({ ...valid, fileName: "   " });
    expect(result).toEqual({ ok: false, error: "Choose a file to upload." });
  });

  it("rejects an over-long file name", () => {
    const fileName = `${"a".repeat(MAX_FILE_NAME_LENGTH + 1)}.pdf`;
    const result = validateFileUpload({ ...valid, fileName });
    expect(result.ok).toBe(false);
  });

  it.each([null, undefined, "nope", 42])(
    "rejects a non-object input (%s)",
    (input) => {
      const result = validateFileUpload(input);
      expect(result).toEqual({ ok: false, error: "Choose a file to upload." });
    }
  );
});

describe("sanitizeFileName", () => {
  it("keeps a clean name unchanged", () => {
    expect(sanitizeFileName("report-2026_final.pdf")).toBe(
      "report-2026_final.pdf"
    );
  });

  it("strips a POSIX directory part", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
  });

  it("strips a Windows directory part", () => {
    expect(sanitizeFileName("C:\\Users\\me\\evil.pdf")).toBe("evil.pdf");
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeFileName("in voice*?:.pdf")).toBe("in voice___.pdf");
  });

  it("removes control characters", () => {
    expect(sanitizeFileName("a\u0000b\u001f.txt")).toBe("ab.txt");
  });

  it("falls back to 'file' when nothing safe remains", () => {
    expect(sanitizeFileName("///")).toBe("file");
  });
});

describe("inferMimeType", () => {
  it("uses the browser-reported type when present", () => {
    expect(inferMimeType("notes.md", "text/markdown")).toBe("text/markdown");
  });

  it("falls back to the extension when the reported type is empty", () => {
    expect(inferMimeType("notes.md", "")).toBe("text/markdown");
    expect(inferMimeType("photo.JPG", "")).toBe("image/jpeg");
  });

  it("returns an empty string for an unknown extension and no reported type", () => {
    expect(inferMimeType("archive.zip", "")).toBe("");
  });
});

describe("buildStoragePath", () => {
  it("always starts with the user id so storage RLS passes (AC3)", () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const path = buildStoragePath(userId, "my file.pdf", "abc-123");
    expect(path).toBe(`${userId}/abc-123-my file.pdf`);
    expect(path.split("/")[0]).toBe(userId);
  });

  it("uses the sanitized name in the key", () => {
    const path = buildStoragePath("user", "../secret.pdf", "u1");
    expect(path).toBe("user/u1-secret.pdf");
  });
});
