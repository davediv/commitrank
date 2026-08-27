import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],

	/*
	 * Wrangler, not Vite, resolves the resvg Wasm module: workerd refuses to
	 * compile Wasm from bytes at runtime ("Wasm code generation disallowed by
	 * embedder"), so it has to enter the bundle as a module and be compiled at
	 * deploy time. Vite has no loader for that and fails the build outright, so
	 * the import is kept external and handed to the CompiledWasm rule in
	 * wrangler.jsonc.
	 */
	build: {
		rollupOptions: {
			external: [/\.wasm$/]
		}
	},

	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'client',

					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},

					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
