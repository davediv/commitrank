/**
 * GitHub API Client for CommitRank
 *
 * Provides functions to validate GitHub users and fetch contribution data
 * using the GitHub REST and GraphQL APIs.
 */

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

/**
 * Error types from GitHub API
 */
export type GitHubErrorType = 'NOT_FOUND' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'API_ERROR';

export class GitHubApiError extends Error {
	constructor(
		public type: GitHubErrorType,
		message: string,
		public statusCode?: number
	) {
		super(message);
		this.name = 'GitHubApiError';
	}
}

/**
 * GitHub user data from REST API
 */
export interface GitHubUser {
	id: number;
	login: string;
	name: string | null;
	avatar_url: string;
	bio: string | null;
	location: string | null;
	company: string | null;
	blog: string | null;
	twitter_username: string | null;
	public_repos: number;
	followers: number;
	following: number;
	created_at: string;
}

/**
 * Contribution day data
 */
export interface ContributionDay {
	date: string; // YYYY-MM-DD
	contributionCount: number;
}

/**
 * Parsed contribution data from GraphQL
 */
export interface GitHubContributionData {
	user: {
		login: string;
		id: string;
		name: string | null;
		avatarUrl: string;
		bio: string | null;
		location: string | null;
		company: string | null;
		websiteUrl: string | null;
		twitterUsername: string | null;
		followers: number;
		following: number;
		repositories: number;
		createdAt: string;
	};
	contributions: {
		totalContributions: number;
		totalCommitContributions: number;
		totalPullRequestContributions: number;
		totalIssueContributions: number;
		totalPullRequestReviewContributions: number;
		restrictedContributionsCount: number;
		days: ContributionDay[];
	};
}

/**
 * GraphQL query for fetching user contributions
 */
const CONTRIBUTION_QUERY = `
query GetUserContributions($username: String!) {
  user(login: $username) {
    login
    id
    name
    avatarUrl
    bio
    location
    company
    websiteUrl
    twitterUsername
    followers {
      totalCount
    }
    following {
      totalCount
    }
    repositories {
      totalCount
    }
    createdAt
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
    }
  }
}
`;

/**
 * Validate that a GitHub user exists using the REST API
 *
 * @param username - GitHub username to validate
 * @param token - GitHub API token
 * @returns User data if exists
 * @throws GitHubApiError if user doesn't exist or rate limited
 */
export async function validateGitHubUser(username: string, token: string): Promise<GitHubUser> {
	const response = await fetch(`${GITHUB_API_URL}/users/${username}`, {
		headers: {
			Accept: 'application/vnd.github.v3+json',
			Authorization: `Bearer ${token}`,
			'User-Agent': 'CommitRank/1.0'
		}
	});

	if (response.status === 404) {
		throw new GitHubApiError('NOT_FOUND', `GitHub user '${username}' not found`, 404);
	}

	if (response.status === 403) {
		throw new GitHubApiError('RATE_LIMITED', 'GitHub API rate limit exceeded', 403);
	}

	if (response.status === 401) {
		throw new GitHubApiError('UNAUTHORIZED', 'Invalid GitHub token', 401);
	}

	if (!response.ok) {
		throw new GitHubApiError(
			'API_ERROR',
			`GitHub API error: ${response.status} ${response.statusText}`,
			response.status
		);
	}

	return response.json() as Promise<GitHubUser>;
}

/**
 * Fetch contribution data for a GitHub user using the GraphQL API
 *
 * @param username - GitHub username
 * @param token - GitHub API token
 * @returns Parsed contribution data
 * @throws GitHubApiError if user doesn't exist, rate limited, or API error
 */
export async function fetchContributions(
	username: string,
	token: string
): Promise<GitHubContributionData> {
	const response = await fetch(GITHUB_GRAPHQL_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			'User-Agent': 'CommitRank/1.0'
		},
		body: JSON.stringify({
			query: CONTRIBUTION_QUERY,
			variables: { username }
		})
	});

	if (response.status === 403) {
		throw new GitHubApiError('RATE_LIMITED', 'GitHub API rate limit exceeded', 403);
	}

	if (response.status === 401) {
		throw new GitHubApiError('UNAUTHORIZED', 'Invalid GitHub token', 401);
	}

	if (!response.ok) {
		throw new GitHubApiError(
			'API_ERROR',
			`GitHub API error: ${response.status} ${response.statusText}`,
			response.status
		);
	}

	const data = (await response.json()) as {
		data?: {
			user: {
				login: string;
				id: string;
				name: string | null;
				avatarUrl: string;
				bio: string | null;
				location: string | null;
				company: string | null;
				websiteUrl: string | null;
				twitterUsername: string | null;
				followers: { totalCount: number };
				following: { totalCount: number };
				repositories: { totalCount: number };
				createdAt: string;
				contributionsCollection: {
					contributionCalendar: {
						totalContributions: number;
						weeks: Array<{
							contributionDays: Array<{
								date: string;
								contributionCount: number;
							}>;
						}>;
					};
					totalCommitContributions: number;
					totalPullRequestContributions: number;
					totalIssueContributions: number;
					totalPullRequestReviewContributions: number;
					restrictedContributionsCount: number;
				};
			} | null;
		};
		errors?: Array<{ message: string }>;
	};

	if (data.errors && data.errors.length > 0) {
		const errorMessage = data.errors[0].message;
		if (errorMessage.toLowerCase().includes('not found')) {
			throw new GitHubApiError('NOT_FOUND', `GitHub user '${username}' not found`, 404);
		}
		throw new GitHubApiError('API_ERROR', `GitHub GraphQL error: ${errorMessage}`);
	}

	if (!data.data?.user) {
		throw new GitHubApiError('NOT_FOUND', `GitHub user '${username}' not found`, 404);
	}

	const user = data.data.user;
	const contrib = user.contributionsCollection;

	// Flatten contribution days from weeks
	const days: ContributionDay[] = contrib.contributionCalendar.weeks.flatMap((week) =>
		week.contributionDays.map((day) => ({
			date: day.date,
			contributionCount: day.contributionCount
		}))
	);

	return {
		user: {
			login: user.login,
			id: user.id,
			name: user.name,
			avatarUrl: user.avatarUrl,
			bio: user.bio,
			location: user.location,
			company: user.company,
			websiteUrl: user.websiteUrl,
			twitterUsername: user.twitterUsername,
			followers: user.followers.totalCount,
			following: user.following.totalCount,
			repositories: user.repositories.totalCount,
			createdAt: user.createdAt
		},
		contributions: {
			totalContributions: contrib.contributionCalendar.totalContributions,
			totalCommitContributions: contrib.totalCommitContributions,
			totalPullRequestContributions: contrib.totalPullRequestContributions,
			totalIssueContributions: contrib.totalIssueContributions,
			totalPullRequestReviewContributions: contrib.totalPullRequestReviewContributions,
			restrictedContributionsCount: contrib.restrictedContributionsCount,
			days
		}
	};
}

/**
 * Extract numeric GitHub ID from GraphQL node ID
 * GraphQL returns ID like "MDQ6VXNlcjEyMzQ1Njc4" which is base64 encoded
 *
 * @param nodeId - GraphQL node ID
 * @returns Numeric user ID or 0 if parsing fails
 */
export function parseGitHubNodeId(nodeId: string): number {
	try {
		// Try to decode base64 - the format is like "04:User123456789"
		const decoded = atob(nodeId);
		const match = decoded.match(/User(\d+)/);
		if (match) {
			return parseInt(match[1], 10);
		}
	} catch {
		// Ignore decode errors
	}
	return 0;
}
