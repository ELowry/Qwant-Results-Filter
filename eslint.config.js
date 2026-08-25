import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

export default [
	{
		ignores: ['**/*.md'],
	},
	// JAVASCRIPT
	{
		files: ['**/*.js', '**/*.mjs', '**/*.md/*.js', '**/*.md/*.mjs'],
		...js.configs.recommended,
	},
	{
		files: ['**/*.js', '**/*.mjs', '**/*.md/*.js', '**/*.md/*.mjs'],
		...jsdoc.configs['flat/recommended'],
	},
	{
		files: ['**/*.js', '**/*.mjs'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node,
				__BUILD_HASH__: 'readonly',
				browser: 'readonly',
			},
		},
		rules: {
			curly: ['error', 'all'],
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			'no-empty': ['error', { allowEmptyCatch: true }],
			'no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					caughtErrors: 'none',
				},
			],
			'no-useless-assignment': 'warn',

			'jsdoc/check-types': 'off',
			'jsdoc/no-defaults': 'off',
			'jsdoc/no-undefined-types': 'off',
			'jsdoc/reject-any-type': 'off',
			'jsdoc/reject-function-type': 'off',
			'jsdoc/tag-lines': 'off',
			'jsdoc/check-tag-names': ['warn', { definedTags: ['constant'] }],
			'jsdoc/require-jsdoc': [
				'warn',
				{
					publicOnly: false,
					require: {
						ArrowFunctionExpression: false,
						ClassDeclaration: true,
						ClassExpression: true,
						FunctionDeclaration: true,
						FunctionExpression: false,
						MethodDefinition: true,
					},
					checkGetters: 'no-setter',
					checkSetters: false,
				},
			],
			'jsdoc/require-returns': 'warn',
			'jsdoc/require-returns-description': 'warn',
		},
	},
	// PRETTIER
	prettier,
];
