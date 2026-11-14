import { describe, it, expect } from "vitest";
import {
  buildRequirementsFromOccupation,
  rankOccupationSuggestions,
  extractFrameworkRoleSkills,
  parseRoleAliases,
  rankFrameworkRoles,
  parseSpecializationTasks,
  parseRelatedRoleSlugs,
  parseSpecializationAliases,
  extractSpecializationRequirements,
  rankSpecializations,
  type OccupationAttribute,
  type OccupationSuggestion,
  type FrameworkRoleCandidate,
  type SpecializationCandidate,
} from "./occupation";

describe("buildRequirementsFromOccupation", () => {
  const attrs: OccupationAttribute[] = [
    { name: "Programming", importance: 4.5 },
    { name: "Critical Thinking", importance: 4.0 },
    { name: "English Language", importance: 3.0 },
  ];

  it("ranks by importance, descending (AC1)", () => {
    expect(buildRequirementsFromOccupation(attrs)).toEqual([
      "Programming",
      "Critical Thinking",
      "English Language",
    ]);
  });

  it("de-duplicates by name, keeping the highest importance", () => {
    const withDupe: OccupationAttribute[] = [
      { name: "Programming", importance: 2.0 },
      { name: "Programming", importance: 4.8 },
      { name: "Critical Thinking", importance: 4.0 },
    ];
    const result = buildRequirementsFromOccupation(withDupe);
    // The higher-rated "Programming" (4.8) outranks "Critical Thinking" (4.0),
    // and the duplicate is collapsed to one entry.
    expect(result).toEqual(["Programming", "Critical Thinking"]);
  });

  it("collapses case-insensitive duplicates to one entry", () => {
    const result = buildRequirementsFromOccupation([
      { name: "Programming", importance: 2.0 },
      { name: "programming", importance: 4.8 },
    ]);
    expect(result).toHaveLength(1);
  });

  it("drops blank names", () => {
    const result = buildRequirementsFromOccupation([
      { name: "   ", importance: 5 },
      { name: "Programming", importance: 4 },
    ]);
    expect(result).toEqual(["Programming"]);
  });

  it("caps the list at the limit, keeping the most important", () => {
    const many: OccupationAttribute[] = Array.from({ length: 20 }, (_, i) => ({
      name: `Skill ${String(i).padStart(2, "0")}`,
      importance: i,
    }));
    const result = buildRequirementsFromOccupation(many, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe("Skill 19");
  });

  it("orders ties by name for a stable result", () => {
    const ties: OccupationAttribute[] = [
      { name: "Beta", importance: 3 },
      { name: "Alpha", importance: 3 },
    ];
    expect(buildRequirementsFromOccupation(ties)).toEqual(["Alpha", "Beta"]);
  });

  it("returns an empty list for no attributes", () => {
    expect(buildRequirementsFromOccupation([])).toEqual([]);
  });
});

describe("rankOccupationSuggestions", () => {
  const candidates: OccupationSuggestion[] = [
    {
      id: "1",
      name: "Software Developers",
      code: "15-1252.00",
      source: "onet",
    },
    { id: "2", name: "Web Developers", code: "15-1254.00", source: "onet" },
    {
      id: "3",
      name: "Software Quality Assurance Analysts",
      code: "15-1253.00",
      source: "onet",
    },
    {
      id: "4",
      name: "Database Administrators",
      code: "15-1242.00",
      source: "onet",
    },
  ];

  it("puts prefix matches before contains-matches (AC2)", () => {
    const result = rankOccupationSuggestions("soft", candidates);
    expect(result.map((r) => r.id)).toEqual(["1", "3"]);
    // "Software …" start-matches come before none; "Microsoft" style contains
    // would follow. Here only the two Software* titles match.
  });

  it("includes contains-matches after prefix-matches", () => {
    const result = rankOccupationSuggestions("develop", candidates);
    // None start with "develop"; two contain it.
    expect(result.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("is case-insensitive", () => {
    expect(
      rankOccupationSuggestions("WEB", candidates).map((r) => r.id)
    ).toEqual(["2"]);
  });

  it("drops non-matches", () => {
    expect(rankOccupationSuggestions("nurse", candidates)).toEqual([]);
  });

  it("returns nothing for a blank prefix", () => {
    expect(rankOccupationSuggestions("   ", candidates)).toEqual([]);
  });

  it("caps the result at the limit", () => {
    const result = rankOccupationSuggestions("s", candidates, 1);
    expect(result).toHaveLength(1);
  });
});

describe("extractFrameworkRoleSkills", () => {
  it("prefers 'Skills Required for the Role' when present (AC1)", () => {
    const payload = {
      "Skills Required for the Role": [
        { slug: "interaction-design", label: "Interaction Design" },
        { slug: "prototyping", label: "Prototyping" },
      ],
      "Foundational Skills": [{ label: "Should not be used" }],
      Skills: [{ label: "Also not used" }],
    };
    expect(extractFrameworkRoleSkills(payload)).toEqual([
      "Interaction Design",
      "Prototyping",
    ]);
  });

  it("falls back to 'Foundational Skills', then 'Skills'", () => {
    expect(
      extractFrameworkRoleSkills({
        "Foundational Skills": [{ label: "Research" }],
      })
    ).toEqual(["Research"]);
    expect(extractFrameworkRoleSkills({ Skills: ["Typography"] })).toEqual([
      "Typography",
    ]);
  });

  it("accepts string entries, de-dupes, and caps", () => {
    const payload = { Skills: ["Prototyping", "prototyping", "Typography"] };
    expect(extractFrameworkRoleSkills(payload, 2)).toEqual([
      "Prototyping",
      "Typography",
    ]);
  });

  it("returns an empty list when no skills field is present", () => {
    expect(extractFrameworkRoleSkills({ id: 1 })).toEqual([]);
  });
});

describe("parseRoleAliases", () => {
  it("splits the comma-separated alias string (AC2)", () => {
    const payload = {
      "Other Job Titles You May See in the World":
        "Product Designer, Interaction Designer, UI/UX Designer",
    };
    expect(parseRoleAliases(payload)).toEqual([
      "Product Designer",
      "Interaction Designer",
      "UI/UX Designer",
    ]);
  });

  it("returns an empty list when the field is missing", () => {
    expect(parseRoleAliases({})).toEqual([]);
  });
});

describe("rankFrameworkRoles", () => {
  const roles: FrameworkRoleCandidate[] = [
    {
      id: "jf-1",
      name: "UX Designer",
      code: "ux-designer",
      aliases: ["Product Designer", "UI/UX Designer", "Experience Designer"],
    },
    {
      id: "jf-2",
      name: "Product Manager",
      code: "product-manager",
      aliases: ["PM"],
    },
    {
      id: "jf-3",
      name: "Back-end Developer",
      code: "backend-developer",
      aliases: [],
    },
  ];

  it("matches on the role name prefix and tags source=framework (AC3)", () => {
    const result = rankFrameworkRoles("ux", roles);
    expect(result).toEqual([
      {
        id: "jf-1",
        name: "UX Designer",
        code: "ux-designer",
        source: "framework",
      },
    ]);
  });

  it("matches on an alias when the name doesn't match", () => {
    // "experience" appears only in UX Designer's aliases.
    const result = rankFrameworkRoles("experience", roles);
    expect(result.map((r) => r.id)).toEqual(["jf-1"]);
  });

  it("orders name-prefix matches before alias/contains matches", () => {
    // "product" starts "Product Manager" (name) and is inside UX Designer's alias.
    const result = rankFrameworkRoles("product", roles);
    expect(result.map((r) => r.id)).toEqual(["jf-2", "jf-1"]);
  });

  it("returns nothing for a blank prefix or no match", () => {
    expect(rankFrameworkRoles("   ", roles)).toEqual([]);
    expect(rankFrameworkRoles("nurse", roles)).toEqual([]);
  });
});

// --- Specializations --------------------------------------------------------

describe("parseSpecializationTasks", () => {
  it("reads task labels, de-duplicates, and trims", () => {
    const payload = {
      "Specialization Tasks": [
        { slug: "card-sorting", label: "Card Sorting " },
        { slug: "interviewing", label: "Interviewing" },
        { slug: "card-sorting-2", label: "card sorting" },
      ],
    };
    expect(parseSpecializationTasks(payload)).toEqual([
      "Card Sorting",
      "Interviewing",
    ]);
  });

  it("returns an empty list when the field is missing or not an array", () => {
    expect(parseSpecializationTasks({})).toEqual([]);
    expect(
      parseSpecializationTasks({ "Specialization Tasks": "nope" })
    ).toEqual([]);
  });
});

describe("parseRelatedRoleSlugs", () => {
  it("reads related job-function slugs and de-duplicates", () => {
    const payload = {
      "Related Tech Fleet Positions": [
        { slug: "ux-researcher", label: "UX Researcher" },
        { slug: "product-designer", label: "Product Designer" },
        { slug: "ux-researcher", label: "dupe" },
      ],
    };
    expect(parseRelatedRoleSlugs(payload)).toEqual([
      "ux-researcher",
      "product-designer",
    ]);
  });

  it("returns an empty list when the field is missing or empty", () => {
    expect(parseRelatedRoleSlugs({})).toEqual([]);
    expect(
      parseRelatedRoleSlugs({ "Related Tech Fleet Positions": [] })
    ).toEqual([]);
  });
});

describe("parseSpecializationAliases", () => {
  it("combines related-position labels and the free-text Roles field", () => {
    const payload = {
      "Related Tech Fleet Positions": [
        { slug: "ux-researcher", label: "UX Researcher" },
      ],
      Roles: "UX (User Experience) Researcher",
    };
    expect(parseSpecializationAliases(payload)).toEqual([
      "UX Researcher",
      "UX (User Experience) Researcher",
    ]);
  });

  it("returns an empty list when no alias source is present", () => {
    expect(parseSpecializationAliases({})).toEqual([]);
  });
});

describe("extractSpecializationRequirements", () => {
  const payload = {
    "Specialization Tasks": [
      { label: "Card Sorting" },
      { label: "Interviewing" },
    ],
  };

  it("lists tasks first, then related-role skills, and de-duplicates", () => {
    const result = extractSpecializationRequirements(payload, [
      "Interviewing", // duplicate of a task — collapsed
      "Prototyping",
    ]);
    expect(result).toEqual(["Card Sorting", "Interviewing", "Prototyping"]);
  });

  it("falls back to related-role skills when there are no tasks", () => {
    expect(
      extractSpecializationRequirements({}, ["User Research", "Facilitation"])
    ).toEqual(["User Research", "Facilitation"]);
  });

  it("returns an empty list when neither source has data", () => {
    expect(extractSpecializationRequirements({}, [])).toEqual([]);
  });

  it("caps the combined list at the limit, tasks taking priority", () => {
    const result = extractSpecializationRequirements(
      payload,
      ["Prototyping", "Research"],
      2
    );
    expect(result).toEqual(["Card Sorting", "Interviewing"]);
  });
});

describe("rankSpecializations", () => {
  const specs: SpecializationCandidate[] = [
    {
      id: "sp-1",
      name: "Qualitative UX Research",
      code: "qualitative-ux-research",
      aliases: ["UX Researcher", "UX (User Experience) Researcher"],
    },
    {
      id: "sp-2",
      name: "Back-end Developer",
      code: "back-end-developer",
      aliases: [],
    },
    {
      id: "sp-3",
      name: "Growth Product Management",
      code: "growth-product-management",
      aliases: ["Product Manager"],
    },
  ];

  it("matches on the specialization name prefix and tags source=specialization", () => {
    const result = rankSpecializations("qualitative", specs);
    expect(result).toEqual([
      {
        id: "sp-1",
        name: "Qualitative UX Research",
        code: "qualitative-ux-research",
        source: "specialization",
      },
    ]);
  });

  it("matches on an alias when the name doesn't match", () => {
    // "researcher" appears only in sp-1's aliases.
    expect(rankSpecializations("researcher", specs).map((r) => r.id)).toEqual([
      "sp-1",
    ]);
  });

  it("orders name-prefix matches before alias/contains matches", () => {
    // "product" starts no name, but is inside sp-3's name and sp-3's alias.
    // "growth" starts sp-3's name.
    const result = rankSpecializations("product", specs);
    expect(result.map((r) => r.id)).toEqual(["sp-3"]);
  });

  it("returns nothing for a blank prefix or no match", () => {
    expect(rankSpecializations("   ", specs)).toEqual([]);
    expect(rankSpecializations("nurse", specs)).toEqual([]);
  });
});
