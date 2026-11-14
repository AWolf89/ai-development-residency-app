# Retrieval evaluation (reference corpus)

Questions: 10 (7 answerable) · k=5

**Hit rate @5: 100%** · **MRR: 0.69**

| Question | Expected ref_id | Rank | Best similarity | Keyword match |
|---|---|---|---|---|
| How do I communicate clearly in writing at work? | written-communication | 1 | 0.480 | yes |
| ways to resolve conflict between teammates | conflict-resolution | 1 | 0.601 | no |
| writing effective prompts for an AI assistant | ai-prompting | 3 | 0.644 | no |
| helping a team feel safe to speak up and take risks | psychological-safety | 2 | 0.579 | yes |
| designing a survey to gather user feedback | survey-design | 2 | 0.588 | yes |
| giving constructive feedback to a coworker | delivering-feedback | 1 | 0.504 | no |
| analyzing research and synthesizing findings | research-analysis | 2 | 0.567 | no |
| What's the weather tomorrow? | (none: should abstain) | - | 0.138 | no |
| Write me a poem about the ocean | (none: should abstain) | - | 0.193 | no |
| Who won the World Series last night? | (none: should abstain) | - | 0.139 | no |

Suggested minSimilarity: **0.34** (unanswerable max 0.193 < answerable min 0.480).
