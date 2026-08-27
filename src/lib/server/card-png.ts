/**
 * Rasterizes the share card to PNG inside the Worker, for `og:image`.
 *
 * A crawler runs no JavaScript, so the canvas the browser draws is invisible to
 * it — the same layout has to be produced server-side. resvg does that, with
 * two caveats the setup here exists to satisfy: workerd refuses to compile Wasm
 * at runtime (so the module is imported and compiled at deploy time, see the
 * CompiledWasm rule in wrangler.jsonc), and there are no system fonts in a
 * Worker (so the glyph data is embedded).
 */

import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { CARD_SIZE } from '$lib/card-layout';
import { getCardFonts } from './card-fonts';
import { renderCardSvg, type CardSvgOptions } from './card-svg';

let ready: Promise<void> | null = null;

/**
 * Imported dynamically so the module is not evaluated during SvelteKit's
 * build-time route analysis, where Node tries to resolve the Wasm module's
 * `wbg` bindings and fails. Wrangler still sees the import statically and
 * compiles it into the Worker.
 */
async function ensureWasm(): Promise<void> {
	if (!ready) {
		ready = (async () => {
			// @ts-expect-error - compiled to a WebAssembly.Module by wrangler's CompiledWasm rule
			const wasm = await import('@resvg/resvg-wasm/index_bg.wasm');
			await initWasm((wasm.default ?? wasm) as WebAssembly.Module);
		})();
	}
	await ready;
}

/** Encodes avatar bytes for the SVG `<image>` href. */
export function toDataUri(data: ArrayBuffer, contentType: string): string {
	const bytes = new Uint8Array(data);
	let binary = '';
	// Chunked because String.fromCharCode(...bytes) blows the argument limit on
	// anything larger than a thumbnail.
	for (let i = 0; i < bytes.length; i += 8192) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
	}
	return `data:${contentType};base64,${btoa(binary)}`;
}

export async function renderCardPng(options: CardSvgOptions): Promise<Uint8Array> {
	await ensureWasm();

	const resvg = new Resvg(renderCardSvg(options), {
		/*
		 * 1x, unlike the 2x canvas the browser draws for download. Rasterizing is
		 * the entire cost of this endpoint and it scales with pixel count, so 2x
		 * would quadruple the Worker's CPU time to produce something every social
		 * platform immediately downscales — 1080 square is already the size they
		 * ask for.
		 */
		fitTo: { mode: 'width', value: CARD_SIZE },
		font: {
			fontBuffers: getCardFonts(),
			defaultFontFamily: 'JetBrains Mono',
			// There are none, and looking is a waste of the render budget.
			loadSystemFonts: false
		}
	});

	return resvg.render().asPng();
}
