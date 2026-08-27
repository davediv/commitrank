/**
 * Share card layout — one composition, two renderers.
 *
 * The card is drawn on a canvas in the browser (so a visitor can save or copy
 * it) and rasterized on the Worker for `og:image` (so link previews show it
 * too). Those are different rendering systems, and a card laid out separately
 * in each would drift the first time anyone touched it. So layout happens once,
 * here, as a flat list of absolutely-positioned nodes; `share-card.ts` paints
 * them onto a canvas and `server/card-svg.ts` writes them as SVG.
 *
 * That split is only affordable because the design is monospace: every glyph in
 * JetBrains Mono advances exactly 0.6em, so text can be measured arithmetically
 * with no canvas and no font engine, and both renderers agree on where a run
 * ends before either of them has drawn anything.
 */

import type {
	ContributionDayData,
	ContributionPeriod,
	PeriodContribution,
	UserProfile
} from '$lib/types';
import { buildHeatmapGrid, HEATMAP_LEVELS } from '$lib/heatmap';

/**
 * Square, because the card is made to be posted: 1080 is the native size for a
 * social post and sits centred in a 9:16 story without being re-cropped.
 */
export const CARD_SIZE = 1080;

/** Rendered at 2x so the PNG stays crisp when a timeline upscales it. */
export const CARD_SCALE = 2;

/**
 * Every monospace face in the stack advances 0.6em per glyph (JetBrains Mono is
 * 600/1000 units; SF Mono and Menlo match). Measuring from that constant rather
 * than from `measureText` is what lets the server lay the card out identically
 * with no canvas available.
 */
const ADVANCE = 0.6;

export const FONT_STACK =
	"'JetBrains Mono', 'SF Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/**
 * The palette, mirroring the `--term-*` tokens in `layout.css`.
 *
 * Held as literals rather than read from computed CSS because the Worker has no
 * cascade to read: the downloaded card and the `og:image` have to be the same
 * picture, and a client that resolved its own colours could not guarantee that.
 * Keep in step with `layout.css` — it remains the source of truth for the app.
 */
export const CARD_PALETTE = {
	background: '#0c0c0d', // --term-black-1
	sunken: '#08080a', // --term-black-0
	raised: '#141416', // --term-black-2
	rule: '#26262a', // --term-black-4
	tertiary: '#8b8b94', // --term-gray-2
	secondary: '#a1a1aa', // --term-gray-3
	primary: '#d4d4d8', // --term-gray-4
	phosphor: '#00e5a0', // --term-phosphor
	heat: ['#17171a', '#0b3f2e', '#0e6b4b', '#00a878', '#00e5a0']
} as const;

/* ---- nodes -------------------------------------------------------------- */

export interface RectNode {
	kind: 'rect';
	x: number;
	y: number;
	w: number;
	h: number;
	fill?: string;
	stroke?: string;
}

export interface TextNode {
	kind: 'text';
	/** Left edge — alignment is resolved during layout, never by the renderer. */
	x: number;
	/** Alphabetic baseline. */
	y: number;
	text: string;
	size: number;
	weight: 400 | 700;
	color: string;
	/** Extra advance per character, as a fraction of the font size. */
	tracking: number;
}

export interface AvatarNode {
	kind: 'avatar';
	x: number;
	y: number;
	size: number;
	/** Drawn when no avatar image is available. */
	initials: string;
}

export interface ScanlinesNode {
	kind: 'scanlines';
}

export type CardNode = RectNode | TextNode | AvatarNode | ScanlinesNode;

export interface CardLayout {
	size: number;
	nodes: CardNode[];
}

/* ---- text --------------------------------------------------------------- */

export function measureText(text: string, size: number, tracking = 0): number {
	if (text.length === 0) return 0;
	return text.length * size * ADVANCE + tracking * size * (text.length - 1);
}

function truncateText(text: string, size: number, maxWidth: number, tracking = 0): string {
	if (measureText(text, size, tracking) <= maxWidth) return text;

	// Monospace, so the fitting character count is arithmetic rather than a search.
	const perChar = size * (ADVANCE + tracking);
	const fits = Math.floor((maxWidth + tracking * size) / perChar) - 1;
	if (fits <= 0) return '';
	return `${text.slice(0, fits).trimEnd()}…`;
}

/* ---- composition -------------------------------------------------------- */

const PAD = 48;
const RIGHT = CARD_SIZE - PAD;
const CONTENT_W = RIGHT - PAD;

const LABEL_TRACKING = 0.08;

const PERIOD_LABELS: Record<ContributionPeriod, string> = {
	today: 'TODAY',
	'7days': '7 DAYS',
	'30days': '30 DAYS',
	year: 'YEAR'
};

const numberFormatter = new Intl.NumberFormat('en-US');

