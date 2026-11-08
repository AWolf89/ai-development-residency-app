// Temporary file to verify CI blocks a failing PR. Safe to delete.
// This has a deliberate TypeScript error so `next build` fails in CI.
export const brokenGateCheck: number = "this is not a number";
