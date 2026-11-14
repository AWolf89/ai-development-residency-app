// Wraps text from users, documents, or the database so the model can tell data from
// instructions. This REDUCES prompt injection; it does not prevent it. Never give the model
// actions with side effects based on untrusted text without a human confirmation step.
export type UntrustedTag = "context" | "user_input" | "document";

export function wrapUntrusted(tag: UntrustedTag, text: string): string {
  // Stop the text from closing the tag early (e.g. a row containing "</context>").
  const safe = text.replaceAll(`</${tag}>`, `<\\/${tag}>`);
  return `<${tag}>\n${safe}\n</${tag}>`;
}