function formatNumber(value: number): string {
	return numberFormatter.format(value);
}

function periodOf(
	contributions: PeriodContribution[],
	period: ContributionPeriod
): PeriodContribution {
	return contributions.find((c) => c.period === period) ?? { period, contributions: 0, rank: 0 };
}

interface TextSpec {
	size: number;
	color: string;
	weight?: 400 | 700;
	tracking?: number;
	align?: 'left' | 'right';
	maxWidth?: number;
}

/** Collects nodes and resolves alignment and truncation as they are added. */
class Composer {
	readonly nodes: CardNode[] = [];

	rect(x: number, y: number, w: number, h: number, style: { fill?: string; stroke?: string }) {
		this.nodes.push({ kind: 'rect', x, y, w, h, ...style });
	}

	/** A 1px rule; drawn as a thin rect so both renderers treat it identically. */
	rule(x: number, y: number, w: number, h: number, color: string) {
		this.rect(x, y, w, h, { fill: color });
	}

	/** Returns the drawn width, so callers can place something after the run. */
	text(x: number, baseline: number, text: string, spec: TextSpec): number {
		const tracking = spec.tracking ?? 0;
		const label = spec.maxWidth ? truncateText(text, spec.size, spec.maxWidth, tracking) : text;
		if (!label) return 0;

		const width = measureText(label, spec.size, tracking);
		this.nodes.push({
			kind: 'text',
			x: spec.align === 'right' ? x - width : x,
			y: baseline,
			text: label,
			size: spec.size,
			weight: spec.weight ?? 400,
			color: spec.color,
			tracking
		});
		return width;
	}
}

export interface CardData {
	profile: UserProfile;
	dailyContributions: ContributionDayData[];
	/** Injectable so the heatmap window and the footer stamp agree. */
	now?: Date;
}

