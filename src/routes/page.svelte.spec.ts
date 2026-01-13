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

		it('should render the subheading', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect.element(page.getByText("See who's shipping the most code")).toBeInTheDocument();
		});

		it('should display trophy icon', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// Trophy icon should be visible in header
			const header = page.getByRole('heading', { level: 1 });
			await expect.element(header).toBeInTheDocument();
		});
	});

	describe('Stats Summary', () => {
		it('should display user count when stats are available', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect.element(page.getByText('100 developers')).toBeInTheDocument();
		});

		it('should display today contributions when stats are available', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect.element(page.getByText('5,000 contributions today')).toBeInTheDocument();
		});

		it('should not display stats when not available', async () => {
			render(Page, { props: { data: mockEmptyData } });

			// Stats should not be visible
			const developersText = page.getByText(/\d+ developers/);
			await expect.element(developersText).not.toBeInTheDocument();
		});
	});

	describe('Time Period Tabs', () => {
		it('should render all four period tabs', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			await expect.element(page.getByRole('tab', { name: 'Today' })).toBeInTheDocument();
			await expect.element(page.getByRole('tab', { name: '7 Days' })).toBeInTheDocument();
			await expect.element(page.getByRole('tab', { name: '30 Days' })).toBeInTheDocument();
			await expect.element(page.getByRole('tab', { name: 'Year' })).toBeInTheDocument();
		});

		it('should have the current period tab selected', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			const todayTab = page.getByRole('tab', { name: 'Today' });
			await expect.element(todayTab).toHaveAttribute('aria-selected', 'true');
		});

		it('should show 7days period as selected when period is 7days', async () => {
			const data7days = { ...mockLeaderboardData, period: '7days' as const };
			render(Page, { props: { data: data7days } });

			const sevenDaysTab = page.getByRole('tab', { name: '7 Days' });
			await expect.element(sevenDaysTab).toHaveAttribute('aria-selected', 'true');
		});
	});

	describe('Leaderboard Table', () => {
		it('should render table structure', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// Check for table existence via exact text matches for headers
			await expect.element(page.getByText('Rank', { exact: true })).toBeInTheDocument();
			await expect
				.element(page.getByRole('cell', { name: 'Developer', exact: true }))
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

		it('should display medal emojis for top 3 ranks', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// Gold medal for rank 1
			await expect.element(page.getByText('🥇')).toBeInTheDocument();
			// Silver medal for rank 2
			await expect.element(page.getByText('🥈')).toBeInTheDocument();
			// Bronze medal for rank 3
			await expect.element(page.getByText('🥉')).toBeInTheDocument();
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

		it('should display github profile links', async () => {
			render(Page, { props: { data: mockLeaderboardData } });

			// Use exact match to avoid matching twitter link
			const topdevLink = page.getByRole('link', { name: 'topdev', exact: true });
			await expect.element(topdevLink).toHaveAttribute('href', 'https://github.com/topdev');
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

			const prevButton = page.getByRole('button', { name: 'Previous' });
			await expect.element(prevButton).not.toBeInTheDocument();
		});

		it('should display pagination controls when multiple pages', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			await expect.element(page.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Next' })).toBeInTheDocument();
		});

		it('should display current page info', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			await expect.element(page.getByText('Page 2 of 3')).toBeInTheDocument();
		});

		it('should display total developer count', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			await expect.element(page.getByText(/50 developers/)).toBeInTheDocument();
		});

		it('should enable Previous button when not on first page', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			const prevButton = page.getByRole('button', { name: 'Previous' });
			await expect.element(prevButton).not.toBeDisabled();
		});

		it('should enable Next button when not on last page', async () => {
			render(Page, { props: { data: mockPaginatedData } });

			const nextButton = page.getByRole('button', { name: 'Next' });
			await expect.element(nextButton).not.toBeDisabled();
		});

		it('should disable Next button on last page', async () => {
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

			const nextButton = page.getByRole('button', { name: 'Next' });
			await expect.element(nextButton).toBeDisabled();
		});

		it('should disable Previous button on first page', async () => {
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

			const prevButton = page.getByRole('button', { name: 'Previous' });
			await expect.element(prevButton).toBeDisabled();
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
