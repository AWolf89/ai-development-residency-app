// Pure navigation model for the signed-in shell (no "use client", no React), so the
// section list and the active-state logic are unit-tested in isolation (CLAUDE.md §3,
// Humble Object). The Sidebar component is the thin boundary that renders this.
//
// ADR-0027 (four-section IA): the shell has exactly four primary sections. Secondary
// destinations are not separate sidebar items — each belongs to the section that owns
// its route, so the correct section stays highlighted on those sub-pages until the
// Evidence Library / Career Profile hubs land and host them as tabs. Every existing
// route keeps working; this is nav chrome, not a route move.

export type NavSection = {
  /** Visible label and primary click destination. */
  label: string;
  href: string;
  /**
   * Route prefixes this section claims for active-state highlighting. A path matches a
   * prefix when it equals it or sits beneath it (`/prefix/...`). The section owning the
   * longest matching prefix wins, so `/dashboard/projects` resolves to Evidence Library
   * rather than to Career Profile's shorter `/dashboard`.
   */
  owns: readonly string[];
};

/** The four primary sections, in sidebar order (ADR-0027). */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: "Guided Flow",
    href: "/dashboard/flow",
    owns: ["/dashboard/flow", "/dashboard/interview"],
  },
  {
    label: "Evidence Library",
    href: "/dashboard/projects",
    owns: [
      "/dashboard/projects",
      "/dashboard/claims",
      "/dashboard/learning-moments",
      "/dashboard/files",
      "/dashboard/decision-records",
    ],
  },
  {
    label: "Career Profile",
    href: "/dashboard",
    owns: ["/dashboard", "/dashboard/target-roles", "/dashboard/gap-check"],
  },
  {
    label: "Investigations",
    href: "/dashboard/investigations",
    owns: ["/dashboard/investigations"],
  },
] as const;

/** True when `pathname` is exactly `prefix` or a descendant of it. */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The active section is the one owning the longest route prefix that matches `pathname`,
 * or `null` when no section owns the path (e.g. `/login`). Longest-match ensures a
 * section's own sub-routes beat Career Profile's broad `/dashboard` prefix.
 */
export function resolveActiveSection(
  pathname: string,
  sections: readonly NavSection[] = NAV_SECTIONS
): NavSection | null {
  let best: { section: NavSection; length: number } | null = null;
  for (const section of sections) {
    for (const owned of section.owns) {
      if (
        matchesPrefix(pathname, owned) &&
        (!best || owned.length > best.length)
      ) {
        best = { section, length: owned.length };
      }
    }
  }
  return best?.section ?? null;
}
