/**
 * Canvas renderer for the share card.
 *
 * Thin by design: the composition lives in `card-layout.ts`, and this only
 * knows how to paint a node onto a 2D context. `server/card-svg.ts` is the same
 * walk against a different output, which is what keeps the downloaded image and
 * the `og:image` identical.
 */

import {
	buildCardLayout,
	CARD_PALETTE,
	CARD_SCALE,
	CARD_SIZE,
	FONT_STACK,
	type CardData,
	type CardNode,
	type TextNode
} from '$lib/card-layout';

export { CARD_SIZE, CARD_SCALE, shareCardFilename } from '$lib/card-layout';

const AVATAR_TIMEOUT_MS = 4000;

/**
 * Resolves to `null` rather than rejecting on any failure: a missing avatar
 * downgrades the card to its initials block, it never fails the export.
 *
 * `crossOrigin` is required because `/api/avatar/:user` redirects to GitHub's
 * CDN on a cache miss, and an image drawn from an opaque response taints the
 * canvas — `toBlob` would then throw a SecurityError at the point of download.
 */
export function loadAvatar(src: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const image = new Image();
		let settled = false;

		const finish = (result: HTMLImageElement | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};

		const timer = setTimeout(() => finish(null), AVATAR_TIMEOUT_MS);

		image.crossOrigin = 'anonymous';
		image.onload = () => finish(image);
		image.onerror = () => finish(null);
		image.src = src;
	});
}

/** `roundRect` is only ~2px here, so a plain rect is an acceptable fallback. */
function boxPath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	radius = 2
): void {
	ctx.beginPath();
	if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
	else ctx.rect(x, y, w, h);
}

/**
 * Tracked runs are drawn a character at a time rather than through
 * `ctx.letterSpacing`, which Firefox only shipped in 128 — a share card that
 * silently loses its label tracking on one browser is not worth the shortcut.
 */
function drawText(ctx: CanvasRenderingContext2D, node: TextNode): void {
	ctx.font = `${node.weight} ${node.size}px ${FONT_STACK}`;
	ctx.fillStyle = node.color;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	if (node.tracking === 0) {
		ctx.fillText(node.text, node.x, node.y);
		return;
	}

	const advance = node.size * 0.6 + node.tracking * node.size;
	let cursor = node.x;
	for (const char of node.text) {
		ctx.fillText(char, cursor, node.y);
		cursor += advance;
	}
}

function drawAvatar(
	ctx: CanvasRenderingContext2D,
	node: Extract<CardNode, { kind: 'avatar' }>,
	image: HTMLImageElement | null
): void {
	const { x, y, size } = node;

	ctx.save();
	boxPath(ctx, x, y, size, size);
	ctx.fillStyle = CARD_PALETTE.sunken;
	ctx.fill();

	if (image) {
		// Cover, not stretch: GitHub avatars are square but a fallback may not be.
		ctx.clip();
		const scale = Math.max(size / image.width, size / image.height);
		const drawW = image.width * scale;
		const drawH = image.height * scale;
		ctx.drawImage(image, x + (size - drawW) / 2, y + (size - drawH) / 2, drawW, drawH);
	}
	ctx.restore();

	if (!image) {
		// Same fallback the page uses: initials on the sunken surface.
		ctx.font = `400 ${Math.round(size * 0.3)}px ${FONT_STACK}`;
		ctx.fillStyle = CARD_PALETTE.tertiary;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(node.initials, x + size / 2, y + size / 2);
	}

	boxPath(ctx, x + 0.5, y + 0.5, size - 1, size - 1);
	ctx.strokeStyle = CARD_PALETTE.rule;
	ctx.lineWidth = 1;
	ctx.stroke();
}

/**
 * Optional CRT texture, once, at 3% — the same treatment and the same strength
 * as `.term-scanlines`. Any stronger and it stops reading as a screen.
 */
function drawScanlines(ctx: CanvasRenderingContext2D): void {
	ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
	for (let y = 0; y < CARD_SIZE; y += 3) {
		ctx.fillRect(0, y, CARD_SIZE, 1);
	}
}

export interface ShareCardOptions extends CardData {
	/** Preloaded avatar, or null to render the initials block. */
	avatar?: HTMLImageElement | null;
}

/**
 * Draw the complete card. Sizes the canvas as a side effect, so callers only
 * have to supply an element.
 */
export function drawShareCard(canvas: HTMLCanvasElement, options: ShareCardOptions): void {
	const { avatar = null, ...data } = options;
	const { nodes } = buildCardLayout(data);

	canvas.width = CARD_SIZE * CARD_SCALE;
	canvas.height = CARD_SIZE * CARD_SCALE;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');

	ctx.setTransform(CARD_SCALE, 0, 0, CARD_SCALE, 0, 0);
	ctx.clearRect(0, 0, CARD_SIZE, CARD_SIZE);

	for (const node of nodes) {
		switch (node.kind) {
			case 'rect':
				if (node.fill) {
					boxPath(ctx, node.x, node.y, node.w, node.h);
					ctx.fillStyle = node.fill;
					ctx.fill();
				}
				if (node.stroke) {
					// Half-pixel inset so a 1px stroke lands on the pixel rather
					// than straddling two.
					boxPath(ctx, node.x + 0.5, node.y + 0.5, node.w - 1, node.h - 1);
					ctx.strokeStyle = node.stroke;
					ctx.lineWidth = 1;
					ctx.stroke();
				}
				break;
			case 'text':
				drawText(ctx, node);
				break;
			case 'avatar':
				drawAvatar(ctx, node, avatar);
				break;
			case 'scanlines':
				drawScanlines(ctx);
				break;
		}
	}
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('Failed to encode share card'));
		}, 'image/png');
	});
}
