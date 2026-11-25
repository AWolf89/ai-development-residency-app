// Pure model for the Evidence Library's secondary tabs (no "use client", no React), so
// the tab list and active-tab logic are unit-tested in isolation (CLAUDE.md §3).
//
// ADR-0027: the Evidence Library section groups Projects, Claims, Learning moments and
// Sources as in-page tabs. Each tab is one of the existing routes — nothing is moved, so
// every route keeps working and stays deep-linkable; the tabs are shared chrome rendered
// above each page. The EvidenceLibraryTabs component is the thin boundary over this.

export type LibraryTab = {
  /** Visible tab label and its route. */
  label: string;
  href: string;
  /**
   * Route prefixes this tab claims for active-state highlighting (same longest-prefix
   * rule as the sidebar sections). A decision-record page highlights Claims, since a
   * claim is a projection over decision records (ADR-0015/0022).
   */
  owns: readonly string[];
};

/** The four Evidence Library tabs, in order (ADR-0027). */
export const LIBRARY_TABS: readonly LibraryTab[] = [
  {
    label: "Projects",
    href: "/dashboard/projects",
    owns: ["/dashboard/projects"],
  },
  {
    label: "Claims",
    href: "/dashboard/claims",
    owns: ["/dashboard/claims", "/dashboard/decision-records"],
  },
  {
    label: "Learning moments",
    href: "/dashboard/learning-moments",
    owns: ["/dashboard/learning-moments"],
  },
  { label: "Sources", href: "/dashboard/files", owns: ["/dashboard/files"] },
] as const;

/** True when `pathname` is exactly `prefix` or a descendant of it. */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The active tab is the one owning the longest route prefix that matches `pathname`, or
 * `null` when the path is outside the Evidence Library (so the bar renders no active tab).
 */
export function resolveActiveTab(
  pathname: string,
  tabs: readonly LibraryTab[] = LIBRARY_TABS
): LibraryTab | null {
  let best: { tab: LibraryTab; length: number } | null = null;
  for (const tab of tabs) {
    for (const owned of tab.owns) {
      if (
        matchesPrefix(pathname, owned) &&
        (!best || owned.length > best.length)
      ) {
        best = { tab, length: owned.length };
      }
    }
  }
  return best?.tab ?? null;
}
