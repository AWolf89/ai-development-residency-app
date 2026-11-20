import { describe, it, expect } from "vitest";
import { imageDescription } from "./prompts/image-description";

describe("image-description prompt", () => {
  it("is a versioned extract prompt with a stable id", () => {
    expect(imageDescription.id).toBe("image-description");
    expect(imageDescription.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(imageDescription.purpose).toBe("extract");
  });

  it("states the faithful-transcription and no-invention rules", () => {
    const s = imageDescription.system.toLowerCase();
    expect(s).toContain("transcribe");
    expect(s).toContain("only"); // only what is visible
    expect(s).toMatch(/never invent|do not follow|instructions/); // no fabrication / injection
  });

  it("names the file in the user turn", () => {
    expect(imageDescription.render({ fileName: "journey-map.png" })).toContain(
      "journey-map.png"
    );
  });
});
