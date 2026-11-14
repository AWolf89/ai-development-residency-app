import { describe, it, expect } from "vitest";
import {
  referenceChunkSchema,
  evidenceChunkSchema,
  rawReferenceRowSchema,
  EMBEDDING_DIM,
} from "./types";

const validRef = {
  id: "onet:15-2051.00:tasks",
  source: "onet",
  ref_id: "15-2051.00",
  ref_kind: "occupation",
  title: "Data Scientists",
  section: "tasks",
  content: "Build models.",
  content_hash: "a".repeat(64),
  source_version: "31.0",
};

describe("rag schemas", () => {
  it("EMBEDDING_DIM is the expected size", () => {
    expect(EMBEDDING_DIM).toBe(1536);
  });

  it("referenceChunkSchema accepts a valid chunk", () => {
    expect(referenceChunkSchema.parse(validRef)).toMatchObject({
      id: "onet:15-2051.00:tasks",
    });
  });

  it("referenceChunkSchema rejects a bad content_hash length", () => {
    expect(
      referenceChunkSchema.safeParse({ ...validRef, content_hash: "short" })
        .success
    ).toBe(false);
  });

  it("referenceChunkSchema rejects a missing ref_id", () => {
    const { ref_id: _omit, ...withoutRefId } = validRef;
    void _omit;
    expect(referenceChunkSchema.safeParse(withoutRefId).success).toBe(false);
  });

  it("evidenceChunkSchema requires a known source_kind", () => {
    expect(
      evidenceChunkSchema.safeParse({
        source_kind: "nope",
        file_id: null,
        decision_record_id: null,
        title: "x",
        chunk_index: 0,
        content: "c",
        content_hash: "a".repeat(64),
      }).success
    ).toBe(false);
  });

  it("rawReferenceRowSchema accepts a reference_items row", () => {
    expect(
      rawReferenceRowSchema.parse({
        source: "onet",
        entity_type: "occupation",
        external_id: "15-2051.00",
        name: "Data Scientists",
        description: null,
        payload: { onetsoc_code: "15-2051.00" },
        source_version: "31.0",
      }).source
    ).toBe("onet");
  });
});
