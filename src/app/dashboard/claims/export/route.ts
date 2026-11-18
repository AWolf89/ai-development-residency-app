/**
 * Export the signed-in user's evidence profile as a download (ADR-0015). A GET route handler
 * so a plain link can trigger the download. The claims are read server-side under the user's own
 * session (RLS) and streamed straight back to them — nothing is sent to any third party
 * (ADR-0007). Serialization is the pure `export.ts`; this handler is the humble boundary.
 */
import { createClient } from "@/lib/supabase/server";
import { getClaims } from "@/lib/claims/queries";
import { toJson, toMarkdown } from "@/lib/claims/export";

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const format =
    new URL(request.url).searchParams.get("format") === "json" ? "json" : "md";
  const claims = await getClaims(supabase, user.id);

  const body = format === "json" ? toJson(claims) : toMarkdown(claims);
  const contentType = format === "json" ? "application/json" : "text/markdown";
  const filename = `evidence-profile.${format === "json" ? "json" : "md"}`;

  return new Response(body, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
