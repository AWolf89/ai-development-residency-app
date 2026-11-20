import { describe, it, expect } from "vitest";
import {
  mapProjectRowToView,
  formatDateRange,
  formatLinkCounts,
  type ProjectRow,
} from "./mappers";

const baseRow: ProjectRow = {
  id: "p-1",
  name: "Acme relaunch",
  role: "Tech lead",
  organisation: "Acme Inc",
  summary: "Rebuilt the site.",
  status: "active",
  started_on: "2024-01-15",
  ended_on: "2025-03-01",
  created_at: "2024-01-10T00:00:00.000Z",
};

describe("mapProjectRowToView", () => {
  it("maps a row to the view, passing fields through", () => {
    const view = mapProjectRowToView(baseRow);
    expect(view).toMatchObject({
      id: "p-1",
      name: "Acme relaunch",
      role: "Tech lead",
      organisation: "Acme Inc",
      summary: "Rebuilt the site.",
      status: "active",
      createdAt: "2024-01-10T00:00:00.000Z",
    });
  });

  it("includes a date-range label built from the dates", () => {
    expect(mapProjectRowToView(baseRow).dateRangeLabel).toBe(
      "Jan 2024 – Mar 2025"
    );
  });

  it("carries nulls through unchanged", () => {
    const view = mapProjectRowToView({
      ...baseRow,
      role: null,
      organisation: null,
      summary: null,
      started_on: null,
      ended_on: null,
    });
    expect(view.role).toBeNull();
    expect(view.organisation).toBeNull();
    expect(view.summary).toBeNull();
    expect(view.dateRangeLabel).toBe("");
  });
});

describe("formatDateRange", () => {
  it("formats both dates as a range", () => {
    expect(formatDateRange("2024-01-15", "2025-03-01")).toBe(
      "Jan 2024 – Mar 2025"
    );
  });

  it("formats a start-only date as 'Since …'", () => {
    expect(formatDateRange("2024-01-15", null)).toBe("Since Jan 2024");
  });

  it("formats an end-only date as 'Until …'", () => {
    expect(formatDateRange(null, "2025-03-01")).toBe("Until Mar 2025");
  });

  it("returns an empty string when there are no dates", () => {
    expect(formatDateRange(null, null)).toBe("");
  });
});

describe("formatLinkCounts", () => {
  it("formats plural counts", () => {
    expect(formatLinkCounts({ files: 3, records: 2, moments: 4 })).toBe(
      "3 files · 2 records · 4 moments"
    );
  });

  it("uses singular wording for a count of one", () => {
    expect(formatLinkCounts({ files: 1, records: 1, moments: 1 })).toBe(
      "1 file · 1 record · 1 moment"
    );
  });

  it("handles the all-zero case", () => {
    expect(formatLinkCounts({ files: 0, records: 0, moments: 0 })).toBe(
      "0 files · 0 records · 0 moments"
    );
  });
});
