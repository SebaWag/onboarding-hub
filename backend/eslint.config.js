// ESLint flat config del backend.
// Punto de partida pragmatico: reglas recomendadas sin type-checking
// (rapido en CI) y las reglas ruidosas sobre codigo heredado desactivadas
// para endurecer gradualmente en PRs futuros.
module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...require('typescript-eslint').configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
    },
  },
];
