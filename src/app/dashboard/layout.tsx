import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Sidebar from "@/components/Sidebar";

/**
 * Shell for all signed-in pages: the navy sidebar nav beside a cream main area.
 * Individual pages keep their own auth guards.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <Sidebar />
      <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
        {/* Spacer so content clears the fixed top bar on mobile. */}
        <Toolbar sx={{ display: { xs: "block", md: "none" } }} />
        {children}
      </Box>
    </Box>
  );
}
