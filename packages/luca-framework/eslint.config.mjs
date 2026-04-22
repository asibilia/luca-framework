import globals from 'globals'

import rootConfig from '../../eslint.config.mjs'

export default [
    ...rootConfig,
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        languageOptions: { globals: globals.node },
    },
]
