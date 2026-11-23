// File Analysis & Tagging model-level runner — §13 Tests 2, 5, 9 (informal feedback vs formal
// research, evidence inventory vs deliverable, confidentiality). It drives the REAL file-analysis
// prompt (file-analysis.ts) through the gateway (runStructured + analysisOutputSchema) and the REAL
// pure grounding (validateTags), mirroring the classifier's runModel exactly — no copied logic.
// Output: the grounded summary + proposed tags + clarifying questions. Usage: tsx file-analysis.mts <caseId>.
import { fileAnalysis } from "../../src/lib/llm/prompts/file-analysis";
import { runStructured } from "../../src/lib/llm/run";
import { analysisOutputSchema } from "../../src/lib/file-analysis/types";
import type { Candidate } from "../../src/lib/file-analysis/types";
import { validateTags } from "../../src/lib/file-analysis/analyze";
import { SELFTEST, emit, loadFixture, makeCostSink } from "./_lib.mjs";

type FileAnalysisFixture = {
  fileText: string;
  candidates: Candidate[];
  priorAnswers?: { question: string; answer: string }[];
};

const caseId = process.argv[2] ?? "";
const fixture = loadFixture<FileAnalysisFixture>(caseId);
const started = Date.now();
const { sink, getCost } = makeCostSink();

// The candidate shape the prompt renders (id it must echo + name/type/description to choose from).
const promptCandidates = fixture.candidates.map((c) => ({
  id: c.id,
  name: c.name,
  entityType: c.entityType,
  description: c.description,
}));

if (SELFTEST) {
  fileAnalysis.render({
    fileText: fixture.fileText,
    candidates: promptCandidates,
    priorAnswers: fixture.priorAnswers,
  });
  emit({
    agent: "file-analysis",
    caseId,
    output: { selftest: true, candidateCount: fixture.candidates.length },
    cost_usd: 0,
    latency_ms: Date.now() - started,
  });
  process.exit(0);
}

const { data } = await runStructured({
  prompt: fileAnalysis,
  input: {
    fileText: fixture.fileText,
    candidates: promptCandidates,
    priorAnswers: fixture.priorAnswers,
  },
  schema: analysisOutputSchema,
  sink,
});

// Closed-world grounding: a tag that does not point at a real candidate is dropped (never trusted).
const tags = validateTags(data.tags, fixture.candidates);

emit({
  agent: "file-analysis",
  caseId,
  output: { summary: data.summary, tags, questions: data.questions },
  cost_usd: getCost(),
  latency_ms: Date.now() - started,
});
