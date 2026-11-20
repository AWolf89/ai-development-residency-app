import { describe, it, expect, vi } from "vitest";
import { extractText, type Parsers } from "./extract";

const enc = (s: string) => new TextEncoder().encode(s);

function fakeParsers(overrides: Partial<Parsers> = {}): Parsers {
  return {
    pdf: vi.fn(async () => "PDF TEXT"),
    docx: vi.fn(async () => "DOCX TEXT"),
    ...overrides,
  };
}

describe("extractText", () => {
  it("decodes plain text as UTF-8 without touching the parsers", async () => {
    const parsers = fakeParsers();
    const out = await extractText(enc("hello world"), "text/plain", parsers);
    expect(out).toBe("hello world");
    expect(parsers.pdf).not.toHaveBeenCalled();
    expect(parsers.docx).not.toHaveBeenCalled();
  });

  it("decodes markdown and trims surrounding whitespace", async () => {
    const out = await extractText(
      enc("\n# Title\n\nbody\n"),
      "text/markdown",
      fakeParsers()
    );
    expect(out).toBe("# Title\n\nbody");
  });

  it("decodes CSV as UTF-8 text without touching the parsers", async () => {
    const parsers = fakeParsers();
    const out = await extractText(
      enc("name,role\nAda,Engineer\n"),
      "text/csv",
      parsers
    );
    expect(out).toBe("name,role\nAda,Engineer");
    expect(parsers.pdf).not.toHaveBeenCalled();
    expect(parsers.docx).not.toHaveBeenCalled();
  });

  it("returns empty string for PowerPoint (no parser yet) without calling parsers", async () => {
    const parsers = fakeParsers();
    expect(
      await extractText(
        enc("PK"),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        parsers
      )
    ).toBe("");
    expect(
      await extractText(enc("x"), "application/vnd.ms-powerpoint", parsers)
    ).toBe("");
    expect(parsers.pdf).not.toHaveBeenCalled();
    expect(parsers.docx).not.toHaveBeenCalled();
  });

  it("routes PDFs to the pdf parser", async () => {
    const parsers = fakeParsers({ pdf: vi.fn(async () => "  resume text  ") });
    const out = await extractText(enc("%PDF"), "application/pdf", parsers);
    expect(out).toBe("resume text");
    expect(parsers.pdf).toHaveBeenCalledOnce();
  });

  it("routes DOCX to the docx parser", async () => {
    const parsers = fakeParsers({ docx: vi.fn(async () => "doc body") });
    const out = await extractText(
      enc("PK"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      parsers
    );
    expect(out).toBe("doc body");
    expect(parsers.docx).toHaveBeenCalledOnce();
  });

  it("returns empty string for images when no vision describer is injected", async () => {
    const parsers = fakeParsers();
    expect(await extractText(enc("x"), "image/png", parsers)).toBe("");
    expect(await extractText(enc("x"), "image/jpeg", parsers)).toBe("");
    expect(parsers.pdf).not.toHaveBeenCalled();
    expect(parsers.docx).not.toHaveBeenCalled();
  });

  it("routes images to the injected vision describer, with the mime type, trimmed", async () => {
    const image = vi.fn(async () => "  a customer journey map  ");
    const parsers = fakeParsers({ image });
    expect(await extractText(enc("PNG"), "image/png", parsers)).toBe(
      "a customer journey map"
    );
    expect(await extractText(enc("JPG"), "image/jpeg", parsers)).toBe(
      "a customer journey map"
    );
    expect(image).toHaveBeenCalledWith(expect.any(Uint8Array), "image/png");
    expect(image).toHaveBeenCalledWith(expect.any(Uint8Array), "image/jpeg");
    expect(parsers.pdf).not.toHaveBeenCalled();
  });

  it("returns empty string for an unknown type", async () => {
    expect(await extractText(enc("x"), "application/zip", fakeParsers())).toBe(
      ""
    );
  });
});
