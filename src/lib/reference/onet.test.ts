import { describe, it, expect } from "vitest";
import {
  parseOnetJson,
  mapOnetRow,
  cell,
  ONET_TABLES,
  type OnetTableConfig,
} from "./onet";

const table = (file: string): OnetTableConfig => {
  const found = ONET_TABLES.find((t) => t.file === file);
  if (!found) throw new Error(`test setup: ${file} not configured`);
  return found;
};

describe("parseOnetJson", () => {
  it("extracts the row array from an O*NET { column, row } object", () => {
    const text = JSON.stringify({
      table_id: "occupation_data",
      column: [{ column_id: "onetsoc_code" }],
      row: [{ onetsoc_code: "15-1252.00", title: "Software Developers" }],
    });
    expect(parseOnetJson(text)).toEqual([
      { onetsoc_code: "15-1252.00", title: "Software Developers" },
    ]);
  });

  it("accepts a plain array defensively", () => {
    expect(parseOnetJson('[{"onetsoc_code":"x"}]')).toEqual([
      { onetsoc_code: "x" },
    ]);
  });

  it("throws when there is no row array", () => {
    expect(() => parseOnetJson('{"table_id":"x"}')).toThrow();
  });
});

describe("cell", () => {
  it("coerces numbers to strings and trims", () => {
    expect(cell({ data_value: 4 }, "data_value")).toBe("4");
    expect(cell({ title: "  X  " }, "title")).toBe("X");
  });

  it("returns an empty string for missing or null values", () => {
    expect(cell({}, "missing")).toBe("");
    expect(cell({ k: null }, "k")).toBe("");
  });
});

describe("mapOnetRow", () => {
  it("maps an occupation with its description", () => {
    const row = {
      onetsoc_code: "15-1252.00",
      title: "Software Developers",
      description: "Develop software.",
    };
    const item = mapOnetRow(table("occupation_data.json"), row, "31.0");
    expect(item).toMatchObject({
      source: "onet",
      entity_type: "occupation",
      external_id: "15-1252.00",
      name: "Software Developers",
      description: "Develop software.",
      source_version: "31.0",
    });
  });

  it("builds a composite external id for a rated attribute row", () => {
    const row = {
      onetsoc_code: "15-1252.00",
      element_id: "2.A.1.a",
      element_name: "Reading Comprehension",
      scale_id: "IM",
      data_value: 4.12,
    };
    const item = mapOnetRow(table("essential_skills.json"), row, "31.0");
    expect(item.entity_type).toBe("occupation_skill");
    expect(item.external_id).toBe("15-1252.00:2.A.1.a:IM");
    expect(item.name).toBe("Reading Comprehension");
    expect(item.description).toBeNull();
  });

  it("maps a task statement by task id", () => {
    const row = {
      onetsoc_code: "15-1252.00",
      task_id: 21857,
      task: "Write code.",
    };
    const item = mapOnetRow(table("task_statements.json"), row, "31.0");
    expect(item.entity_type).toBe("occupation_task");
    expect(item.external_id).toBe("21857");
    expect(item.name).toBe("Write code.");
  });

  it("throws when a required field is blank", () => {
    const row = { onetsoc_code: "", title: "", description: "" };
    expect(() =>
      mapOnetRow(table("occupation_data.json"), row, "31.0")
    ).toThrow();
  });
});

describe("ONET_TABLES", () => {
  it("covers the curated 31.0 subset", () => {
    expect(ONET_TABLES.map((t) => t.entityType)).toEqual([
      "occupation",
      "content_model_element",
      "occupation_skill",
      "occupation_transferable_skill",
      "occupation_ability",
      "occupation_knowledge",
      "occupation_work_activity",
      "occupation_task",
    ]);
  });

  // A row carrying every column any table reads, so each config's accessors run.
  const fullRow = {
    onetsoc_code: "15-1252.00",
    element_id: "2.A.1.a",
    element_name: "Reading Comprehension",
    scale_id: "IM",
    title: "Software Developers",
    description: "Develop software.",
    task_id: "21857",
    task: "Write code.",
  };

  it.each(ONET_TABLES)(
    "maps a valid item for every configured table ($entityType)",
    (config) => {
      const item = mapOnetRow(config, fullRow, "31.0");
      expect(item.source).toBe("onet");
      expect(item.entity_type).toBe(config.entityType);
      expect(item.external_id.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
    }
  );
});
