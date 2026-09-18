import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	encode: vi.fn(),
	freeImage: vi.fn(),
	freeRenderer: vi.fn(),
	render: vi.fn()
}));

vi.mock('@resvg/resvg-wasm/index_bg.wasm', () => ({ default: {} }));
vi.mock('@resvg/resvg-wasm', () => ({
	initWasm: vi.fn(),
	Resvg: class {
		render = mocks.render;
		free = mocks.freeRenderer;
	}
}));
vi.mock('./card-svg', () => ({ renderCardSvg: () => '<svg/>' }));
vi.mock('./card-fonts', () => ({ getCardFonts: () => [] }));

import { renderCardPng } from './card-png';

describe('PNG resource ownership', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.render.mockReturnValue({ asPng: mocks.encode, free: mocks.freeImage });
	});

	const options = {} as Parameters<typeof renderCardPng>[0];

	it('returns encoded bytes and frees both Wasm objects', async () => {
		const bytes = new Uint8Array([137, 80, 78, 71]);
		mocks.encode.mockReturnValue(bytes);
		expect(await renderCardPng(options)).toBe(bytes);
		expect(mocks.freeImage).toHaveBeenCalledOnce();
		expect(mocks.freeRenderer).toHaveBeenCalledOnce();
	});

	it('frees both objects when encoding fails', async () => {
		mocks.encode.mockImplementation(() => {
			throw new Error('encode failed');
		});
		await expect(renderCardPng(options)).rejects.toThrow('encode failed');
		expect(mocks.freeImage).toHaveBeenCalledOnce();
		expect(mocks.freeRenderer).toHaveBeenCalledOnce();
	});

	it('frees the renderer when rasterization fails', async () => {
		mocks.render.mockImplementation(() => {
			throw new Error('render failed');
		});
		await expect(renderCardPng(options)).rejects.toThrow('render failed');
		expect(mocks.freeRenderer).toHaveBeenCalledOnce();
		expect(mocks.freeImage).not.toHaveBeenCalled();
	});
});
