import { describe, it, expect } from "vitest";
import { buildHealth } from "./build";
import {
  EMPTY_HEALTH_INPUTS,
  HEALTH_INDICATOR_KEYS,
  type HealthInputs,
} from "./types";

function inputs(over: Partial<HealthInputs> = {}): HealthInputs {
  return { ...EMPTY_HEALTH_INPUTS, ...over };
}

function indicator(health: ReturnType<typeof buildHealth>, key: string) {
  const found = health.indicators.find((i) => i.key === key);
  if (!found) throw new Error(`no indicator ${key}`);
  return found;
}

describe("buildHealth — indicators are always the four fixed keys (AC2: no single score)", () => {
  it("returns the four indicators in order even when everything is empty", () => {
    const health = buildHealth(EMPTY_HEALTH_INPUTS);
    expect(health.indicators.map((i) => i.key)).toEqual([
      ...HEALTH_INDICATOR_KEYS,
    ]);
    expect(health.indicators.every((i) => i.count === 0)).toBe(true);
    expect(health.roleCoverage).toEqual([]);
  });

  it("every indicator carries a deep-link (AC3)", () => {
    const health = buildHealth(EMPTY_HEALTH_INPUTS);
    for (const i of health.indicators) {
      expect(i.action.href.startsWith("/dashboard")).toBe(true);
      expect(i.action.label.length).toBeGreaterThan(0);
    }
  });
});

describe("buildHealth — claim counts from lifecycle", () => {
  it("counts supported and user_confirmed as well-supported", () => {
    const health = buildHealth(
      inputs({
        claimLifecycles: ["supported", "user_confirmed", "supported"],
      })
    );
    expect(indicator(health, "well_supported").count).toBe(3);
    expect(indicator(health, "needs_verification").count).toBe(0);
  });

  it("counts draft, needs_investigation and challenged as needing verification", () => {
    const health = buildHealth(
      inputs({
        claimLifecycles: ["draft", "needs_investigation", "challenged"],
      })
    );
    expect(indicator(health, "needs_verification").count).toBe(3);
    expect(indicator(health, "well_supported").count).toBe(0);
  });

  it("does not count archived claims in either bucket", () => {
    const health = buildHealth(
      inputs({ claimLifecycles: ["archived", "supported"] })
    );
    expect(indicator(health, "well_supported").count).toBe(1);
    expect(indicator(health, "needs_verification").count).toBe(0);
  });
});

describe("buildHealth — investigations and projects pass through", () => {
  it("surfaces the investigation count and links to the queue", () => {
    const health = buildHealth(inputs({ investigationCount: 4 }));
    const ind = indicator(health, "outstanding_investigations");
    expect(ind.count).toBe(4);
    expect(ind.action.href).toBe("/dashboard/investigations");
  });

  it("surfaces projects needing evidence and links to projects", () => {
    const health = buildHealth(inputs({ projectsNeedingEvidence: 2 }));
    const ind = indicator(health, "projects_need_evidence");
    expect(ind.count).toBe(2);
    expect(ind.action.href).toBe("/dashboard/projects");
  });
});

describe("buildHealth — role coverage", () => {
  it("maps each role to a coverage row deep-linked to its gap check", () => {
    const health = buildHealth(
      inputs({
        roles: [
          {
            roleId: "role-1",
            title: "Staff Engineer",
            supported: 3,
            total: 8,
            assessed: 6,
          },
        ],
      })
    );
    expect(health.roleCoverage).toEqual([
      {
        roleId: "role-1",
        title: "Staff Engineer",
        supported: 3,
        total: 8,
        assessed: 6,
        href: "/dashboard/gap-check?role=role-1",
      },
    ]);
  });

  it("keeps an unchecked role (assessed 0), so the UI can say 'not checked yet'", () => {
    const health = buildHealth(
      inputs({
        roles: [
          {
            roleId: "role-2",
            title: "PM",
            supported: 0,
            total: 5,
            assessed: 0,
          },
        ],
      })
    );
    expect(health.roleCoverage[0].assessed).toBe(0);
    expect(health.roleCoverage[0].href).toBe(
      "/dashboard/gap-check?role=role-2"
    );
  });
});
