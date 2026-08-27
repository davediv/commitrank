// vitest-browser-svelte render types have compatibility issues with Svelte 5 props
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import type { PageData } from './$types';

// Mock data for leaderboard entries
const mockLeaderboardData: PageData = {
	leaderboard: {
		leaderboard: [
			{
				rank: 1,
				github_username: 'topdev',
				display_name: 'Top Developer',
				avatar_url: 'https://avatars.githubusercontent.com/u/1',
				twitter_handle: 'topdev',
				contributions: 1500
			},
			{
				rank: 2,
				github_username: 'seconddev',
				display_name: 'Second Developer',
				avatar_url: 'https://avatars.githubusercontent.com/u/2',
				twitter_handle: null,
				contributions: 1200
			},
			{
				rank: 3,
				github_username: 'thirddev',
				display_name: 'Third Developer',
				avatar_url: 'https://avatars.githubusercontent.com/u/3',
				twitter_handle: 'third',
				contributions: 1000
			},
			{
				rank: 4,
				github_username: 'fourthdev',
				display_name: null,
				avatar_url: null,
				twitter_handle: null,
				contributions: 800
			}
		],
		pagination: {
			page: 1,
			limit: 20,
			total: 4,
			totalPages: 1
		}
	},
	period: 'today',
	stats: {
		total_users: 100,
		total_contributions_today: 5000,
		total_contributions_year: 500000,
		last_sync: null,
		next_sync: '2024-01-15T06:00:00Z'
	},
	cached: false
};

// Mock data with pagination
const mockPaginatedData: PageData = {
	leaderboard: {
		leaderboard: [
			{
				rank: 21,
				github_username: 'page2dev',
				display_name: 'Page Two Dev',
				avatar_url: 'https://avatars.githubusercontent.com/u/21',
				twitter_handle: null,
				contributions: 500
			}
		],
		pagination: {
			page: 2,
			limit: 20,
			total: 50,
			totalPages: 3
		}
	},
	period: 'today',
	stats: null,
	cached: true
};

// Empty leaderboard data
const mockEmptyData: PageData = {
	leaderboard: {
		leaderboard: [],
		pagination: {
			page: 1,
			limit: 20,
			total: 0,
			totalPages: 0
		}
	},
	period: 'today',
	stats: null,
	cached: false
};

