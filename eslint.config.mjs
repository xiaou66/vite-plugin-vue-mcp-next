import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'eslint.config.mjs']
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: dirname
      }
    }
  }
)
