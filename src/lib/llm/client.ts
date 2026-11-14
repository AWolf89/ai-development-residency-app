import "server-only"; // build fails if a browser component imports this file
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { LLM_CONFIG, type ModelPurpose } from "./config";

function requireKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env.local (and to Vercel for production)."
    );
  }
  return key;
}

// The ONLY place that constructs an OpenRouter model. Thin and logic-free (Humble Object):
// it wires the key, privacy routing, fallback list, and attribution headers, nothing more.
// A fake `fetch` can be injected so the gateway is tested with no key and no network.
export function getModel(
  purpose: ModelPurpose,
  opts: { userId?: string; fetch?: typeof fetch } = {}
) {
  const [primary, ...fallbacks] = LLM_CONFIG.models[purpose];
  const openrouter = createOpenRouter({
    apiKey: requireKey(),
    baseURL: process.env.OPENROUTER_BASE_URL, // unset = OpenRouter; set only to point tests at a fake server
    compatibility: "strict",
    headers: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-OpenRouter-Title": "Career Evidence Agent",
    },
    fetch: opts.fetch,
  });
  return openrouter.chat(primary, {
    models: fallbacks.length ? [primary, ...fallbacks] : undefined,
    provider: LLM_CONFIG.provider,
    usage: { include: true },
    user: opts.userId, // hashed or internal id only, never an email
  });
}
