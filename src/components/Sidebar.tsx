"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import MenuIcon from "@mui/icons-material/Menu";
import { brand, serifStack } from "@/theme-tokens";
import { NAV_SECTIONS, resolveActiveSection } from "@/lib/nav/sections";

const DRAWER_WIDTH = 248;

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeSection = resolveActiveSection(pathname);

  return (
    <Box
      sx={{
        bgcolor: brand.sidebarBg,
        color: brand.sidebarText,
        height: "100%",
        px: 3,
        py: 4,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Typography
        component="p"
        sx={{
          fontFamily: serifStack,
          fontSize: 22,
          lineHeight: 1.45,
          color: brand.sidebarWordmark,
          mb: 2,
        }}
      >
        Career Evidence Agent
      </Typography>

      <List
        disablePadding
        sx={{ display: "flex", flexDirection: "column", gap: 1 }}
      >
        {NAV_SECTIONS.map((item) => {
          const active = item.label === activeSection?.label;

          return (
            <ListItem key={item.label} disablePadding>
              <ListItemButton
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                sx={{
                  px: "14px",
                  py: "12px",
                  borderRadius: 2,
                  fontSize: 15,
                  color: active ? "#fff" : brand.sidebarText,
                  fontWeight: active ? 600 : 400,
                  bgcolor: active ? brand.sidebarActiveBg : "transparent",
                  borderLeft: active
                    ? `4px solid ${brand.accent}`
                    : "4px solid transparent",
                  "&:hover": {
                    bgcolor: active
                      ? brand.sidebarActiveBg
                      : "rgba(255,255,255,0.06)",
                  },
                }}
              >
                {item.label}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Box
        component="a"
        href="/dashboard/about"
        onClick={onNavigate}
        sx={{
          mt: "auto",
          pt: 3,
          px: "14px",
          fontSize: 13,
          color: brand.sidebarText,
          opacity: 0.7,
          textDecoration: "none",
          "&:hover": { opacity: 1, textDecoration: "underline" },
        }}
      >
        Data &amp; attributions
      </Box>
    </Box>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar with a menu button */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { xs: "flex", md: "none" },
          bgcolor: brand.sidebarBg,
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            edge="start"
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
            sx={{ color: brand.sidebarWordmark }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            sx={{
              fontFamily: serifStack,
              fontSize: 18,
              color: brand.sidebarWordmark,
            }}
          >
            Career Evidence Agent
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Permanent sidebar on desktop */}
      <Box
        component="nav"
        aria-label="Primary"
        sx={{
          display: { xs: "none", md: "block" },
          width: DRAWER_WIDTH,
          flexShrink: 0,
        }}
      >
        <Drawer
          variant="permanent"
          open
          sx={{
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              border: "none",
            },
          }}
        >
          <NavContent />
        </Drawer>
      </Box>

      {/* Temporary drawer on mobile */}
      <Drawer
        variant="temporary"
        open={open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        <NavContent onNavigate={() => setOpen(false)} />
      </Drawer>
    </>
  );
}
