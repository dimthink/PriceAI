import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    ".wrangler/**",
    ".open-next/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".trellis/**",
    "out/**",
    "build/**",
    "tmp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
