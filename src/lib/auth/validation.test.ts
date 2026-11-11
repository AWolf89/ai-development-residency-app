import { describe, it, expect } from "vitest";
import { validateCredentials, MIN_PASSWORD_LENGTH } from "./validation";

// Pure-logic unit tests (Humble Object): no network, no framework, canned inputs.
// Covers every branch of validateCredentials.
describe("validateCredentials", () => {
  const validEmail = "user@example.com";
  const validPassword = "a".repeat(MIN_PASSWORD_LENGTH);

  it("accepts a well-formed email and long-enough password", () => {
    const result = validateCredentials(validEmail, validPassword);
    expect(result).toEqual({
      ok: true,
      value: { email: validEmail, password: validPassword },
    });
  });

  it("trims surrounding whitespace from the email", () => {
    const result = validateCredentials(`  ${validEmail}  `, validPassword);
    expect(result).toEqual({
      ok: true,
      value: { email: validEmail, password: validPassword },
    });
  });

  it("rejects a non-string email", () => {
    const result = validateCredentials(undefined, validPassword);
    expect(result).toEqual({ ok: false, error: "Enter your email address." });
  });

  it("rejects an empty / whitespace-only email", () => {
    const result = validateCredentials("   ", validPassword);
    expect(result).toEqual({ ok: false, error: "Enter your email address." });
  });

  it("rejects a non-string password", () => {
    const result = validateCredentials(validEmail, undefined);
    expect(result).toEqual({ ok: false, error: "Enter your password." });
  });

  it("rejects an empty password", () => {
    const result = validateCredentials(validEmail, "");
    expect(result).toEqual({ ok: false, error: "Enter your password." });
  });

  it("rejects a malformed email", () => {
    const result = validateCredentials("not-an-email", validPassword);
    expect(result).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
  });

  it("rejects a password shorter than the minimum length", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const result = validateCredentials(validEmail, short);
    expect(result).toEqual({
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  });
});
