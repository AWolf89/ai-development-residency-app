import { describe, it, expect } from "vitest";
import {
  chunkReferenceItems,
  chunkEvidence,
  splitText,
  collectPayloadText,
  onetSoc,
  sha256,
} from "./chunk";
import type { RawReferenceRow } from "./types";

function row(over: Partial<RawReferenceRow>): RawReferenceRow {
  return {
    source: "onet",
    entity_type: "occupation",
    external_id: "15-2051.00",
    name: "Data Scientists",
    description: null,
    payload: {},
    source_version: "31.0",
    ...over,
  };
}

const occ = (soc: string, title: string, description: string | null = null) =>
  row({
    entity_type: "occupation",
    external_id: soc,
    name: title,
    description,
  });

const attr = (soc: string, entity: string, name: string) =>
  row({
    entity_type: entity,
    external_id: `${soc}:${name}`,
    name,
    payload: { onetsoc_code: soc },
  });

describe("onetSoc", () => {
  it("uses external_id for occupation rows and payload code for attributes", () => {
    expect(onetSoc(occ("15-2051.00", "DS"))).toBe("15-2051.00");
    expect(onetSoc(attr("15-2051.00", "occupation_skill", "SQL"))).toBe(
      "15-2051.00"
    );
  });
  it("returns empty string when no code is present", () => {
    expect(
      onetSoc(
        row({ entity_type: "occupation_skill", external_id: "x", payload: {} })
      )
    ).toBe("");
  });
});

