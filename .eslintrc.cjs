/** @type {import('eslint').Linter.Config} */
module.exports = {
  rules: {
    'perfectionist/sort-imports': [
      'error',
      {
        type: 'alphabetical',
        order: 'asc',
        ignoreCase: true,
      },
    ],
    'perfectionist/sort-jsx-props': [
      'error',
      {
        type: 'line-length',
        order: 'asc',
        ignoreCase: true,
      },
    ],
  },
  settings: {
    perfectionist: {
      partitionByComment: true,
      type: 'line-length',
    },
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
  extends: ['@remix-run/eslint-config', '@remix-run/eslint-config/node'],
  plugins: ['perfectionist'],
  ignorePatterns: ['*.css'],
};
