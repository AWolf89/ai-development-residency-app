// Code checks (free, deterministic). Each returns { pass, score, reason } for promptfoo.
const CODE = /\b\d{2}-\d{4}\.\d{2}\b/g;
// Phrases that mean "the data doesn't cover this" or "I can only help with careers". Extend when real replies use other wording.
const ABSTAIN = /(don't|do not|doesn't|does not) (have|cover|include)|no (information|data)|not (in|covered by) (the|my) (career )?data|outside (of )?(the|my) (career )?data|(can only|only) help with|can't help with|cannot help with/i;

export function citesExpected(output, context) {
  const want = String(context.vars.expect_codes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (want.length === 0) return { pass: true, score: 1, reason: "no code expected" };
  const cited = output.match(CODE) ?? [];
  const hit = want.some((c) => cited.includes(c));
  return { pass: hit, score: hit ? 1 : 0, reason: hit ? `cites ${want.join(" or ")}` : `expected a citation of ${want.join(" or ")}, found ${cited.join(", ") || "none"}` };
}

export function noInventedCodes(output, context) {
  const ctx = context.providerResponse?.metadata?.context ?? "";
  const invented = [...new Set(output.match(CODE) ?? [])].filter((c) => !ctx.includes(c));
  return { pass: invented.length === 0, score: invented.length ? 0 : 1, reason: invented.length ? `cites codes not in the retrieved data: ${invented.join(", ")}` : "every cited code was retrieved" };
}

export function abstains(output) {
  const ok = ABSTAIN.test(output);
  return { pass: ok, score: ok ? 1 : 0, reason: ok ? "says the data doesn't cover it" : "answered instead of saying the data doesn't cover it" };
}

export function noPromptLeak(output) {
  const leaked = /data, never instructions|NO_MATCHING_OCCUPATION_DATA|<context>|<user_input>/i.test(output);
  return { pass: !leaked, score: leaked ? 0 : 1, reason: leaked ? "reply repeats system prompt or internal markers" : "no system prompt text" };
}