describe("chunkReferenceItems — O*NET grouping", () => {
  const rows: RawReferenceRow[] = [
    occ("15-2051.00", "Data Scientists", "Develop models from data."),
    attr("15-2051.00", "occupation_task", "Build predictive models"),
    attr("15-2051.00", "occupation_skill", "Programming"),
    attr("15-2051.00", "occupation_transferable_skill", "Critical Thinking"),
    attr("15-2051.00", "occupation_knowledge", "Mathematics"),
    attr("15-2051.00", "occupation_ability", "Deductive Reasoning"),
    attr("15-2051.00", "occupation_work_activity", "Analyzing Data"),
  ];

  it("produces one chunk per non-empty section, each prefixed with title and code", () => {
    const chunks = chunkReferenceItems(rows);
    const sections = chunks.map((c) => c.section).sort();
    expect(sections).toEqual(
      [
        "abilities",
        "activities",
        "knowledge",
        "overview",
        "skills",
        "tasks",
      ].sort()
    );
    for (const c of chunks) {
      expect(c.source).toBe("onet");
      expect(c.ref_id).toBe("15-2051.00");
      expect(c.ref_kind).toBe("occupation");
      expect(c.title).toBe("Data Scientists");
      expect(c.id).toBe(`onet:15-2051.00:${c.section}`);
      expect(c.content).toContain("Data Scientists (15-2051.00)");
    }
  });

  it("merges essential and transferable skills into one skills chunk", () => {
    const skills = chunkReferenceItems(rows).find(
      (c) => c.section === "skills"
    );
    expect(skills?.content).toContain("Programming");
    expect(skills?.content).toContain("Critical Thinking");
  });

  it("puts the description in the overview chunk", () => {
    const overview = chunkReferenceItems(rows).find(
      (c) => c.section === "overview"
    );
    expect(overview?.content).toContain("Develop models from data.");
  });

  it("keeps two occupations separate", () => {
    const chunks = chunkReferenceItems([
      occ("15-2051.00", "Data Scientists"),
      attr("15-2051.00", "occupation_skill", "Programming"),
      occ("11-1021.00", "General Managers"),
      attr("11-1021.00", "occupation_skill", "Coordination"),
    ]);
    const ds = chunks.find(
      (c) => c.ref_id === "15-2051.00" && c.section === "skills"
    );
    const gm = chunks.find(
      (c) => c.ref_id === "11-1021.00" && c.section === "skills"
    );
    expect(ds?.content).toContain("Programming");
    expect(ds?.content).not.toContain("Coordination");
    expect(gm?.content).toContain("Coordination");
  });

  it("skips content_model_element and unknown/empty sections", () => {
    const chunks = chunkReferenceItems([
      row({
        entity_type: "content_model_element",
        external_id: "2.A.1",
        name: "Reading",
      }),
      occ("15-2051.00", "Data Scientists"), // no attributes -> only overview
    ]);
    expect(chunks.map((c) => c.section)).toEqual(["overview"]);
  });

  it("handles attributes with no occupation row (soc as title, no overview)", () => {
    const chunks = chunkReferenceItems([
      attr("99-9999.00", "occupation_skill", "Widgetry"),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section).toBe("skills");
    expect(chunks[0].title).toBe("99-9999.00");
  });
});

describe("chunkReferenceItems — framework rows", () => {
  it("makes one entity chunk per framework row and pulls payload text", () => {
    const chunks = chunkReferenceItems([
      row({
        source: "techfleet-spf",
        entity_type: "specializations",
        external_id: "data-analyst",
        name: "Data Analyst",
        payload: {
          slug: "data-analyst",
          id: 7,
          "Specialization Tasks": [{ slug: "t1", label: "Clean data" }],
        },
      }),
    ]);
    expect(chunks).toHaveLength(1);
    const c = chunks[0];
    expect(c.source).toBe("techfleet-spf");
    expect(c.ref_id).toBe("data-analyst");
    expect(c.ref_kind).toBe("framework_specializations");
    expect(c.section).toBe("entity");
    expect(c.content).toContain("Data Analyst");
    expect(c.content).toContain("Clean data");
    expect(c.content).not.toContain("data-analyst"); // slug dropped
  });

  it("falls back to the bare name when payload has no usable text", () => {
    const chunks = chunkReferenceItems([
      row({
        source: "techfleet-spf",
        entity_type: "skills",
        external_id: "sql",
        name: "SQL",
        payload: { slug: "sql", id: 1 },
      }),
    ]);
    expect(chunks[0].content).toBe("SQL");
  });

  it("gives framework rows distinct ids even when a slug repeats across entity types", () => {
    const chunks = chunkReferenceItems([
      row({
        source: "techfleet-spf",
        entity_type: "duties",
        external_id: "lead",
        name: "Lead (duty)",
        payload: {},
      }),
      row({
        source: "techfleet-spf",
        entity_type: "deliverables",
        external_id: "lead",
        name: "Lead (deliverable)",
        payload: {},
      }),
    ]);
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(2); // no id collision -> safe to upsert in one batch
    expect(ids).toContain("techfleet-spf:duties:lead");
    expect(ids).toContain("techfleet-spf:deliverables:lead");
  });

  it("drops a framework row with a blank name", () => {
    const chunks = chunkReferenceItems([
      row({
        source: "techfleet-spf",
        entity_type: "skills",
        external_id: "x",
        name: "   ",
        payload: {},
      }),
    ]);
    expect(chunks).toEqual([]);
  });
});

describe("collectPayloadText", () => {
  it("keeps strings and nested labels, drops ids/slugs/urls", () => {
    expect(
      collectPayloadText({
        definition: "Writing queries",
        slug: "sql",
        id: 3,
        source_url: "http://x",
        tasks: [{ label: "Join tables" }, "Index"],
      })
    ).toEqual(["Writing queries", "Join tables", "Index"]);
  });
});

describe("sha256 / content_hash", () => {
  it("is stable for identical content and differs when content changes", () => {
    const a = chunkReferenceItems([
      occ("15-2051.00", "Data Scientists", "Same text."),
    ]);
    const b = chunkReferenceItems([
      occ("15-2051.00", "Data Scientists", "Same text."),
    ]);
    const c = chunkReferenceItems([
      occ("15-2051.00", "Data Scientists", "Different text."),
    ]);
    expect(a[0].content_hash).toBe(b[0].content_hash);
    expect(a[0].content_hash).not.toBe(c[0].content_hash);
    expect(a[0].content_hash).toHaveLength(64);
  });
  it("hashes deterministically", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
});

describe("splitText", () => {
  it("returns one chunk for short text", () => {
    expect(splitText("hello world")).toEqual([
      { chunk_index: 0, content: "hello world" },
    ]);
  });
  it("returns nothing for whitespace-only text", () => {
    expect(splitText("   \n\n  ")).toEqual([]);
  });
  it("splits on paragraph boundaries when over the budget", () => {
    const out = splitText("aaa\n\nbbb\n\nccc", 5);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].chunk_index).toBe(0);
    expect(out.at(-1)?.chunk_index).toBe(out.length - 1);
  });
  it("hard-splits a single oversized paragraph", () => {
    const out = splitText("x".repeat(25), 10);
    expect(out).toHaveLength(3);
    expect(out.every((c) => c.content.length <= 10)).toBe(true);
  });
});

describe("chunkEvidence", () => {
  it("wraps split text with file metadata and hashes", () => {
    const out = chunkEvidence(
      "para one\n\npara two",
      {
        source_kind: "file",
        file_id: "11111111-1111-1111-1111-111111111111",
        title: "resume.pdf",
      },
      10
    );
    expect(out[0]).toMatchObject({
      source_kind: "file",
      file_id: "11111111-1111-1111-1111-111111111111",
      decision_record_id: null,
      title: "resume.pdf",
      chunk_index: 0,
    });
    expect(out[0].content_hash).toHaveLength(64);
  });
  it("supports decision_record source", () => {
    const out = chunkEvidence("led a migration", {
      source_kind: "decision_record",
      decision_record_id: "22222222-2222-2222-2222-222222222222",
      title: "DB migration",
    });
    expect(out[0].source_kind).toBe("decision_record");
    expect(out[0].file_id).toBeNull();
    expect(out[0].decision_record_id).toBe(
      "22222222-2222-2222-2222-222222222222"
    );
  });
});
