/**
 * Text extraction for uploaded evidence files (the input to evidence indexing).
 *
 * Humble Object: a thin dispatcher by MIME type. The heavy parsers (PDF, DOCX) are
 * dynamically imported so they only load when actually needed and never reach the
 * client bundle, and are injectable so the dispatch logic is unit-tested without them.
 * This module touches no network, DB, or secrets — only in-memory bytes — so it is a
 * plain unit (not `server-only`); it is only ever imported from server code.
 */
import type { AllowedMimeType } from "./validation";

/** Pluggable binary parsers, injected in tests so the dispatch needs no real files. */
export type Parsers = {
  pdf: (bytes: Uint8Array) => Promise<string>;
  docx: (bytes: Uint8Array) => Promise<string>;
};

const defaultParsers: Parsers = {
  pdf: async (bytes) => {
    const { getDocumentProxy, extractText: extractPdfText } =
      await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  },
  docx: async (bytes) => {
    const mod = await import("mammoth");
    const extractRawText = mod.extractRawText ?? mod.default?.extractRawText;
    const { value } = await extractRawText({ buffer: Buffer.from(bytes) });
    return value;
  },
};

/**
 * Extract plain text from a file's bytes for the given MIME type. Text files are
 * decoded directly; PDFs and DOCX go through their parsers. Images (and any type we
 * can't read as text without OCR) return "" — the file is still stored, it just has
 * no searchable text in this version. Callers treat "" as "nothing to index".
 */
export async function extractText(
  bytes: Uint8Array,
  mimeType: AllowedMimeType | string,
  parsers: Parsers = defaultParsers
): Promise<string> {
  switch (mimeType) {
    case "text/plain":
    case "text/markdown":
      return new TextDecoder("utf-8").decode(bytes).trim();
    case "application/pdf":
      return (await parsers.pdf(bytes)).trim();
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return (await parsers.docx(bytes)).trim();
    default:
      // images (png/jpeg) and anything else: no text without OCR (deferred).
      return "";
  }
}
