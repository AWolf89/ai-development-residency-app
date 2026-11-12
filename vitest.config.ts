import { defineConfig } from "vitest/config";

// Unit-test runner for the Career Evidence Agent.
//
// Scope note (CLAUDE.md rule 3 — Humble Object, rule 5 — 80% coverage gate):
// coverage is measured on PURE-LOGIC modules only, not on the thin boundary
// wrappers (Supabase clients, Server Actions) or React UI. Those are kept
// logic-free on purpose, so forcing a coverage number on them would only
// produce brittle tests. The `coverage.include` list below is the set the 80%
// floor applies to; add each new pure-logic module to it as it lands.
export default defineConfig({
  test: {
    environment: "node", // pure functions today; add jsdom when we test components
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      all: true, // count included files even when a test file does not import them
      include: [
        "src/lib/**/validation.ts",
        "src/lib/files/mappers.ts",
        "src/lib/files/record.ts",
        "src/lib/decision-records/mappers.ts",
        "src/lib/decision-records/save.ts",
        "src/lib/target-roles/extract.ts",
        "src/lib/target-roles/matching.ts",
        "src/lib/target-roles/occupation.ts",
        "src/lib/target-roles/source.ts",
        "src/lib/target-roles/mappers.ts",
        "src/lib/target-roles/save.ts",
        "src/lib/reference/types.ts",
        "src/lib/reference/framework.ts",
        "src/lib/reference/onet.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
