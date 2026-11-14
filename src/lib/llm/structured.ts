// Pure, deterministic structured-output helpers (R3 §2: strict schema validation and the
// multi-stage recovery pipeline). No network, no `server-only` import — so these are unit
// tested with canned good/bad payloads and carry all the logic the thin gateway boundary
// delegates to (Humble Object). The actual model call and the correction loop that drives
// these live in run.ts.
import type { ZodType } from "zod";

/** Raised when a model reply never matches the schema within the correction budget. */
export class StructuredOutputError extends Error {
  readonly attempts: number;
  constructor(message: string, attempts: number) {
    super(message);
    this.name = "StructuredOutputError";
    this.attempts = attempts;
  }
}

export type ParseResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

/**
 * Deterministically strip markdown code-fence noise a model often wraps JSON in
 * (```json … ```, ``` … ```, or stray leading/trailing prose/backticks) so near-valid
 * replies can be recovered at zero model cost before validation.
 */
export function stripCodeFences(raw: string): string {
  let text = raw.trim();

  // A fenced block anywhere in the reply: ```lang\n … \n``` — take the block's contents.
  const fenced = text.match(
    /```[^\S\r\n]*[a-zA-Z0-9_-]*[^\S\r\n]*\r?\n([\s\S]*?)```/
  );
  if (fenced) {
    return fenced[1].trim();
  }

  // No full fence: drop a leading ```lang line and any trailing ``` if present.
  text = text.replace(/^```[a-zA-Z0-9_-]*[^\S\r\n]*\r?\n?/, "");
  text = text.replace(/\r?\n?```[^\S\r\n]*$/, "");
  return text.trim();
}

/** Human-readable summary of a Zod failure, suitable for feeding back to the model. */
function formatIssues(error: {
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .map((i) => {
      const path = i.path.length ? i.path.map(String).join(".") : "(root)";
      return `${path}: ${i.message}`;
    })
    .join("; ");
}

/**
 * Defensive parse → validate. Strips code fences, parses JSON, then `safeParse`s against
 * the schema. Never throws; returns a typed success or a readable error string.
 */
export function parseStructured<T>(
  raw: string,
  schema: ZodType<T>
): ParseResult<T> {
  const cleaned = stripCodeFences(raw);
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      error: `Output is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const result = schema.safeParse(json);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: formatIssues(result.error) };
}

/**
 * Build the user-turn text for one self-correction attempt: hand the model its own invalid
 * output and the exact validation error, and ask only for corrected JSON (R3 "Re-ask").
 * When the previous reply was cut off (truncation), say so explicitly.
 */
export function buildCorrectionTurn(
  previousRaw: string,
  error: string,
  wasTruncated = false
): string {
  const lines = [
    "Your previous reply did not pass validation and could not be used.",
    `Validation error: ${error}`,
  ];
  if (wasTruncated) {
    lines.push(
      "Your previous reply was cut off before it finished. Return a shorter, complete response."
    );
  }
  lines.push(
    "Here is your previous reply:",
    previousRaw,
    "Return ONLY corrected JSON that satisfies the schema. No explanation, no markdown fences."
  );
  return lines.join("\n");
}

/** A reply was cut off by the output-token cap when the provider stops for "length". */
export function isTruncated(finishReason: string | undefined): boolean {
  return finishReason === "length";
}
