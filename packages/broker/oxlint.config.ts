import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

const baseConfig = {
    categories: {
        correctness: "error",
        perf: "warn",
        style: "warn",
        suspicious: "warn",
    },
    env: {
        node: true,
        es2022: true,
    },
    ignorePatterns: ["node_modules/**", "dist/**"],
    options: {
        maxWarnings: 0,
        reportUnusedDisableDirectives: "error",
        typeAware: true,
    },
    plugins: ["eslint", "typescript", "import", "unicorn", "oxc", "node"],
    rules: {
        "eslint/func-style": "off",
        "eslint/id-length": "off",
        "eslint/no-magic-numbers": "off",
        "eslint/no-ternary": "off",
        "eslint/prefer-destructuring": "off",
        "eslint/prefer-named-capture-group": "off",
        "sort-keys": "off",
        "import/exports-last": "off",
        "import/group-exports": "off",
        "import/no-named-export": "off",
        "import/prefer-default-export": "off",
        "import/no-nodejs-modules": "off",

        "eslint/one-var": "off",
        "eslint/init-declarations": "off",
        "eslint/no-duplicate-imports": "off",

        // `null` is load-bearing in the upstream broker's JSON wire format
        // (`identityKey: string | null`, `rotatesInMs: number | null`).
        "unicorn/no-null": "off",

        "typescript/consistent-return": "error",
        "eslint/curly": "error",
        "import/no-cycle": "error",
        "import/no-duplicates": "error",
        "typescript/await-thenable": "error",
        "typescript/consistent-type-definitions": "error",
        "typescript/consistent-type-imports": "error",
        "typescript/no-explicit-any": "error",
        "typescript/no-floating-promises": "error",
        "typescript/no-unsafe-type-assertion": "error",
        "unicorn/prefer-node-protocol": "error",
        "unicorn/prefer-response-static-json": "error",
        "sort-imports": ["warn", { allowSeparatedGroups: true, ignoreCase: true }],
    },
} satisfies OxlintConfig;

export default defineConfig(baseConfig);
