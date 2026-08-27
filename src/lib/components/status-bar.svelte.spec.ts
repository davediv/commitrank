// vitest-browser-svelte render types have compatibility issues with Svelte 5 props
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StatusBar from './status-bar.svelte';
import type { StatsResponse } from '$lib/types';

// These assertions previously lived in src/routes/page.svelte.spec.ts. The sync
// clock and stat readouts moved out of the leaderboard page and into the
// persistent status bar, so the coverage moved with them.

const mockStats: StatsResponse = {
	total_users: 100,
	total_contributions_today: 5000,
	total_contributions_year: 500000,
	last_sync: null,
	next_sync: '2024-01-15T06:00:00Z'
};

describe('status-bar.svelte', () => {
	describe('Stats readouts', () => {
		it('should display the user count when stats are available', async () => {
			render(StatusBar, {
				props: { stats: mockStats, path: '/', onOpenPalette: vi.fn() }
			});

			await expect.element(page.getByText('users', { exact: true })).toBeInTheDocument();
			await expect.element(page.getByText('100', { exact: true })).toBeInTheDocument();
		});

		it("should display today's contributions when stats are available", async () => {
			render(StatusBar, {
				props: { stats: mockStats, path: '/', onOpenPalette: vi.fn() }
			});

			await expect.element(page.getByText('today', { exact: true })).toBeInTheDocument();
			await expect.element(page.getByText('5,000', { exact: true })).toBeInTheDocument();
		});

		it('should label the next scheduled sync', async () => {
			render(StatusBar, {
				props: { stats: mockStats, path: '/', onOpenPalette: vi.fn() }
			});

			await expect.element(page.getByText('synced', { exact: true })).toBeInTheDocument();
			await expect.element(page.getByText('next', { exact: true })).toBeInTheDocument();
		});

		it('should not display stats when they are not available', async () => {
			render(StatusBar, { props: { stats: null, path: '/join', onOpenPalette: vi.fn() } });

			await expect.element(page.getByText('users', { exact: true })).not.toBeInTheDocument();
			await expect.element(page.getByText('today', { exact: true })).not.toBeInTheDocument();
		});
	});

	describe('UTC clock', () => {
		it('should render a labelled UTC clock', async () => {
			render(StatusBar, {
				props: { stats: mockStats, path: '/', onOpenPalette: vi.fn() }
			});

			await expect.element(page.getByLabelText('Current UTC time')).toBeInTheDocument();
			await expect.element(page.getByText(/UTC$/)).toBeInTheDocument();
		});
	});

	describe('Working directory', () => {
		it('should render the root path as ~/', async () => {
			render(StatusBar, { props: { stats: null, path: '/', onOpenPalette: vi.fn() } });

			await expect.element(page.getByText('~/', { exact: true })).toBeInTheDocument();
		});

		it('should render a nested path after the tilde', async () => {
			render(StatusBar, { props: { stats: null, path: '/octocat', onOpenPalette: vi.fn() } });

			await expect.element(page.getByText('~/octocat', { exact: true })).toBeInTheDocument();
		});
	});

	describe('Command palette trigger', () => {
		it('should call onOpenPalette when the trigger is activated', async () => {
			const onOpenPalette = vi.fn();
			render(StatusBar, { props: { stats: null, path: '/', onOpenPalette } });

			await page.getByRole('button', { name: 'Open command palette' }).click();

			expect(onOpenPalette).toHaveBeenCalledOnce();
		});
	});
});
