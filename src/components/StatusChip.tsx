import Box from "@mui/material/Box";
import { brand, type TagTone } from "@/theme-tokens";

/**
 * A soft pill tag matching the prototype's Tag/{Blue,Orange,Green,Gray}. Plain
 * markup (no MUI Chip palette) so the tints are exact. Server-safe.
 */
export default function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: TagTone;
}) {
  const { bg, fg } = brand.tag[tone];
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        backgroundColor: bg,
        color: fg,
        borderRadius: 999,
        px: 1.25,
        py: 0.5,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Box>
  );
}