describe('/+page.svelte - Leaderboard Page', () => {
	describe('Header Section', () => {
		it('should render the main heading', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			const heading = page.getByRole('heading', { level: 1 });
			await expect.element(heading).toBeInTheDocument();
			await expect.element(heading).toHaveTextContent('GitHub Commit Leaderboard');
		});

		it('should render the period navigation', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect
				.element(page.getByRole('navigation', { name: 'Contribution period' }))
				.toBeInTheDocument();
		});

		it('should display trophy icon', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// Trophy icon should be visible in header
			const header = page.getByRole('heading', { level: 1 });
			await expect.element(header).toBeInTheDocument();
		});
	});

	// The sync clock and stats readouts now live in the persistent status bar;
	// their assertions moved to src/lib/components/status-bar.svelte.spec.ts.

	describe('Time Period Navigation', () => {
		// These navigate to ?period=, so they are links with aria-current, not
		// ARIA tabs — tabs control in-page panels and announce wrongly here.
		it('should render all four period links', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect.element(page.getByRole('link', { name: 'Today' })).toBeInTheDocument();
			await expect.element(page.getByRole('link', { name: '7 Days' })).toBeInTheDocument();
			await expect.element(page.getByRole('link', { name: '30 Days' })).toBeInTheDocument();
			await expect.element(page.getByRole('link', { name: 'Year' })).toBeInTheDocument();
		});

		it('should mark the current period as the current page', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			const todayLink = page.getByRole('link', { name: 'Today' });
			await expect.element(todayLink).toHaveAttribute('aria-current', 'page');
		});

		it('should show 7days period as current when period is 7days', async () => {
			const data7days = { ...mockLeaderboardData, period: '7days' as const };
			render(Page, { props: { data: data7days } });

			const sevenDaysLink = page.getByRole('link', { name: '7 Days' });
			await expect.element(sevenDaysLink).toHaveAttribute('aria-current', 'page');
			await expect
				.element(page.getByRole('link', { name: 'Today' }))
				.not.toHaveAttribute('aria-current', 'page');
		});
	});

	describe('Leaderboard Table', () => {
		it('should render table structure', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// Check for table existence via exact text matches for headers
			await expect.element(page.getByText('Rank', { exact: true })).toBeInTheDocument();
			await expect
				.element(page.getByRole('columnheader', { name: 'Developer', exact: true }))
				.toBeInTheDocument();
			await expect.element(page.getByText('Contributions', { exact: true })).toBeInTheDocument();
			await expect.element(page.getByText('Twitter', { exact: true })).toBeInTheDocument();
		});

		it('should render leaderboard entries', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// Check usernames are displayed via exact text matching with link role
			await expect
				.element(page.getByRole('link', { name: 'topdev', exact: true }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('link', { name: 'seconddev', exact: true }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('link', { name: 'thirddev', exact: true }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('link', { name: 'fourthdev', exact: true }))
				.toBeInTheDocument();
		});

		it('should display contribution counts formatted with commas', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect.element(page.getByText('1,500')).toBeInTheDocument();
			await expect.element(page.getByText('1,200')).toBeInTheDocument();
			await expect.element(page.getByText('1,000')).toBeInTheDocument();
		});

		it('should render every rank number in the gutter', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			for (const rank of ['1', '2', '3', '4']) {
				await expect.element(page.getByText(rank, { exact: true }).first()).toBeInTheDocument();
			}
		});

		it('should show a meter for each entry describing its share of the leader', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			const meters = page.getByRole('meter');
			await expect.element(meters.first()).toHaveAttribute('aria-valuenow', '1500');
			await expect.element(meters.first()).toHaveAttribute('aria-valuemax', '1500');
		});

		it('should display display names when available', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect.element(page.getByText('Top Developer')).toBeInTheDocument();
			await expect.element(page.getByText('Second Developer')).toBeInTheDocument();
		});

		it('should display twitter handles when available', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect.element(page.getByText('@topdev')).toBeInTheDocument();
			await expect.element(page.getByText('@third')).toBeInTheDocument();
		});

		it('should display dash for missing twitter handles', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// There should be dash characters for users without twitter - use first() for multiple dashes
			const dashes = page.getByText('-').first();
			await expect.element(dashes).toBeInTheDocument();
		});

		it("should link each row to that developer's CommitRank profile", async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// The row links to /<username> on CommitRank, not out to github.com —
			// github.com is linked from the profile page itself. This assertion
			// previously expected the GitHub URL and had never matched the markup.
			const topdevLink = page.getByRole('link', { name: 'topdev', exact: true });
			await expect.element(topdevLink).toHaveAttribute('href', '/topdev');
		});
	});

	describe('Empty State', () => {
		it('should display empty state message when no entries', async () => {
			render(Page, { props: { data: mockEmptyData } });

			await expect
				.element(page.getByText(/No developers on the leaderboard yet/))
				.toBeInTheDocument();
		});

		it('should display join link in empty state', async () => {
			render(Page, { props: { data: mockEmptyData } });

			const joinLink = page.getByRole('link', { name: 'join' });
			await expect.element(joinLink).toBeInTheDocument();
		});
	});

	describe('Pagination', () => {
		it('should not display pagination when only one page', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			const prevLink = page.getByRole('link', { name: 'Previous' });
			await expect.element(prevLink).not.toBeInTheDocument();
		});

		it('should display pagination controls when multiple pages', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			await expect.element(page.getByRole('link', { name: 'Previous' })).toBeInTheDocument();
			await expect.element(page.getByRole('link', { name: 'Next' })).toBeInTheDocument();
		});

		it('should display current page info', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			await expect.element(page.getByText('Page 2 of 3')).toBeInTheDocument();
		});

		it('should display the total ranked count', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			// "ranked" not "developers": pagination.total counts users ranked in
			// this period, while the status bar's USERS counts every registration.
			await expect.element(page.getByText(/50 ranked/)).toBeInTheDocument();
		});

		it('should enable Previous when not on first page', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			const prevLink = page.getByRole('link', { name: 'Previous' });
			await expect.element(prevLink).toHaveAttribute('href', '/?period=today&page=1');
			await expect.element(prevLink).not.toHaveAttribute('aria-disabled', 'true');
		});

		it('should enable Next when not on last page', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			const nextLink = page.getByRole('link', { name: 'Next' });
			await expect.element(nextLink).toHaveAttribute('href', '/?period=today&page=3');
			await expect.element(nextLink).not.toHaveAttribute('aria-disabled', 'true');
		});

		it('should disable Next on last page', async () => {
			const lastPageData: PageData = {
				...mockPaginatedData,
				leaderboard: {
					...mockPaginatedData.leaderboard,
					pagination: {
						page: 3,
						limit: 20,
						total: 50,
						totalPages: 3
					}
				}
			};
			render(Page, { props: { data: lastPageData } });

			const nextLink = page.getByRole('link', { name: 'Next' });
			await expect.element(nextLink).toHaveAttribute('aria-disabled', 'true');
			await expect.element(nextLink).not.toHaveAttribute('href');
		});

		it('should disable Previous on first page', async () => {
			const firstPageWithPagination: PageData = {
				...mockPaginatedData,
				leaderboard: {
					...mockPaginatedData.leaderboard,
					pagination: {
						page: 1,
						limit: 20,
						total: 50,
						totalPages: 3
					}
				}
			};
			render(Page, { props: { data: firstPageWithPagination } });

			const prevLink = page.getByRole('link', { name: 'Previous' });
			await expect.element(prevLink).toHaveAttribute('aria-disabled', 'true');
			await expect.element(prevLink).not.toHaveAttribute('href');
		});
	});

	describe('SEO Meta Tags', () => {
		it('should set page title', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// Check document title is set
			expect(document.title).toContain('CommitRank');
		});
	});
});
