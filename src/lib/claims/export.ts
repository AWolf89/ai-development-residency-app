/**
 * Pure serializers that export a user's claims as JSON or Markdown (ADR-0015). The data is
 * the user's own; the route that calls these runs server-side under their session and streams
 * the result straight back to them — nothing leaves the system (ADR-0007). No Supabase, no
 * React, so the serializers are unit-tested with plain inputs.
 */
import { statusDisplay, categoryLabel } from "./presentation";
import type { Claim } from "./types";

/** One claim, flattened to the fields worth keeping in an export. */
function toExportShape(claim: Claim) {
  return {
    title: claim.title,
    decision: claim.decision,
    category: claim.category,
    status: claim.status,
    statusLabel: statusDisplay(claim.status).label,
    sourceCount: claim.sourceCount,
    isMetric: claim.isMetric,
    versions: claim.history.length,
    usedInInterview: claim.usage.fromInterview,
    gapCheckMatches: claim.usage.requirementMatches,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  };
}

/** Export the claims as a pretty-printed JSON document. */
export function toJson(claims: Claim[], now: Date = new Date()): string {
  return JSON.stringify(
    {
      exportedAt: now.toISOString(),
      claimCount: claims.length,
      claims: claims.map(toExportShape),
    },
    null,
    2
  );
}

/** Export the claims as a readable Markdown document. */
export function toMarkdown(claims: Claim[], now: Date = new Date()): string {
  const lines: string[] = [
    "# Evidence profile",
    "",
    `_Exported ${now.toLocaleDateString()} · ${claims.length} claim${claims.length === 1 ? "" : "s"}_`,
    "",
  ];
  if (claims.length === 0) {
    lines.push("No claims yet.");
    return lines.join("\n");
  }
  for (const claim of claims) {
    const facet = claim.category ? categoryLabel(claim.category) : "Unfiled";
    lines.push(`## ${claim.title}`);
    lines.push("");
    lines.push(`- **Status:** ${statusDisplay(claim.status).label}`);
    lines.push(`- **Facet:** ${facet}`);
    lines.push(
      `- **Sources:** ${claim.sourceCount} file${claim.sourceCount === 1 ? "" : "s"}`
    );
    if (claim.decision) {
      lines.push(`- **Decision:** ${claim.decision}`);
    }
    const usages: string[] = [];
    if (claim.usage.fromInterview) {
      usages.push("interview");
    }
    if (claim.usage.requirementMatches > 0) {
      usages.push(`${claim.usage.requirementMatches} gap-check match(es)`);
    }
    if (usages.length > 0) {
      lines.push(`- **Used in:** ${usages.join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
