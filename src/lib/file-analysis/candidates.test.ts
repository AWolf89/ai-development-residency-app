import { describe, it, expect } from "vitest";
import {
  parseCandidateKey,
  dedupeCandidateKeys,
  candidateKeysFromHits,
  rowMatchesAnyKey,
  toCandidate,
  type ReferenceItemRow,
} from "./candidates";

describe("parseCandidateKey", () => {
  it("maps a framework chunk id to its reference_items key", () => {
    expect(
      parseCandidateKey({
        id: "techfleet-spf:skills:customer-journey-mapping",
        source: "techfleet-spf",
      })
    ).toEqual({
      source: "techfleet-spf",
      entity_type: "skills",
      external_id: "customer-journey-mapping",
    });
  });

  it("maps an O*NET chunk id to its occupation key (any section)", () => {
    expect(
      parseCandidateKey({ id: "onet:15-2051.00:tasks", source: "onet" })
    ).toEqual({
      source: "onet",
      entity_type: "occupation",
      external_id: "15-2051.00",
    });
  });

  it("drops a framework entity type that is not taggable", () => {
    expect(
      parseCandidateKey({
        id: "techfleet-spf:content_model_element:x",
        source: "techfleet-spf",
      })
    ).toBeNull();
  });

  it("drops a malformed framework id", () => {
    expect(
      parseCandidateKey({ id: "techfleet-spf:skills", source: "techfleet-spf" })
    ).toBeNull();
  });

  it("drops an unknown source", () => {
    expect(parseCandidateKey({ id: "other:1:2", source: "other" })).toBeNull();
  });
});

describe("dedupeCandidateKeys / candidateKeysFromHits", () => {
  it("dedups by business key, preserving order, and skips non-taggable hits", () => {
    const keys = candidateKeysFromHits([
      { id: "techfleet-spf:skills:a", source: "techfleet-spf" },
      { id: "onet:15-2051.00:tasks", source: "onet" },
      { id: "onet:15-2051.00:skills", source: "onet" }, // same occupation -> dedup
      { id: "techfleet-spf:skills:a", source: "techfleet-spf" }, // duplicate
      { id: "nope:x:y", source: "nope" }, // dropped
    ]);
    expect(keys).toEqual([
      { source: "techfleet-spf", entity_type: "skills", external_id: "a" },
      { source: "onet", entity_type: "occupation", external_id: "15-2051.00" },
    ]);
  });

  it("dedupeCandidateKeys keeps distinct entity types with the same external_id", () => {
    const out = dedupeCandidateKeys([
      { source: "techfleet-spf", entity_type: "skills", external_id: "map" },
      {
        source: "techfleet-spf",
        entity_type: "deliverables",
        external_id: "map",
      },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("rowMatchesAnyKey / toCandidate", () => {
  const row: ReferenceItemRow = {
    id: "11111111-1111-4111-8111-111111111111",
    source: "techfleet-spf",
    entity_type: "skills",
    external_id: "customer-journey-mapping",
    name: "Customer Journey Mapping",
    description: "Mapping a customer's experience across touchpoints.",
  };

  it("matches only the exact (source, entity_type, external_id) tuple", () => {
    expect(
      rowMatchesAnyKey(row, [
        {
          source: "techfleet-spf",
          entity_type: "skills",
          external_id: "customer-journey-mapping",
        },
      ])
    ).toBe(true);
    expect(
      rowMatchesAnyKey(row, [
        {
          source: "techfleet-spf",
          entity_type: "deliverables",
          external_id: "customer-journey-mapping",
        },
      ])
    ).toBe(false);
  });

  it("shapes a row into a Candidate", () => {
    expect(toCandidate(row)).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      source: "techfleet-spf",
      entityType: "skills",
      externalId: "customer-journey-mapping",
      name: "Customer Journey Mapping",
      description: "Mapping a customer's experience across touchpoints.",
    });
  });
});
