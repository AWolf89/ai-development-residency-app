"use client";

import { createTheme } from "@mui/material/styles";

// Career Evidence Agent base theme.
// Keep design tokens here so components stay consistent across the app.

// A clear keyboard-focus outline (WCAG 2.4.7 Focus Visible), drawn in the brand indigo.
const focusRing = { outline: "3px solid #3949ab", outlineOffset: "2px" };

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#3949ab", // indigo — professional, trustworthy
    },
    secondary: {
      main: "#00897b", // teal accent
    },
    error: {
      main: "#c62828", // darker, accessible red for error text (WCAG 1.4.3 Contrast)
    },
    background: {
      default: "#f7f8fc",
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
  },
  components: {
    // MUI's default keyboard focus is a faint ripple; add a clear outline (WCAG 2.4.7).
    MuiButtonBase: {
      styleOverrides: { root: { "&.Mui-focusVisible": focusRing } },
    },
    // MUI's default outlined-input border (~1.7:1 on white) is too faint; UI parts need 3:1 (WCAG 1.4.11).
    MuiOutlinedInput: {
      styleOverrides: { notchedOutline: { borderColor: "#767676" } },
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
