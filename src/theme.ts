"use client";

import { createTheme } from "@mui/material/styles";

// Career Evidence Agent base theme.
// Keep design tokens here so components stay consistent across the app.
const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#3949ab", // indigo — professional, trustworthy
    },
    secondary: {
      main: "#00897b", // teal accent
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
});

export default theme;
