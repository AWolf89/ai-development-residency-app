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
  it("parses an array of row objects", () => {
    const text = JSON.stringify([
      { "O*NET-SOC Code": "15-1252.00", Title: "Software Developers" },
    ]);
    expect(parseOnetJson(text)).toEqual([
      { "O*NET-SOC Code": "15-1252.00", Title: "Software Developers" },
    ]);
  });

  it("throws when the JSON is not an array", () => {
    expect(() => parseOnetJson('{"not":"an array"}')).toThrow();
  });
});

describe("cell", () => {
  it("coerces numbers to strings and trims", () => {
    expect(cell({ "Data Value": 4 }, "Data Value")).toBe("4");
    expect(cell({ Title: "  X  " }, "Title")).toBe("X");
  });

  it("returns an empty string for missing or null values", () => {
    expect(cell({}, "Missing")).toBe("");
    expect(cell({ k: null }, "k")).toBe("");
  });
});

describe("mapOnetRow", () => {
  it("maps an occupation with its description", () => {
    const row = {
      "O*NET-SOC Code": "15-1252.00",
      Title: "Software Developers",
      Description: "Develop software.",
    };
    const item = mapOnetRow(table("Occupation Data.json"), row, "31.0");
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
      "O*NET-SOC Code": "15-1252.00",
      "Element ID": "2.A.1.a",
      "Element Name": "Reading Comprehension",
      "Scale ID": "IM",
      "Data Value": 4.12,
    };
    const item = mapOnetRow(table("Essential Skills.json"), row, "31.0");
    expect(item.entity_type).toBe("occupation_skill");
    expect(item.external_id).toBe("15-1252.00:2.A.1.a:IM");
    expect(item.name).toBe("Reading Comprehension");
    expect(item.description).toBeNull();
  });

  it("maps a task statement by task id", () => {
    const row = {
      "O*NET-SOC Code": "15-1252.00",
      "Task ID": 21857,
      Task: "Write code.",
    };
    const item = mapOnetRow(table("Task Statements.json"), row, "31.0");
    expect(item.entity_type).toBe("occupation_task");
    expect(item.external_id).toBe("21857");
    expect(item.name).toBe("Write code.");
  });

  it("throws when a required field is blank", () => {
    const row = { "O*NET-SOC Code": "", Title: "", Description: "" };
    expect(() =>
      mapOnetRow(table("Occupation Data.json"), row, "31.0")
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
    "O*NET-SOC Code": "15-1252.00",
    "Element ID": "2.A.1.a",
    "Element Name": "Reading Comprehension",
    "Scale ID": "IM",
    Title: "Software Developers",
    Description: "Develop software.",
    "Task ID": "21857",
    Task: "Write code.",
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
