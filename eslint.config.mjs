import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

// Next.js already registers the jsx-a11y plugin; promote its full recommended
// rule set to errors (WCAG 2.2 AA lint coverage) without re-registering it.
const a11yRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(
    ([rule, setting]) => {
      const level = Array.isArray(setting) ? setting[0] : setting;
      if (level === "off" || level === 0) return [rule, "off"];
      return [
        rule,
        Array.isArray(setting) ? ["error", ...setting.slice(1)] : "error",
      ];
    }
  )
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Accessibility lint rules (jsx-a11y recommended, as errors).
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: a11yRules,
    settings: {
      "jsx-a11y": {
        components: {
          Button: "button",
          IconButton: "button",
          Link: "a",
          Img: "img",
        },
      },
    },
  },
  // Turn off ESLint rules that conflict with Prettier (Prettier owns formatting).
  // Must come last so it can disable the rules the configs above enable.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Accessibility scan output (generated):
    "playwright-report/**",
    "test-results/**",
    "a11y-results/**",
  ]),
]);

export default eslintConfig;
