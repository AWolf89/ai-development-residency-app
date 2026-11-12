import { describe, it, expect } from "vitest";
import { formatBytes, mapFileRowToView, type FileRow } from "./mappers";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1.0 MB"],
    [5 * 1024 * 1024 + 512 * 1024, "5.5 MB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("renders unknown sizes as a dash", () => {
    expect(formatBytes(null)).toBe("—");
  });

  it("renders a negative size as a dash", () => {
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("mapFileRowToView", () => {
  const row: FileRow = {
    id: "file-1",
    file_name: "resume.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    created_at: "2026-11-12T10:00:00.000Z",
    storage_path: "user-1/uuid-resume.pdf",
  };

  it("maps a row to the view model with a formatted size", () => {
    expect(mapFileRowToView(row)).toEqual({
      id: "file-1",
      name: "resume.pdf",
      sizeLabel: "2.0 KB",
      createdAt: "2026-11-12T10:00:00.000Z",
      storagePath: "user-1/uuid-resume.pdf",
    });
  });

  it("passes a null size through as a dash", () => {
    expect(mapFileRowToView({ ...row, size_bytes: null }).sizeLabel).toBe("—");
  });
});
