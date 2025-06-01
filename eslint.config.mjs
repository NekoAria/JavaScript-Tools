import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["**/*.min.js"],
  },
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
      },
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      curly: ["error", "all"],
      "operator-assignment": "error",
      "prefer-destructuring": [
        "error",
        {
          VariableDeclarator: {
            array: false,
            object: true,
          },
        },
      ],
      "prefer-template": "error",
    },
  },
  {
    files: ["bookmarklets/**/*.js"],
    rules: {
      "no-unused-labels": "off",
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
];
