import type { OxlintConfig } from "oxlint";
import { defineConfig } from "oxlint";

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
        reportUnusedDisableDirectives: "error",
        typeAware: true,
    },
    plugins: ["eslint", "typescript", "import", "unicorn", "oxc", "node"],
    rules: {
        "eslint/capitalized-comments": "off",
        "eslint/func-style": "off",
        "eslint/id-length": "off",
        "eslint/max-params": "off",
        "eslint/max-statements": "off",
        "eslint/no-continue": "off",
        "eslint/no-magic-numbers": "off",
        "eslint/no-ternary": "off",
        "eslint/one-var": "off",
        "sort-keys": "off",
        "eslint/no-duplicate-imports": "off",
        "import/exports-last": "off",
        "import/group-exports": "off",
        "import/no-named-export": "off",
        "import/prefer-default-export": "off",

        "import/no-cycle": "error",
        "import/no-duplicates": "error",
        "typescript/consistent-type-imports": "error",
        "typescript/no-explicit-any": "error",
        "unicorn/prefer-node-protocol": "error",
        "sort-imports": ["warn", { allowSeparatedGroups: true }],
    },
} satisfies OxlintConfig;

export default defineConfig(baseConfig);
