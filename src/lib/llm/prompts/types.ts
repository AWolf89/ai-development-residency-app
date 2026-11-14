// A prompt is a versioned file, never inline (R3 clean-architecture). Every run log stores
// `id` + `version`, so wording changes can be compared, reviewed, and rolled back.
export type PromptPurpose = "chat" | "extract";

export type PromptDef<I> = {
  /** kebab-case, stable forever. */
  id: string;
  /** semver: bump on ANY wording change (patch=typo, minor=may change output, major=new task/shape). */
  version: string;
  purpose: PromptPurpose;
  /** System prompt. No secrets, keys, or internal URLs (OWASP LLM07). */
  system: string;
  /** Pure: turns typed input into the user-turn text (untrusted parts already wrapped). */
  render: (input: I) => string;
};
