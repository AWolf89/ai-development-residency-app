"use client";

import { createTheme } from "@mui/material/styles";
import LinkBehaviour from "@/components/LinkBehaviour";
import { brand, serifStack as serif } from "@/theme-tokens";

// Career Evidence Agent theme — matches the Figma prototype's editorial look:
// warm cream canvas, navy sidebar, terracotta primary, serif headings.
// Exact tokens pulled from the prototype's component library.

// A clear keyboard-focus outline (WCAG 2.4.7), drawn in the brand terracotta.
const focusRing = { outline: "3px solid #d9632b", outlineOffset: "2px" };

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#d9632b", // terracotta
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#2f5d8c", // the prototype's link/ghost blue
    },
    error: {
      main: "#c62828", // accessible red kept for form error text (WCAG 1.4.3)
    },
    background: {
      default: brand.cream,
      paper: "#ffffff",
    },
    text: {
      primary: "#1d2433",
      secondary: "#5f6675",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: "var(--font-inter), system-ui, sans-serif",
    h1: { fontFamily: serif, fontWeight: 400, lineHeight: 1.2 },
    h2: { fontFamily: serif, fontWeight: 400, lineHeight: 1.2 },
    h3: { fontFamily: serif, fontWeight: 400, lineHeight: 1.2 },
    h4: {
      fontFamily: serif,
      fontWeight: 400,
      fontSize: "2.25rem",
      lineHeight: 1.2,
    },
    h5: { fontFamily: serif, fontWeight: 600 },
    h6: { fontFamily: serif, fontWeight: 600 },
  },
  components: {
    // Route MUI links/buttons through the Next.js router (see LinkBehaviour).
    MuiLink: {
      defaultProps: { component: LinkBehaviour },
      styleOverrides: { root: { color: "#2f5d8c" } },
    },
    MuiButtonBase: {
      defaultProps: { LinkComponent: LinkBehaviour },
      styleOverrides: { root: { "&.Mui-focusVisible": focusRing } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 8,
          fontWeight: 600,
          paddingInline: 20,
          paddingBlock: 10,
        },
        // The prototype's #d9632b gives white text only ~3.6:1; darken the filled
        // button background to meet WCAG AA (4.5:1) while keeping the brand hue.
        contained: {
          backgroundColor: "#c2561f",
          "&:hover": { backgroundColor: "#a94a1a" },
        },
        outlined: {
          backgroundColor: "#ffffff",
          borderColor: "#c9c3b4",
          color: "#1d2433",
          "&:hover": { borderColor: "#1d2433", backgroundColor: "#ffffff" },
        },
        text: { color: "#2f5d8c" },
      },
    },
    // MUI's default outlined-input border is too faint; UI parts need 3:1 (WCAG 1.4.11).
    MuiOutlinedInput: {
      styleOverrides: { notchedOutline: { borderColor: "#767676" } },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: {
          borderColor: brand.hairline,
          borderRadius: 12,
          boxShadow: "0 1px 2px rgba(29, 36, 51, 0.04)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 600 },
      },
    },
    // Visible focus for links and other focusable elements.
    MuiCssBaseline: {
      styleOverrides: {
        "a:focus-visible, [tabindex]:focus-visible": focusRing,
      },
    },
  },
});

export default theme;
