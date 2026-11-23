import { describe, it, expect } from "vitest";
import { groundProposal } from "./validate";
import type { ProposalOutput } from "./types";

const baseRecord = {
  title: "Led the pilot",
  situation: "Processing was slow.",
  decision: "Piloted a shorter form.",
  outcome: "Pilot ran with two teams.",
  confidence: "medium" as const,
  location: "p. 2, Pilot section",
};

const output = (over: Partial<ProposalOutput> = {}): ProposalOutput => ({
  projectClear: true,
  project: {
    name: "Onboarding redesign",
    organisation: "Acme",
    startedOn: "2024-01-01",
    endedOn: "2024-03-01",
    summary: "Redesigned the onboarding form.",
  },
  records: [baseRecord],
  questions: [],
  ...over,
});

describe("groundProposal — project", () => {
  it("keeps a valid project, mapped to ProjectInput shape", () => {
    const { project } = groundProposal(output());
    expect(project).toEqual({
      name: "Onboarding redesign",
      organisation: "Acme",
      startedOn: "2024-01-01",
      endedOn: "2024-03-01",
      summary: "Redesigned the onboarding form.",
    });
  });

  it("drops a project with an invalid date to null (never shown)", () => {
    const { project } = groundProposal(
      output({ project: { name: "X", startedOn: "2024-13-40" } })
    );
    expect(project).toBeNull();
  });

  it("drops a project whose end precedes its start", () => {
    const { project } = groundProposal(
      output({
        project: { name: "X", startedOn: "2024-05-01", endedOn: "2024-01-01" },
      })
    );
    expect(project).toBeNull();
  });

  it("passes through a null project", () => {
    expect(groundProposal(output({ project: null })).project).toBeNull();
  });
});

describe("groundProposal — records (grounding, AC2)", () => {
  it("keeps a cited record and maps it (source artifact, contribution passed through)", () => {
    const { records, droppedRecords } = groundProposal(
      output({ records: [{ ...baseRecord, contribution: "team" }] })
    );
    expect(droppedRecords).toBe(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      title: "Led the pilot",
      location: "p. 2, Pilot section",
      contribution: "team",
      confidence: "medium",
    });
  });

  it("drops an uncited record (no location) and counts it", () => {
    const uncited = { ...baseRecord };
    delete (uncited as { location?: string }).location;
    const { records, droppedRecords } = groundProposal(
      output({ records: [uncited] })
    );
    expect(records).toHaveLength(0);
    expect(droppedRecords).toBe(1);
  });

  it("never defaults contribution to individual (absent → null)", () => {
    const { records } = groundProposal(output({ records: [baseRecord] }));
    expect(records[0].contribution).toBeNull();
  });

  it("keeps the grounded records and drops the ungrounded ones in a mixed batch", () => {
    const uncited = { ...baseRecord, title: "Uncited claim" };
    delete (uncited as { location?: string }).location;
    const { records, droppedRecords } = groundProposal(
      output({
        records: [
          baseRecord,
          uncited,
          { ...baseRecord, title: "Second cited" },
        ],
      })
    );
    expect(records.map((r) => r.title)).toEqual([
      "Led the pilot",
      "Second cited",
    ]);
    expect(droppedRecords).toBe(1);
  });

  it("nullifies optional cue/why when the model omitted them", () => {
    const { records } = groundProposal(output());
    expect(records[0].cue).toBeNull();
    expect(records[0].why).toBeNull();
  });
});
