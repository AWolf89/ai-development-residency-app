"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

/**
 * The "Export" control on the evidence profile (ADR-0015). Opens a small menu to download the
 * user's claims as Markdown or JSON. Each item is a link to the export route handler, which
 * generates the file server-side from the user's own rows (no third party; ADR-0007).
 */
export default function ExportButton() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <Button
        variant="outlined"
        aria-haspopup="menu"
        aria-expanded={open ? "true" : undefined}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        Export
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        <MenuItem
          component="a"
          href="/dashboard/claims/export?format=md"
          onClick={() => setAnchorEl(null)}
        >
          Markdown (.md)
        </MenuItem>
        <MenuItem
          component="a"
          href="/dashboard/claims/export?format=json"
          onClick={() => setAnchorEl(null)}
        >
          JSON (.json)
        </MenuItem>
      </Menu>
    </>
  );
}
