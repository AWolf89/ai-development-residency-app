import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  stripCodeFences,
  parseStructured,
  buildCorrectionTurn,
  isTruncated,
  StructuredOutputError,
} from "./structured";

describe("stripCodeFences", () => {
  it("returns plain JSON unchanged (trimmed)", () => {
    expect(stripCodeFences('  {"a":1}  ')).toBe('{"a":1}');
  });

  it("unwraps a ```json fenced block", () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("unwraps a bare ``` fenced block", () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts the fenced block when prose surrounds it", () => {
    expect(
      stripCodeFences(
        'Sure, here it is:\n```json\n{"a":1}\n```\nHope that helps!'
      )
    ).toBe('{"a":1}');
  });

  it("strips an opening fence with no closing fence (truncated reply)", () => {
    expect(stripCodeFences('```json\n{"a":1}')).toBe('{"a":1}');
  });

  it("leaves inner braces/backtick-free content intact", () => {
    expect(stripCodeFences('{"note":"use ``code`` sparingly"}')).toBe(
      '{"note":"use ``code`` sparingly"}'
    );
  });
});

describe("parseStructured", () => {
  const schema = z.object({
    claims: z.array(z.object({ statement: z.string() })),
  });

  it("parses and validates a good payload", () => {
    const r = parseStructured(
      '{"claims":[{"statement":"Led the migration"}]}',
      schema
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.claims[0].statement).toBe("Led the migration");
  });

  it("recovers a fenced good payload", () => {
    const r = parseStructured('```json\n{"claims":[]}\n```', schema);
    expect(r.ok).toBe(true);
  });

  it("fails readably on non-JSON", () => {
    const r = parseStructured("I'm not going to answer that.", schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/i);
  });

  it("fails with the field path when the shape is wrong", () => {
    const r = parseStructured('{"claims":"nope"}', schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/claims/);
  });

  it("reports (root) when the top-level type is wrong", () => {
    const r = parseStructured("[]", schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });
});

describe("buildCorrectionTurn", () => {
  it("includes the validation error and the previous output, and asks for JSON only", () => {
    const turn = buildCorrectionTurn(
      '{"claims":"nope"}',
      "claims: expected array",
      false
    );
    expect(turn).toContain("claims: expected array");
    expect(turn).toContain('{"claims":"nope"}');
    expect(turn).toMatch(/ONLY corrected JSON/);
    expect(turn).not.toMatch(/cut off/);
  });

  it("notes truncation when the previous reply was cut off", () => {
    const turn = buildCorrectionTurn("{partial", "unexpected end", true);
    expect(turn).toMatch(/cut off/);
  });
});

describe("isTruncated", () => {
  it("is true only for a length finish reason", () => {
    expect(isTruncated("length")).toBe(true);
    expect(isTruncated("stop")).toBe(false);
    expect(isTruncated(undefined)).toBe(false);
  });
});

describe("StructuredOutputError", () => {
  it("carries the attempt count and a name for typed handling", () => {
    const e = new StructuredOutputError("gave up", 3);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("StructuredOutputError");
    expect(e.attempts).toBe(3);
  });
});
