/**
 * SVG renderer for the share card — the server half of `card-layout.ts`.
 *
 * Emits the same node list `share-card.ts` paints onto a canvas, so the PNG
 * behind `og:image` is the picture a visitor downloads. Output is deliberately
 * plain SVG 1.1: resvg has no CSS engine, so everything is a presentation
 * attribute and text is positioned by explicit baseline.
 */

import {
	buildCardLayout,
	CARD_PALETTE,
	CARD_SIZE,
	type CardData,
	type TextNode
} from '$lib/card-layout';

/** Matches the family name inside the embedded font files. */
const SVG_FONT_FAMILY = 'JetBrains Mono';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function textElement(node: TextNode): string {
	// resvg follows CSS letter-spacing, which also adds a trailing advance. That
	// only affects where the run ends, and every run here is positioned from its
	// left edge by the layout, so it never moves a glyph.
	const spacing = node.tracking
		? ` letter-spacing="${(node.tracking * node.size).toFixed(2)}"`
		: '';
	return (
		`<text x="${node.x.toFixed(2)}" y="${node.y.toFixed(2)}"` +
		` font-family="${SVG_FONT_FAMILY}" font-size="${node.size}" font-weight="${node.weight}"` +
		` fill="${node.color}"${spacing} xml:space="preserve">${escapeXml(node.text)}</text>`
	);
}

export interface CardSvgOptions extends CardData {
	/** Avatar bytes as a data URI, or null to render the initials block. */
	avatarDataUri?: string | null;
}

export function renderCardSvg({ avatarDataUri = null, ...data }: CardSvgOptions): string {
	const { nodes } = buildCardLayout(data);
	const parts: string[] = [];

	for (const node of nodes) {
		switch (node.kind) {
			case 'rect': {
				const fill = node.fill ? ` fill="${node.fill}"` : ' fill="none"';
				const stroke = node.stroke ? ` stroke="${node.stroke}" stroke-width="1"` : '';
				// Stroked boxes are inset half a pixel for the same reason the
				// canvas renderer insets them: a 1px stroke centred on the edge
				// would render across two pixel rows.
				const inset = node.stroke ? 0.5 : 0;
				parts.push(
					`<rect x="${node.x + inset}" y="${node.y + inset}"` +
						` width="${node.w - inset * 2}" height="${node.h - inset * 2}"` +
						` rx="2"${fill}${stroke}/>`
				);
				break;
			}
			case 'text':
				parts.push(textElement(node));
				break;
			case 'avatar': {
				parts.push(
					`<rect x="${node.x}" y="${node.y}" width="${node.size}" height="${node.size}"` +
						` rx="2" fill="${CARD_PALETTE.sunken}"/>`
				);
				if (avatarDataUri) {
					// preserveAspectRatio slice is the SVG spelling of object-fit: cover.
					parts.push(
						`<clipPath id="avatar-clip"><rect x="${node.x}" y="${node.y}"` +
							` width="${node.size}" height="${node.size}" rx="2"/></clipPath>` +
							`<image x="${node.x}" y="${node.y}" width="${node.size}" height="${node.size}"` +
							` preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)"` +
							` href="${avatarDataUri}"/>`
					);
				} else {
					const size = Math.round(node.size * 0.3);
					parts.push(
						`<text x="${node.x + node.size / 2}" y="${node.y + node.size / 2 + size * 0.35}"` +
							` font-family="${SVG_FONT_FAMILY}" font-size="${size}" text-anchor="middle"` +
							` fill="${CARD_PALETTE.tertiary}">${escapeXml(node.initials)}</text>`
					);
				}
				parts.push(
					`<rect x="${node.x + 0.5}" y="${node.y + 0.5}"` +
						` width="${node.size - 1}" height="${node.size - 1}" rx="2"` +
						` fill="none" stroke="${CARD_PALETTE.rule}" stroke-width="1"/>`
				);
				break;
			}
			case 'scanlines': {
				// One tiled pattern rather than 360 rects: same 3% texture as
				// `.term-scanlines`, a fraction of the document size.
				parts.push(
					`<defs><pattern id="scan" width="1" height="3" patternUnits="userSpaceOnUse">` +
						`<rect width="1" height="1" fill="#ffffff" fill-opacity="0.03"/></pattern></defs>` +
						`<rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#scan)"/>`
				);
				break;
			}
		}
	}

	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE}" height="${CARD_SIZE}"` +
		` viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}">${parts.join('')}</svg>`
	);
}
