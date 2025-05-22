import globals from "globals";
import js from "@eslint/js";

export default [
  {
    files: ["**/*.js"],
    ignores: ["bookmarklets/**/*.min.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
      },
    },
    rules: {
      // Base ESLint rules
      ...js.configs.recommended.rules,
      curly: ["error", "all"],
    },
  },
  {
    files: ["userscripts/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
        Panzoom: "readonly",
      },
    },
  },
  {
    files: ["bookmarklets/**/*.js"],
    rules: {
      "no-unused-labels": "off",
    },
  },
];
