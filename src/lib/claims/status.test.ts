import { describe, it, expect } from "vitest";
import { deriveStatus } from "./status";

describe("deriveStatus", () => {
  it("is evidence_linked when any source file is present", () => {
    expect(deriveStatus({ sourceCount: 1, isMetric: false })).toBe(
      "evidence_linked"
    );
    expect(deriveStatus({ sourceCount: 3, isMetric: true })).toBe(
      "evidence_linked"
    );
  });

  it("is self_reported_metric when flagged a metric and unsupported", () => {
    expect(deriveStatus({ sourceCount: 0, isMetric: true })).toBe(
      "self_reported_metric"
    );
  });

  it("is recollection when unsupported and not a metric", () => {
    expect(deriveStatus({ sourceCount: 0, isMetric: false })).toBe(
      "recollection"
    );
  });

  it("lets evidence win over the metric flag", () => {
    expect(deriveStatus({ sourceCount: 2, isMetric: true })).toBe(
      "evidence_linked"
    );
  });
});
