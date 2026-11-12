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
  tag: {
    blue: { bg: "#e3ebf4", fg: "#2f5d8c" },
    orange: { bg: "#fbe6db", fg: "#b8501f" },
    green: { bg: "#e2efe5", fg: "#2e6b3f" },
    gray: { bg: "#ecebe7", fg: "#5f6675" },
  },
} as const;

export type TagTone = keyof typeof brand.tag;
