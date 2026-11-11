// Accessibility page scans: axe-core checks each page against WCAG 2.2 AA rules.
// Template from the ui-accessibility skill. List every public page in PAGES.
// Pages behind login (e.g. /dashboard) need a signed-in test user — see
// references/page-scans.md — and are a planned follow-up.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const PAGES: { name: string; path: string }[] = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "signup", path: "/signup" },
];

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const pg of PAGES) {
  test(`${pg.name} has no WCAG 2.2 AA violations`, async ({
    page,
  }, testInfo) => {
    await page.goto(pg.path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_22_AA)
      .analyze();
    mkdirSync("a11y-results/axe", { recursive: true });
    writeFileSync(
      `a11y-results/axe/${testInfo.project.name}-${pg.name}.json`,
      JSON.stringify(results, null, 2)
    );
    expect(
      results.violations,
      results.violations.map((v) => `${v.id}: ${v.help}`).join("\n")
    ).toEqual([]);
  });

  test(`${pg.name} can be used with a keyboard`, async ({ page }) => {
    await page.goto(pg.path);
    // Tab through the page. Each focused element must be on screen and must LOOK different
    // when focused (outline, border, shadow, color): WCAG 2.4.7 and 2.4.11.
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return {
          key: el.outerHTML.slice(0, 100),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      });
      if (!info || seen.has(info.key)) break; // end of page, or focus wrapped around
      seen.add(info.key);
      expect(
        info.w > 0 && info.h > 0,
        `focused element is not visible: ${info.key}`
      ).toBe(true);
      const pad = 8;
      const clip = {
        x: Math.max(0, info.x - pad),
        y: Math.max(0, info.y - pad),
        width: info.w + pad * 2,
        height: info.h + pad * 2,
      };
      await page.waitForTimeout(250); // let focus transitions finish
      const focused = await page.screenshot({ clip });
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur()
      );
      await page.waitForTimeout(250);
      const blurred = await page.screenshot({ clip });
      expect(
        focused.equals(blurred),
        `no visible focus indicator: ${info.key}`
      ).toBe(false);
      // Chromium continues Tab order from the element that was just blurred.
    }
    expect(seen.size, "no focusable elements reached with Tab").toBeGreaterThan(
      0
    );
  });
}
