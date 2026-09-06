import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // DEUDA CONOCIDA (PR fix-p2, Grupo C): tipos any y reglas nuevas de
      // react-hooks v7 sobre codigo heredado. Endurecer gradualmente.
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // toast.tsx agrupa el contexto + ToastProvider + hook useToast en un solo
    // modulo (patron valido en React). allowExportNames exime al hook de la
    // regla react-refresh/only-export-components sin afectar otros archivos.
    files: ['src/lib/toast.tsx'],
    rules: {
      'react-refresh/only-export-components': ['error', { allowExportNames: ['useToast'] }],
    },
  },
])
