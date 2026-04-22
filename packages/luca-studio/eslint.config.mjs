import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

import rootConfig from '../../eslint.config.mjs'

export default [
    ...rootConfig,
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        languageOptions: { globals: globals.browser },
        plugins: {
            '@next/next': nextPlugin,
            'react-hooks': reactHooks,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
]
