import { describe, it, expect } from 'vitest';
import { buildCardLayout, measureText, CARD_SIZE, type TextNode } from './card-layout';
import type { ContributionDayData, UserProfile } from './types';

const NOW = new Date('2026-08-26T12:00:00Z');

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
	return {
		id: 'u1',
		github_username: 'levelsio',
		github_id: 1,
		display_name: 'Pieter',
		avatar_url: null,
		bio: null,
		twitter_handle: null,
		location: null,
		company: null,
		blog: null,
		public_repos: 10,
		followers: 10,
		following: 10,
		github_created_at: '2015-01-01T00:00:00Z',
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		contributions: [
			{ period: 'today', contributions: 4, rank: 12 },
			{ period: '7days', contributions: 40, rank: 11 },
			{ period: '30days', contributions: 300, rank: 10 },
			{ period: 'year', contributions: 5511, rank: 3 }
		],
		...overrides
	};
}

function layout(p: UserProfile, daily: ContributionDayData[] = []) {
	return buildCardLayout({ profile: p, dailyContributions: daily, now: NOW });
}

function texts(p: UserProfile): TextNode[] {
	return layout(p).nodes.filter((n): n is TextNode => n.kind === 'text');
}

describe('measureText', () => {
	it('measures monospace as a flat 0.6em advance', () => {
		// The whole shared-layout scheme rests on this: the Worker has no canvas
		// to measure with, so both renderers agree only if width is arithmetic.
		expect(measureText('abcd', 10)).toBeCloseTo(24);
		expect(measureText('', 40)).toBe(0);
	});

	it('adds tracking between characters but not after the last', () => {
		expect(measureText('ab', 10, 0.1)).toBeCloseTo(13);
		expect(measureText('a', 10, 0.1)).toBeCloseTo(6);
	});
});

describe('buildCardLayout', () => {
	it('renders a square card', () => {
		const { size } = layout(profile());

		expect(size).toBe(CARD_SIZE);
		expect(CARD_SIZE).toBe(1080);
	});

	it('puts the identity, rank and year total on the card', () => {
		const content = texts(profile()).map((n) => n.text);

		expect(content).toContain('Pieter');
		expect(content).toContain('@levelsio');
		expect(content).toContain('#3');
		expect(content).toContain('5,511');
	});

	it('falls back to the username when there is no display name', () => {
		const content = texts(profile({ display_name: null })).map((n) => n.text);

		expect(content.filter((t) => t === 'levelsio' || t === '@levelsio')).toHaveLength(2);
	});

	it('emits an avatar slot with initials for the no-image fallback', () => {
		const avatar = layout(profile()).nodes.find((n) => n.kind === 'avatar');

		expect(avatar).toMatchObject({ kind: 'avatar', initials: 'LE' });
	});

	it('shows a dash rather than #0 for an unranked profile', () => {
		const content = texts(
			profile({ contributions: [{ period: 'year', contributions: 0, rank: 0 }] })
		).map((n) => n.text);

		expect(content).toContain('—');
		expect(content).toContain('rank —');
	});

	it('resolves alignment during layout, so renderers only draw from the left', () => {
		// Right-aligned runs are the ones a renderer could disagree about; the
		// layout pre-resolves them to a left edge so canvas and SVG cannot differ.
		const rightEdgeRun = texts(profile()).find((n) => n.text === 'GITHUB COMMIT LEADERBOARD');

		expect(rightEdgeRun).toBeDefined();
		const end =
			rightEdgeRun!.x + measureText(rightEdgeRun!.text, rightEdgeRun!.size, rightEdgeRun!.tracking);
		expect(end).toBeCloseTo(CARD_SIZE - 48, 0);
	});

	it('keeps every text run inside the card, even for extreme content', () => {
		// GitHub allows 39-character usernames, and a bio can be 160.
		const extreme = profile({
			github_username: 'a'.repeat(39),
			display_name: 'D'.repeat(80),
			bio: 'B'.repeat(160),
			contributions: [
				{ period: 'today', contributions: 999999, rank: 999999 },
				{ period: '7days', contributions: 999999, rank: 999999 },
				{ period: '30days', contributions: 999999, rank: 999999 },
				{ period: 'year', contributions: 9999999, rank: 999999 }
			]
		});

		for (const node of texts(extreme)) {
			const end = node.x + measureText(node.text, node.size, node.tracking);
			expect(node.x).toBeGreaterThanOrEqual(0);
			expect(end).toBeLessThanOrEqual(CARD_SIZE);
		}
	});

	it('draws one square per day of the heatmap window', () => {
		const daily = [{ date: '2026-01-15', count: 9 }];
		const { nodes } = layout(profile(), daily);
		// 53 columns x 7 days, minus the days after today in the final week.
		const heatCells = nodes.filter((n) => n.kind === 'rect' && n.w === 14 && n.h === 14);

		expect(heatCells).toHaveLength(368);
	});
});
