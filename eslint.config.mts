import { globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Only apply TypeScript linting/parsing to your src files
    files: ['src/**/*.ts', `manifest.json`],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  // If obsidianmd targets JS/TS, its rules will now only apply to files not ignored above
  ...obsidianmd.configs.recommended,
  // Globally ignore EVERYTHING outside of src and standard build files
  globalIgnores([
    'node_modules/',
    'dist/',
    'coverage/',
    '*.js',
    '*.mjs',
    'versions.json',
    'package.json',
    'main.js',
    'tests/', // Remove this line if you eventually WANT to lint your tests
  ])
);
