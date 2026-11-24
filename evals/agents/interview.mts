// Reasoning / Decision-Point Interview model-level runner — §13 Test 6 (uncertain recollection
// stays hedged). It drives the REAL answer classifier (answer-classify.ts) and the REAL paraphrase
// prompt (interview-paraphrase.ts) through the gateway, mirroring the orchestrator's paraphrasing
// step: classify first, and only paraphrase an answer that is an account of events — a conclusion
// is redirected (budget-neutral), never paraphrased. The paraphrase uses ONLY the person's words,
// so a purely uncertain answer yields a hedged draft or, when it cannot fill the required CDM
// fields, a validation refusal (nothing fabricated). Usage: tsx interview.mts <caseId>.
import { answerClassify } from "../../src/lib/llm/prompts/answer-classify";
import { interviewParaphrase } from "../../src/lib/llm/prompts/interview-paraphrase";
import { learningMomentDetect } from "../../src/lib/llm/prompts/learning-moment-detect";
import { runStructured } from "../../src/lib/llm/run";
import {
  answerClassificationSchema,
  cdmDraftSchema,
  learningMomentDetectionSchema,
  groundLearningMoment,
  type CdmDraft,
  type LearningMomentDraft,
} from "../../src/lib/interview/types";
import { SELFTEST, emit, loadFixture, makeCostSink } from "./_lib.mjs";

type InterviewFixture = {
  question: string;
  answer: string;
  evidenceContext: string | null;
};

const caseId = process.argv[2] ?? "";
const fixture = loadFixture<InterviewFixture>(caseId);
const started = Date.now();
const { sink, getCost } = makeCostSink();

if (SELFTEST) {
  answerClassify.render({ question: fixture.question, answer: fixture.answer });
  interviewParaphrase.render({
    question: fixture.question,
    answer: fixture.answer,
    evidenceContext: fixture.evidenceContext,
  });
  learningMomentDetect.render({
    question: fixture.question,
    answer: fixture.answer,
  });
  emit({
    agent: "interview",
    caseId,
    output: { selftest: true, answerChars: fixture.answer.length },
    cost_usd: 0,
    latency_ms: Date.now() - started,
  });
  process.exit(0);
}

const { data: classification } = await runStructured({
  prompt: answerClassify,
  input: { question: fixture.question, answer: fixture.answer },
  schema: answerClassificationSchema,
  sink,
});

let draft: CdmDraft | null = null;
let paraphraseRefused = false;
let redirect: string | null = null;

if (classification.kind === "conclusion" && classification.redirect) {
  // A conclusion is guided back to the events (needs_redirect) — no paraphrase, no fabrication.
  redirect = classification.redirect;
} else {
  try {
    const { data } = await runStructured({
      prompt: interviewParaphrase,
      input: {
        question: fixture.question,
        answer: fixture.answer,
        evidenceContext: fixture.evidenceContext,
      },
      schema: cdmDraftSchema,
      sink,
    });
    draft = data;
  } catch (err) {
    // The paraphrase could not fill the required CDM fields from the person's words alone:
    // the honest outcome is no draft (nothing invented), surfaced for the user to add detail.
    paraphraseRefused = true;
    console.error(`interview paraphrase refused for "${caseId}":`, err);
  }
}

// Detect a learning moment from the same answer (ADR-0025), grounded the same way the
// orchestrator grounds it — null unless the model clearly flagged one and filled the fields (AC4).
let learningMoment: LearningMomentDraft | null = null;
const { data: detection } = await runStructured({
  prompt: learningMomentDetect,
  input: { question: fixture.question, answer: fixture.answer },
  schema: learningMomentDetectionSchema,
  sink,
});
learningMoment = groundLearningMoment(detection);

emit({
  agent: "interview",
  caseId,
  output: { classification, redirect, draft, paraphraseRefused, learningMoment },
  cost_usd: getCost(),
  latency_ms: Date.now() - started,
});
