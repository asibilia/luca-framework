import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import prettier from 'eslint-plugin-prettier'
import typescript from 'typescript-eslint'

/** @type {import('eslint').Linter.Config[]} */
export default [
    js.configs.recommended,
    ...typescript.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        plugins: {
            prettier,
            import: importPlugin,
        },
        settings: {
            'import/resolver': {
                typescript: {
                    alwaysTryTypes: true,
                    project: [
                        './tsconfig.json',
                        './packages/*/tsconfig.json',
                    ],
                },
            },
        },
        rules: {
            'prettier/prettier': [
                'error',
                {
                    semi: false,
                    singleQuote: true,
                    trailingComma: 'es5',
                    endOfLine: 'lf',
                    printWidth: 80,
                    tabWidth: 4,
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|Html$)' },
            ],
            '@typescript-eslint/no-explicit-any': ['warn'],
            'import/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', 'sibling'],
                    pathGroups: [
                        {
                            pattern: 'bun',
                            group: 'external',
                            position: 'before',
                        },
                        {
                            pattern: 'react',
                            group: 'external',
                            position: 'before',
                        },
                        { pattern: '~/**', group: 'internal' },
                    ],
                    pathGroupsExcludedImportTypes: ['bun'],
                    'newlines-between': 'always',
                    alphabetize: { order: 'asc', caseInsensitive: true },
                },
            ],
        },
    },
    {
        ignores: [
            'node_modules/**',
            '**/node_modules/**',
            '**/dist/**',
            '**/.next/**',
            '**/_generated/**',
            '**/coverage/**',
            '**/next-env.d.ts',
            '.planning/**',
            '.changeset/**',
            '.claude/**',
            '.cursor/**',
            '.github/**',
            '**/.pi/**',
        ],
    },
]
