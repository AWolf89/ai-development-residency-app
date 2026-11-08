/**
 * Pure, dependency-free validation for auth credentials.
 *
 * Kept separate from the Server Actions (Humble Object pattern) so it can be
 * unit-tested with plain inputs and no network or framework involved.
 */

export type Credentials = {
  email: string;
  password: string;
};

export type ValidationResult =
  { ok: true; value: Credentials } | { ok: false; error: string };

/** Minimum password length Supabase accepts by default. */
export const MIN_PASSWORD_LENGTH = 6;

// A deliberately simple shape check: "something @ something . something".
// Supabase does the authoritative validation; this only catches obvious typos
// before a round-trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(
  email: unknown,
  password: unknown
): ValidationResult {
  if (typeof email !== "string" || email.trim() === "") {
    return { ok: false, error: "Enter your email address." };
  }
  if (typeof password !== "string" || password === "") {
    return { ok: false, error: "Enter your password." };
  }

  const trimmedEmail = email.trim();

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  return { ok: true, value: { email: trimmedEmail, password } };
}
