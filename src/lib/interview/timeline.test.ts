import { describe, it, expect } from "vitest";
import {
  draftTimeline,
  isUsableDate,
  parseVersionHint,
  cleanBaseName,
  timelineEntrySchema,
  timelineSchema,
  type TimelineFile,
} from "./timeline";

const file = (
  id: string,
  name: string,
  createdAt: string | null
): TimelineFile => ({ id, name, createdAt });

describe("isUsableDate", () => {
  it("accepts a real ISO date", () => {
    expect(isUsableDate("2026-11-01T10:00:00.000Z")).toBe(true);
    expect(isUsableDate("2026-11-01")).toBe(true);
  });

  it("rejects null, empty, and unparseable strings", () => {
    expect(isUsableDate(null)).toBe(false);
    expect(isUsableDate(undefined)).toBe(false);
    expect(isUsableDate("")).toBe(false);
    expect(isUsableDate("not a date")).toBe(false);
  });
});

describe("parseVersionHint", () => {
  it("detects and normalises common version markers", () => {
    expect(parseVersionHint("Migration Plan v2.pdf")).toBe("v2");
    expect(parseVersionHint("report_final.docx")).toBe("final");
    expect(parseVersionHint("notes draft.md")).toBe("draft");
    expect(parseVersionHint("spec Rev 3.pdf")).toBe("rev3");
  });

  it("returns null when there is no version marker", () => {
    expect(parseVersionHint("summary.pdf")).toBeNull();
    expect(parseVersionHint("budget.xlsx")).toBeNull();
  });
});

describe("cleanBaseName", () => {
  it("strips extension, version, and separators to a stable key", () => {
    expect(cleanBaseName("Migration Plan v2.pdf")).toBe("migration plan");
    expect(cleanBaseName("migration_plan_v1.pdf")).toBe("migration plan");
    expect(cleanBaseName("report-final.docx")).toBe("report");
  });

  it("strips date tokens from the name", () => {
    expect(cleanBaseName("standup_2026-11-01.md")).toBe("standup");
  });
});

describe("draftTimeline", () => {
  it("returns an empty timeline when no file has a usable date (manual fallback)", () => {
    const files = [file("a", "plan.pdf", null), file("b", "notes.md", "nope")];
    expect(draftTimeline(files)).toEqual([]);
  });

  it("excludes undated files but keeps dated ones", () => {
    const tl = draftTimeline([
      file("a", "plan.pdf", "2026-11-01"),
      file("b", "notes.md", null),
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0].fileIds).toEqual(["a"]);
  });

  it("orders decision points chronologically by earliest date", () => {
    const tl = draftTimeline([
      file("late", "launch.pdf", "2026-11-20"),
      file("early", "kickoff.pdf", "2026-10-01"),
      file("mid", "review.pdf", "2026-11-05"),
    ]);
    expect(tl.map((e) => e.label)).toEqual(["Kickoff", "Review", "Launch"]);
    expect(tl.map((e) => e.id)).toEqual(["entry-0", "entry-1", "entry-2"]);
  });

  it("groups a file's revisions into one point with a version progression", () => {
    const tl = draftTimeline([
      file("v1", "Migration Plan v1.pdf", "2026-10-02"),
      file("v3", "migration_plan_v3.pdf", "2026-10-20"),
      file("v2", "Migration Plan v2.pdf", "2026-10-10"),
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0].label).toBe("Migration Plan");
    expect(tl[0].fileIds.sort()).toEqual(["v1", "v2", "v3"]);
    expect(tl[0].versionHint).toBe("v1→v2→v3");
    // The point's date is the earliest revision.
    expect(tl[0].date).toBe("2026-10-02");
  });

  it("uses the earliest date even when the earlier revision is seen last", () => {
    const tl = draftTimeline([
      file("v2", "Plan v2.pdf", "2026-10-20"),
      file("v1", "Plan v1.pdf", "2026-10-02"),
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0].date).toBe("2026-10-02");
  });

  it("keeps files whose names clean to nothing as separate points", () => {
    const tl = draftTimeline([
      file("a", "v1.pdf", "2026-10-01"),
      file("b", "final.pdf", "2026-10-02"),
    ]);
    expect(tl).toHaveLength(2);
    expect(tl.map((e) => e.label).sort()).toEqual(["final", "v1"]);
  });

  it("leaves versionHint null for a single unversioned file", () => {
    const tl = draftTimeline([file("a", "summary.pdf", "2026-11-01")]);
    expect(tl[0].versionHint).toBeNull();
  });

  it("orders non-numeric version markers alphabetically in the hint", () => {
    const tl = draftTimeline([
      file("f", "Report final.pdf", "2026-10-10"),
      file("d", "Report draft.pdf", "2026-10-01"),
    ]);
    expect(tl).toHaveLength(1);
    expect(tl[0].versionHint).toBe("draft→final");
  });

  it("keeps files with distinct names as separate points", () => {
    const tl = draftTimeline([
      file("a", "plan.pdf", "2026-10-01"),
      file("b", "retro.pdf", "2026-10-02"),
    ]);
    expect(tl).toHaveLength(2);
  });

  it("produces entries that satisfy the timeline schema", () => {
    const tl = draftTimeline([
      file("v1", "plan v1.pdf", "2026-10-02"),
      file("v2", "plan v2.pdf", "2026-10-10"),
    ]);
    expect(timelineSchema.safeParse(tl).success).toBe(true);
  });
});

describe("timelineEntrySchema", () => {
  it("accepts a manual entry with a null date and no files", () => {
    const parsed = timelineEntrySchema.safeParse({
      id: "manual-1",
      label: "Decided the architecture",
      date: null,
      fileIds: [],
      versionHint: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an entry with a blank label", () => {
    expect(
      timelineEntrySchema.safeParse({
        id: "x",
        label: "   ",
        date: null,
        fileIds: [],
        versionHint: null,
      }).success
    ).toBe(false);
  });
});
