// Code checks for the agent reasoning suite (free, deterministic — they run before any judge call).
// Each returns { pass, score, reason } for promptfoo. The runner's structured result arrives as the
// JSON string `output`; per-case expectations (allowed citations/tags, the no-evidence requirement,
// forbidden phrases, defer wording) arrive in `context.vars`, attached by build_agent_tests.py.
// These assert the closed-RAG honesty guarantees the real grounding already enforces — grounding
// drift would surface here — and leave the nuanced reasoning verdict to the cross-family judge.

function parse(output) {
  try {
    return { ok: true, value: JSON.parse(output) };
  } catch {
    return { ok: false, value: null };
  }
}

const list = (v) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const citationKeys = (citations) =>
  (citations ?? []).map((c) => `${c.source}:${c.id}`);

// --- Reviewer (Tests 1, 3, 4, 8) ---

/** A grounded support/accuracy flag is raised — the review challenges the overclaim, not endorses it. */
export function reviewerRaisesFlag(output) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const flags = p.value.flags ?? [];
  const grounded = flags.filter(
    (f) => f.dimension === "support" || f.dimension === "accuracy"
  );
  const pass = grounded.length > 0;
  const dims = [...new Set(flags.map((f) => f.dimension))].join(", ") || "none";
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `raised ${grounded.length} support/accuracy flag(s) (dimensions: ${dims})`
      : `no support/accuracy flag on the overclaim (dimensions flagged: ${dims})`,
  };
}

/** Every flag citation points at a really-provided source (grounding guarantee; drift fails here). */
export function reviewerNoInventedCitation(output, context) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const allowed = new Set(list(context.vars.allowed_citations));
  const cited = (p.value.flags ?? []).flatMap((f) => citationKeys(f.citations));
  const invented = cited.filter((k) => !allowed.has(k));
  return {
    pass: invented.length === 0,
    score: invented.length === 0 ? 1 : 0,
    reason: invented.length
      ? `flag cites sources that were not provided: ${invented.join(", ")}`
      : "every flag citation was a provided source",
  };
}

// --- File analysis (Tests 2, 5, 9) ---

/** Every proposed tag points at a real candidate id — the model never invents a competency. */
export function fileNoInventedTag(output, context) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const allowed = new Set(list(context.vars.allowed_tag_ids));
  const tagged = (p.value.tags ?? []).map((t) => t.referenceItemId);
  const invented = tagged.filter((id) => !allowed.has(id));
  return {
    pass: invented.length === 0,
    score: invented.length === 0 ? 1 : 0,
    reason: invented.length
      ? `tags reference non-candidate ids: ${invented.join(", ")}`
      : "every tag is a real candidate",
  };
}

/** The summary/tags do not assert a forbidden framing (e.g. labelling informal chats a research study). */
export function fileNoForbiddenPhrase(output, context) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const pattern = String(context.vars.forbidden_phrases ?? "");
  if (!pattern) return { pass: true, score: 1, reason: "no forbidden phrases configured" };
  const re = new RegExp(pattern, "i");
  const text = [
    p.value.summary ?? "",
    ...(p.value.tags ?? []).map((t) => `${t.name} ${t.rationale}`),
  ].join(" \n ");
  const hit = text.match(re);
  return {
    pass: !hit,
    score: hit ? 0 : 1,
    reason: hit ? `asserts a forbidden framing: "${hit[0]}"` : "no forbidden framing",
  };
}

/** The model defers rather than over-reads: it asks a question or marks the deferring wording. */
export function fileAsksOrDefers(output, context) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const questions = p.value.questions ?? [];
  if (questions.length > 0) {
    return { pass: true, score: 1, reason: `asked ${questions.length} clarifying question(s)` };
  }
  const pattern = String(context.vars.defer_regex ?? "");
  if (!pattern) {
    return { pass: false, score: 0, reason: "asked nothing and no defer wording configured" };
  }
  const re = new RegExp(pattern, "i");
  const text = `${p.value.summary ?? ""} ${questions.join(" ")}`;
  const hit = re.test(text);
  return {
    pass: hit,
    score: hit ? 1 : 0,
    reason: hit ? "summary defers appropriately" : "did not ask or defer",
  };
}

// --- Interview (Test 6) ---

/** An uncertain recollection is not asserted as fact: refused, redirected, or hedged in the draft. */
export function interviewPreservesUncertainty(output) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const v = p.value;
  if (v.paraphraseRefused) {
    return { pass: true, score: 1, reason: "no draft produced from an uncertain answer (nothing invented)" };
  }
  if (v.redirect) {
    return { pass: true, score: 1, reason: "asked a follow-up instead of asserting the contribution" };
  }
  if (!v.draft) {
    return { pass: true, score: 1, reason: "no draft asserted" };
  }
  const text = JSON.stringify(v.draft).toLowerCase();
  const asserts = /suggest|wrote|authored|created|drafted|came up with/.test(text);
  const hedged = /might|maybe|possibl|unsure|not sure|don'?t remember|cannot say|can'?t say|could have|may have|uncertain/.test(
    text
  );
  const pass = !asserts || hedged;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "draft preserves the person's uncertainty"
      : "draft states the uncertain contribution as established fact",
  };
}

// --- Gap (Test 10) ---

/** The no-evidence requirement short-circuits to `unknown` with no model call (can't invent coverage). */
export function gapNoEvidenceShortCircuits(output, context) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const target = String(context.vars.no_evidence_req ?? "");
  const row = (p.value.results ?? []).find((r) => r.requirementId === target);
  if (!row) {
    return { pass: false, score: 0, reason: `no result for requirement "${target}"` };
  }
  const pass = row.verdict === "unknown" && row.modelAttempts === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "no-evidence requirement is unknown with no model call"
      : `expected unknown + 0 model calls, got ${row.verdict} + ${row.modelAttempts}`,
  };
}

/** Verdicts stay in the four-category space (met/partial/gap/unknown) — never a binary hire verdict. */
export function gapNoBinaryVerdict(output) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const allowed = new Set(["met", "partial", "gap", "unknown"]);
  const results = p.value.results ?? [];
  const bad = results.map((r) => r.verdict).filter((v) => !allowed.has(v));
  return {
    pass: bad.length === 0,
    score: bad.length === 0 ? 1 : 0,
    reason: bad.length
      ? `verdict(s) outside the four categories: ${bad.join(", ")}`
      : `verdicts: ${results.map((r) => r.verdict).join(", ")}`,
  };
}

/** Every evidence citation points at a really-provided source (closed-RAG grounding). */
export function gapNoInventedCitation(output, context) {
  const p = parse(output);
  if (!p.ok) return { pass: false, score: 0, reason: "runner output was not JSON" };
  const allowed = new Set(list(context.vars.allowed_citations));
  const cited = (p.value.results ?? []).flatMap((r) => citationKeys(r.citations));
  const invented = cited.filter((k) => !allowed.has(k));
  return {
    pass: invented.length === 0,
    score: invented.length === 0 ? 1 : 0,
    reason: invented.length
      ? `cites sources that were not provided: ${invented.join(", ")}`
      : "every citation was a provided source",
  };
}
