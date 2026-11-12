import { describe, it, expect } from "vitest";
import { mapTargetRoleRow, mapRequirementRow } from "./mappers";
import type { TargetRoleIntakeInput } from "./validation";

const userId = "11111111-1111-1111-1111-111111111111";
const intake: TargetRoleIntakeInput = {
  title: "Data Engineer",
  jobDescription:
    "A fairly long job description that passes validation length.",
  requirements: ["SQL", "Teamwork"],
};

describe("mapTargetRoleRow", () => {
  it("maps the intake to a target_roles row with a null company", () => {
    expect(mapTargetRoleRow(intake, userId)).toEqual({
      user_id: userId,
      title: "Data Engineer",
      company: null,
      job_description: intake.jobDescription,
      source_occupation_title: null,
      source_occupation_code: null,
    });
  });

  it("records the source occupation when the title path supplies one", () => {
    const row = mapTargetRoleRow(intake, userId, {
      title: "Software Developers",
      code: "15-1252.00",
    });
    expect(row.source_occupation_title).toBe("Software Developers");
    expect(row.source_occupation_code).toBe("15-1252.00");
  });
});

describe("mapRequirementRow", () => {
  it("maps a framework-matched requirement with its reference id", () => {
    expect(
      mapRequirementRow({
        userId,
        targetRoleId: "role-1",
        text: "SQL experience",
        resolved: { source: "framework", referenceItemId: "sql" },
      })
    ).toEqual({
      user_id: userId,
      target_role_id: "role-1",
      requirement_text: "SQL experience",
      source: "framework",
      reference_item_id: "sql",
    });
  });

  it("maps an unmatched requirement with a null reference id", () => {
    const row = mapRequirementRow({
      userId,
      targetRoleId: "role-1",
      text: "Culture fit",
      resolved: { source: "job_description", referenceItemId: null },
    });
    expect(row.source).toBe("job_description");
    expect(row.reference_item_id).toBeNull();
  });
});