export function buildCardLayout({
	profile,
	dailyContributions,
	now = new Date()
}: CardData): CardLayout {
	const c = new Composer();
	const P = CARD_PALETTE;

	c.rect(0, 0, CARD_SIZE, CARD_SIZE, { fill: P.background });

	/* -- header ------------------------------------------------------------ */
	// The block cursor is this product's mark; it opens the card the way it
	// opens a prompt.
	c.rect(PAD, 36, 7, 22, { fill: P.phosphor });
	c.text(PAD + 18, 55, 'commitrank.dev', { size: 24, weight: 700, color: P.primary });
	c.text(RIGHT, 55, 'GITHUB COMMIT LEADERBOARD', {
		size: 14,
		color: P.tertiary,
		tracking: LABEL_TRACKING,
		align: 'right'
	});
	c.rule(0, 80, CARD_SIZE, 1, P.rule);

	/* -- identity ---------------------------------------------------------- */
	const AVATAR = 140;
	c.nodes.push({
		kind: 'avatar',
		x: PAD,
		y: 136,
		size: AVATAR,
		initials: profile.github_username.slice(0, 2).toUpperCase()
	});

	const textX = PAD + AVATAR + 28;
	const textW = RIGHT - textX;
	c.text(textX, 188, profile.display_name || profile.github_username, {
		size: 42,
		weight: 700,
		color: P.primary,
		maxWidth: textW
	});
	c.text(textX, 232, `@${profile.github_username}`, {
		size: 25,
		color: P.phosphor,
		maxWidth: textW
	});
	if (profile.bio) {
		c.text(textX, 270, profile.bio, { size: 18, color: P.secondary, maxWidth: textW });
	}

	/* -- hero -------------------------------------------------------------- */
	const year = periodOf(profile.contributions, 'year');
	const HERO = { y: 330, h: 180, pad: 32 };
	c.rect(PAD, HERO.y, CONTENT_W, HERO.h, { fill: P.raised, stroke: P.rule });

	// Two labelled columns rather than one number and a trailing caption: a short
	// rank like #3 left a third of the panel empty, and the year total is the
	// other half of the boast anyway.
	c.text(PAD + HERO.pad, HERO.y + 46, 'GLOBAL RANK', {
		size: 15,
		color: P.tertiary,
		tracking: LABEL_TRACKING
	});
	c.text(PAD + HERO.pad, HERO.y + 142, year.rank > 0 ? `#${formatNumber(year.rank)}` : '—', {
		size: 86,
		weight: 700,
		color: P.phosphor
	});

	c.text(RIGHT - HERO.pad, HERO.y + 46, 'CONTRIBUTIONS · YEAR', {
		size: 15,
		color: P.tertiary,
		tracking: LABEL_TRACKING,
		align: 'right'
	});
	c.text(RIGHT - HERO.pad, HERO.y + 142, formatNumber(year.contributions), {
		size: 64,
		weight: 700,
		color: P.primary,
		align: 'right'
	});

	/* -- period strip ------------------------------------------------------ */
	const STRIP = { y: 558, h: 160, pad: 26 };
	c.rect(PAD, STRIP.y, CONTENT_W, STRIP.h, { stroke: P.rule });

	const order: ContributionPeriod[] = ['today', '7days', '30days', 'year'];
	const columnW = CONTENT_W / order.length;

	order.forEach((period, index) => {
		const left = PAD + index * columnW + STRIP.pad;
		const entry = periodOf(profile.contributions, period);
		const active = entry.contributions > 0;

		if (index > 0) {
			c.rule(Math.round(PAD + index * columnW), STRIP.y, 1, STRIP.h, P.rule);
		}

		c.text(left, STRIP.y + 46, PERIOD_LABELS[period], {
			size: 15,
			color: P.tertiary,
			tracking: LABEL_TRACKING
		});
		c.text(left, STRIP.y + 110, formatNumber(entry.contributions), {
			size: 36,
			color: active ? P.phosphor : P.tertiary,
			maxWidth: columnW - STRIP.pad * 2
		});
		c.text(left, STRIP.y + 144, entry.rank > 0 ? `rank #${formatNumber(entry.rank)}` : 'rank —', {
			size: 17,
			color: active ? P.secondary : P.tertiary,
			maxWidth: columnW - STRIP.pad * 2
		});
	});

	/* -- heatmap ----------------------------------------------------------- */
	const HEAT = { labelBaseline: 782, monthBaseline: 826, gridY: 838, cell: 14, gap: 3 };
	const gridX = PAD + 44;

	c.text(PAD, HEAT.labelBaseline, 'CONTRIBUTIONS · PAST YEAR', {
		size: 15,
		color: P.tertiary,
		tracking: LABEL_TRACKING
	});

	// Legend, right-aligned on the section-label baseline.
	const swatch = 13;
	const swatchGap = 5;
	const moreW = measureText('more', 13);
	const rampW = HEATMAP_LEVELS * (swatch + swatchGap);
	let cursor = RIGHT - moreW - swatchGap - rampW - measureText('less', 13) - swatchGap;
	cursor += c.text(cursor, HEAT.labelBaseline, 'less', { size: 13, color: P.tertiary }) + swatchGap;
	for (let level = 0; level < HEATMAP_LEVELS; level++) {
		c.rect(cursor, HEAT.labelBaseline - swatch + 2, swatch, swatch, { fill: P.heat[level] });
		cursor += swatch + swatchGap;
	}
	c.text(cursor, HEAT.labelBaseline, 'more', { size: 13, color: P.tertiary });

	const grid = buildHeatmapGrid(dailyContributions, now);
	/*
	 * Derive the column pitch from the width the grid has to fill rather than
	 * fixing it: a whole-pixel step leaves the last week short of the panels
	 * above, and a heatmap that does not line up with the strip it sits under is
	 * the first thing the eye catches.
	 */
	const step = (RIGHT - gridX - HEAT.cell) / (grid.weeks - 1);
	const rowStep = HEAT.cell + HEAT.gap;

	for (const { label, col } of grid.months) {
		c.text(Math.round(gridX + col * step), HEAT.monthBaseline, label, {
			size: 14,
			color: P.tertiary
		});
	}

	for (const [row, label] of [
		[1, 'Mon'],
		[3, 'Wed'],
		[5, 'Fri']
	] as const) {
		c.text(PAD, HEAT.gridY + row * rowStep + HEAT.cell - 2, label, {
			size: 13,
			color: P.tertiary
		});
	}

	for (const cell of grid.cells) {
		c.rect(
			Math.round(gridX + cell.col * step),
			HEAT.gridY + cell.row * rowStep,
			HEAT.cell,
			HEAT.cell,
			{ fill: P.heat[cell.level] }
		);
	}

	/* -- footer ------------------------------------------------------------ */
	c.rule(0, 1000, CARD_SIZE, 1, P.rule);
	const promptW = c.text(PAD, 1046, '$', { size: 20, color: P.phosphor });
	c.text(PAD + promptW + 10, 1046, `commitrank.dev/${profile.github_username}`, {
		size: 20,
		color: P.primary,
		maxWidth: 600
	});
	c.text(RIGHT, 1046, `${now.toISOString().slice(0, 10)} UTC`, {
		size: 15,
		color: P.tertiary,
		align: 'right'
	});

	c.nodes.push({ kind: 'scanlines' });

	// Drawn last so the frame sits above the scanline texture.
	c.rect(0, 0, CARD_SIZE, CARD_SIZE, { stroke: P.rule });

	return { size: CARD_SIZE, nodes: c.nodes };
}

/** Filename the card downloads as. */
export function shareCardFilename(username: string): string {
	return `commitrank-${username.toLowerCase()}.png`;
}
