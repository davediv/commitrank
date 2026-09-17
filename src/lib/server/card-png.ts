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

import { Buffer } from 'node:buffer';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { CARD_RASTER_SIZE } from '$lib/card-layout';
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

/**
 * Encodes avatar bytes for the SVG `<image>` href.
 *
 * Buffer rather than a chunked `String.fromCharCode` + `btoa`: building the
 * intermediate binary string cost ~0.53ms for a 28KB avatar against ~0.003ms
 * here, for byte-identical output. `nodejs_compat` is already on for the
 * Worker, so this is the platform's native encoder rather than a polyfill.
 */
export function toDataUri(data: ArrayBuffer, contentType: string): string {
	return `data:${contentType};base64,${Buffer.from(data).toString('base64')}`;
}

export async function renderCardPng(options: CardSvgOptions): Promise<Uint8Array> {
	await ensureWasm();

	const resvg = new Resvg(renderCardSvg(options), {
		/*
		 * Well under the 1080-unit layout, and far under the 2x canvas the browser
		 * draws for download. Rasterizing is the entire cost of this endpoint and
		 * it scales with pixel count, so the output is sized to what actually
		 * consumes it rather than to the layout — see CARD_RASTER_SIZE.
		 */
		fitTo: { mode: 'width', value: CARD_RASTER_SIZE },
		font: {
			fontBuffers: getCardFonts(),
			defaultFontFamily: 'JetBrains Mono',
			// There are none, and looking is a waste of the render budget.
			loadSystemFonts: false
		}
	});

	return resvg.render().asPng();
}
