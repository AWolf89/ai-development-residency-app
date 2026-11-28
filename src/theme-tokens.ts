// Plain design tokens (no "use client"), so both Server and Client Components can
// import them without crossing the RSC boundary. Pulled from the Figma prototype.

export const serifStack =
  "var(--font-source-serif), Georgia, 'Times New Roman', serif";

export const brand = {
  sidebarBg: "#1d2433",
  sidebarActiveBg: "#2a3346",
  sidebarText: "#c9cdd6",
  sidebarWordmark: "#f6f3ec",
  cream: "#f6f3ec",
  hairline: "#e7e2d6",
  accent: "#d9632b",
  /**
   * Darker accent for use as TEXT, links, and active labels. The bright `accent`
   * is only ~3.3:1 against the cream canvas, below WCAG AA (1.4.3). This darker
   * terracotta meets 4.5:1 on both #ffffff (~5.7:1) and the cream canvas (~5.1:1).
   * Use `accent` for decorative fills/borders only; use `accentText` for text.
   */
  accentText: "#a94a1a",
  tag: {
    blue: { bg: "#e3ebf4", fg: "#2f5d8c" },
    orange: { bg: "#fbe6db", fg: "#b8501f" },
    green: { bg: "#e2efe5", fg: "#2e6b3f" },
    gray: { bg: "#ecebe7", fg: "#5f6675" },
  },
  /** Semantic danger (an open challenge) — the health bar's "challenged" segment. */
  danger: "#9f3b32",
} as const;

export type TagTone = keyof typeof brand.tag;
