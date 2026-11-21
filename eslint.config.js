// Complexity gate for production TS/TSX (tsconfig scope: root *.ts, *.tsx).
// `npx eslint .` reproduces the per-function thresholds used by `npm run quality`.
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export const limits = { cyclomatic: 10, cognitive: 15 };

export default [
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "tests/**", "scripts/**"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { sonarjs },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
    rules: {
      complexity: ["error", { max: limits.cyclomatic, variant: "classic" }],
      "sonarjs/cognitive-complexity": ["error", limits.cognitive],
    },
  },
];
