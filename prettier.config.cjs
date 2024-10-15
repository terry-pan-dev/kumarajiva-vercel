/** @type {import("prettier").Config} */
module.exports = {
  // Standard prettier options
  singleQuote: true,
  semi: true,
  tabWidth: 2,
  printWidth: 120,
  // Since prettier 3.0, manually specifying plugins is required
  plugins: ['@ianvs/prettier-plugin-sort-imports', 'prettier-plugin-tailwindcss'],
  // This plugin's options
  importOrder: ['^@ui/(.*)$', '^@core/(.*)$', '^@server/(.*)$', '^[./]'],
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
  importOrderTypeScriptVersion: '5.0.0',
};
