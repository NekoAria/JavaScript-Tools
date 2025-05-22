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
        Panzoom: "readonly",
      },
    },
    rules: {
      // Base ESLint rules
      ...js.configs.recommended.rules,
      curly: ["error", "all"],
      "prefer-destructuring": [
        "error",
        {
          VariableDeclarator: {
            array: false,
            object: true,
          },
        },
      ],
    },
  },
  {
    files: ["userscripts/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
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
