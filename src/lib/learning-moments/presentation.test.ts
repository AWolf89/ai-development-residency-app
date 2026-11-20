import { describe, it, expect } from "vitest";
import { presentationFor, allKindPresentations } from "./presentation";
import { LEARNING_MOMENT_KINDS } from "./types";

describe("learning-moment presentation", () => {
  it("gives every kind a prompt, label, and shift label", () => {
    for (const kind of LEARNING_MOMENT_KINDS) {
      const p = presentationFor(kind);
      expect(p.prompt.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.shiftLabel.length).toBeGreaterThan(0);
    }
  });

  it("shows duration only for the speed kind (AC2)", () => {
    expect(presentationFor("speed").showsDuration).toBe(true);
    expect(presentationFor("insight").showsDuration).toBe(false);
    expect(presentationFor("pivot").showsDuration).toBe(false);
    expect(presentationFor("transfer").showsDuration).toBe(false);
  });

  it("the speed prompt asks about getting up to speed quickly (AC1)", () => {
    expect(presentationFor("speed").prompt.toLowerCase()).toContain(
      "up to speed"
    );
  });

  it("lists all kinds in order for the selector", () => {
    const all = allKindPresentations();
    expect(all.map((k) => k.kind)).toEqual([...LEARNING_MOMENT_KINDS]);
  });
});
