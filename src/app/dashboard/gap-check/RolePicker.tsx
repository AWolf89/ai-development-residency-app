"use client";

import { useRouter } from "next/navigation";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import type { TargetRoleListItem } from "@/lib/target-roles/queries";

/**
 * Switch which target role the Gap Check page shows (ADR-0012). Navigating to
 * `?role=<id>` lets the Server Component re-read and re-render for the chosen role; the
 * page validates the id against the user's own roles, so this only ever selects their own.
 */
export default function RolePicker({
  roles,
  selectedId,
}: {
  roles: TargetRoleListItem[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <FormControl size="small" sx={{ minWidth: 260 }}>
      <InputLabel id="gap-check-role-label">Target role</InputLabel>
      <Select
        labelId="gap-check-role-label"
        id="gap-check-role"
        label="Target role"
        value={selectedId}
        onChange={(event) =>
          router.push(`/dashboard/gap-check?role=${event.target.value}`)
        }
      >
        {roles.map((role) => (
          <MenuItem key={role.id} value={role.id}>
            {role.title}
            {role.company ? ` · ${role.company}` : ""}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
