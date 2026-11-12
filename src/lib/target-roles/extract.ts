/**
 * Heuristic, non-AI extraction of requirements from a pasted job description.
 *
 * This is the deterministic stand-in for the Week-4 AI extraction (AC2, deferred
 * per ADR-0005). It is pure and fully unit-tested (critical path): it detects
 * requirements-style sections, splits them into discrete items, drops boilerplate,
 * and (when there is no clear section) keeps only requirement-looking lines. The
 * user always reviews and edits the result, so nothing wrong is ever saved.
 */

// A line whose START names a requirements-style section (so a content line that
// merely contains a word like "skills" is not mistaken for a header). An optional
// leading modifier ("Required", "Key", …) and a short tail (e.g. ":") are allowed.
const HEADER_RE =
  /^(?:key|required|minimum|preferred|basic|desired|core|essential|the)?\s*(?:requirements|qualifications|responsibilities|duties|skills|what you.?ll do|what we.?re looking for|must[- ]?haves?|nice[- ]?to[- ]?haves?|about you|who you are)\b.{0,25}$/i;

// Lines that are never requirements (company blurb, legal, logistics).
const BOILERPLATE_RE =
  /\b(equal opportunity|eoe|benefits|salary|compensation|perks|apply now|how to apply|we offer|about (the company|us)|our mission|visa|relocation|disclaimer|privacy policy)\b/i;

// Signals that a free-standing line (no section header) is actually a requirement.
const SIGNAL_RE =
  /\b(experience|ability to|able to|proficien\w*|knowledge of|familiar|years?|degree|bachelor|master|skills?|understanding of|strong|demonstrated|expertise|background in|fluent|competen\w*|hands[- ]?on|track record|proven)\b/i;

// A leading list marker: bullet glyphs, "1." / "1)", or "a." / "a)".
const MARKER_RE = /^\s*(?:[-*•▪◦‣–]|\d+[.)]|[a-z][.)])\s+/i;

// A generic "Heading:" line (e.g. "Location:") that ends a requirements section.
const GENERIC_HEADER_RE = /^[A-Z][A-Za-z /&]{0,38}:$/;

function toLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function looksLikeHeader(line: string): boolean {
  return HEADER_RE.test(line);
}

// A non-requirements boundary that ends the current section.
function isNonRequirementBoundary(line: string): boolean {
  return BOILERPLATE_RE.test(line) || GENERIC_HEADER_RE.test(line);
}

/**
 * Collect the lines inside every requirements-style section (Requirements,
 * Qualifications, Responsibilities, …), skipping boilerplate/other sections.
 * Returns null when the text has no recognizable section header at all.
 */
function findSectionLines(lines: string[]): string[] | null {
  let inSection = false;
  let foundAny = false;
  const collected: string[] = [];

  for (const line of lines) {
    if (looksLikeHeader(line)) {
      inSection = true;
      foundAny = true;
      continue;
    }
    if (isNonRequirementBoundary(line)) {
      inSection = false;
      continue;
    }
    if (inSection) {
      collected.push(line);
    }
  }

  return foundAny ? collected : null;
}

function stripMarker(line: string): string {
  return line.replace(MARKER_RE, "").trim();
}

function splitItems(lines: string[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    // A single line may pack several requirements separated by semicolons.
    for (const part of line.split(";")) {
      const cleaned = stripMarker(part).replace(/\s+/g, " ").trim();
      if (cleaned.length > 0) {
        items.push(cleaned);
      }
    }
  }
  return items;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function extractRequirements(jobDescription: string): string[] {
  if (typeof jobDescription !== "string") {
    return [];
  }
  const lines = toLines(jobDescription);
  if (lines.length === 0) {
    return [];
  }

  const sectionLines = findSectionLines(lines);
  const hadSection = sectionLines !== null;
  const items = splitItems(sectionLines ?? lines);

  const kept = items.filter((item) => {
    if (BOILERPLATE_RE.test(item)) {
      return false;
    }
    // Inside a detected section, trust the items. Without a section, keep only
    // lines that carry a requirement signal (prose JDs are mostly narrative).
    return hadSection || SIGNAL_RE.test(item);
  });

  return dedupe(kept);
}
