// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default [
  // assets/make-icon.js is a plain Node script that regenerates the plugin
  // icons; it is not plugin code and needs Node globals.
  { ignores: ["assets/**"] },
  ...zotero({
    overrides: [
      {
        files: ["**/*.ts"],
        rules: {
          // We disable this rule here because the template
          // contains some unused examples and variables
          "@typescript-eslint/no-unused-vars": "off",
        },
      },
    ],
  }),
];
