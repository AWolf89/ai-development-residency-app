import "server-only";
import { runLLM } from "@/lib/llm/run";
import { supabaseSink } from "@/lib/llm/supabase-sink";
import { imageDescription } from "@/lib/llm/prompts/image-description";

// The vision read boundary (Humble Object, ADR-0020). Sends an image's bytes through the model
// gateway as a multimodal turn and returns a plain-text description to store as the file's text.
// Thin and logic-free: caps, privacy routing, and run logging all live in the gateway (ADR-0009).
// The caller runs it best-effort, so a vision failure degrades to "no text", never a crash.

/** Describe an image file (PNG/JPEG) as searchable text. Returns "" if the model produced none. */
export async function describeImage(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string
): Promise<string> {
  const { text } = await runLLM({
    prompt: imageDescription,
    input: { fileName },
    images: [{ data: bytes, mediaType: mimeType }],
    sink: supabaseSink,
  });
  return text.trim();
}
