"use client";

import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

export type ProjectOption = { id: string; name: string };

/**
 * A reusable project picker (ADR-0019): "No project" plus the user's projects.
 * Controlled, so it works inside any form (the file hub, the decision-record and
 * learning-moment forms). The empty value means "no project".
 */
export default function ProjectPicker({
  projects,
  value,
  onChange,
  label = "Project",
  disabled,
}: {
  projects: ProjectOption[];
  value: string;
  onChange: (projectId: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const labelId = "project-picker-label";
  return (
    <FormControl fullWidth disabled={disabled}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <MenuItem value="">
          <em>No project</em>
        </MenuItem>
        {projects.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
