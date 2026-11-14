import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LogSink } from "./log";

// Writes one row per model call to llm_runs as the signed-in user (row-level security
// applies). Anonymous requests are logged to the server console instead, without text,
// because the table is per-user.
export const supabaseSink: LogSink = async (row) => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    console.info(
      "llm_run (anonymous)",
      JSON.stringify({ ...row, input_text: undefined, output_text: undefined })
    );
    return;
  }
  const { error } = await supabase
    .from("llm_runs")
    .insert({ ...row, user_id: userId });
  if (error) throw new Error(`llm_runs insert failed: ${error.message}`);
};
