import { describe, it, expect } from "vitest";
import { assembleProjectDetail } from "./detail";
import type { ProjectRow } from "./mappers";

const projectRow: ProjectRow = {
  id: "p-1",
  name: "Acme relaunch",
  role: "Tech lead",
  organisation: "Acme Inc",
  summary: null,
  status: "active",
  started_on: "2024-01-15",
  ended_on: null,
  created_at: "2024-01-10T00:00:00.000Z",
};

describe("assembleProjectDetail", () => {
  it("assembles the project view with its three linked groups and counts", () => {
    const detail = assembleProjectDetail({
      project: projectRow,
      files: [
        { id: "f-1", file_name: "deck.pdf", caption: "Launch deck" },
        { id: "f-2", file_name: "notes.md", caption: null },
      ],
      records: [{ id: "r-1", title: "Chose Next.js" }],
      moments: [
        { id: "m-1", kind: "speed" },
        { id: "m-2", kind: "pivot" },
        { id: "m-3", kind: "insight" },
      ],
    });

    expect(detail.project.name).toBe("Acme relaunch");
    expect(detail.project.dateRangeLabel).toBe("Since Jan 2024");
    expect(detail.files).toHaveLength(2);
    expect(detail.records).toEqual([{ id: "r-1", title: "Chose Next.js" }]);
    expect(detail.moments).toHaveLength(3);
    expect(detail.counts).toEqual({ files: 2, records: 1, moments: 3 });
    expect(detail.countsLabel).toBe("2 files · 1 record · 3 moments");
  });

  it("handles a project with no linked evidence", () => {
    const detail = assembleProjectDetail({
      project: projectRow,
      files: [],
      records: [],
      moments: [],
    });

    expect(detail.files).toEqual([]);
    expect(detail.records).toEqual([]);
    expect(detail.moments).toEqual([]);
    expect(detail.countsLabel).toBe("0 files · 0 records · 0 moments");
  });
});
