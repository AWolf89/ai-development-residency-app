import { describe, it, expect } from "vitest";
import {
  selectManifestEntities,
  mapFrameworkRecord,
  mapFrameworkEntity,
  type FrameworkManifest,
  type ManifestEntity,
} from "./framework";

const manifest: FrameworkManifest = {
  framework: "Skills & Practices Framework",
  version: "v1",
  entities: [
    {
      entity: "skills",
      file: "framework-data/skills.json",
      count: 2,
      primaryField: "Skill Name",
    },
    {
      entity: "practices",
      file: "framework-data/practices.json",
      count: 1,
      primaryField: "Practice Name",
    },
    {
      entity: "workshops",
      file: "framework-data/workshops.json",
      count: 9,
      primaryField: "Workshop Name",
    },
  ],
};

describe("selectManifestEntities", () => {
  it("keeps only allowed entities, in manifest order", () => {
    const picked = selectManifestEntities(manifest, ["practices", "skills"]);
    expect(picked.map((e) => e.entity)).toEqual(["skills", "practices"]);
  });

  it("skips entities the manifest does not describe", () => {
    const picked = selectManifestEntities(manifest, ["skills", "missing"]);
    expect(picked.map((e) => e.entity)).toEqual(["skills"]);
  });
});

const skillsEntity: ManifestEntity = manifest.entities[0];

describe("mapFrameworkRecord", () => {
  it("maps a record using slug as external id and the primary field as name", () => {
    const item = mapFrameworkRecord(
      "skills",
      {
        id: 1,
        slug: "interviewing",
        "Skill Name": "Interviewing",
        "Skill Type": "Technical",
      },
      "Skill Name",
      "v1"
    );
    expect(item).toEqual({
      source: "techfleet-spf",
      entity_type: "skills",
      external_id: "interviewing",
      name: "Interviewing",
      description: null,
      payload: {
        id: 1,
        slug: "interviewing",
        "Skill Name": "Interviewing",
        "Skill Type": "Technical",
      },
      source_version: "v1",
    });
  });

  it("falls back to the numeric id when slug is absent", () => {
    const item = mapFrameworkRecord(
      "skills",
      { id: 42, "Skill Name": "Facilitation" },
      "Skill Name",
      null
    );
    expect(item.external_id).toBe("42");
    expect(item.source_version).toBeNull();
  });

  it("trims whitespace from name and slug", () => {
    const item = mapFrameworkRecord(
      "skills",
      { slug: "  listening  ", "Skill Name": "  Listening  " },
      "Skill Name",
      "v1"
    );
    expect(item.external_id).toBe("listening");
    expect(item.name).toBe("Listening");
  });

  it("throws when the name field is missing or blank", () => {
    expect(() =>
      mapFrameworkRecord(
        "skills",
        { slug: "x", "Skill Name": "" },
        "Skill Name",
        "v1"
      )
    ).toThrow();
  });

  it("throws when neither slug nor id can form an external id", () => {
    expect(() =>
      mapFrameworkRecord(
        "skills",
        { "Skill Name": "Orphan" },
        "Skill Name",
        "v1"
      )
    ).toThrow();
  });
});

describe("mapFrameworkEntity", () => {
  it("maps every record in the entity", () => {
    const items = mapFrameworkEntity(
      skillsEntity,
      [
        { id: 1, slug: "a", "Skill Name": "A" },
        { id: 2, slug: "b", "Skill Name": "B" },
      ],
      "v1"
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.external_id)).toEqual(["a", "b"]);
  });
});
