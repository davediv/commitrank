/**
 * API Response Types for CommitRank
 */

/**
 * Error details returned in API responses
 */
export interface ApiError {
	/** Error code identifier (e.g., 'INVALID_USERNAME', 'USER_NOT_FOUND') */
	code: string;
	/** Human-readable error message */
	message: string;
}

/**
 * Standard API response wrapper
 * All API endpoints should return this format for consistency
 */
export interface ApiResponse<T> {
	/** Indicates if the request was successful */
	success: boolean;
	/** Response data (present when success is true) */
	data?: T;
	/** Error details (present when success is false) */
	error?: ApiError;
	/** Indicates if the response was served from cache */
	cached?: boolean;
	/** ISO timestamp of when the response was generated */
	timestamp: string;
}

/**
 * Pagination metadata for list endpoints
 */
export interface PaginationMeta {
	/** Current page number (1-indexed) */
	page: number;
	/** Number of items per page */
	limit: number;
	/** Total number of items */
	total: number;
	/** Total number of pages */
	totalPages: number;
}

/**
 * Leaderboard entry for a single user
 */
export interface LeaderboardEntry {
	/** Position on the leaderboard (1-indexed) */
	rank: number;
	/** GitHub username */
	github_username: string;
	/** Display name from GitHub profile */
	display_name: string | null;
	/** GitHub avatar URL */
	avatar_url: string | null;
	/** Twitter/X handle */
	twitter_handle: string | null;
	/** Total contribution count for the period */
	contributions: number;
}

/**
 * Response data for leaderboard endpoint
 */
export interface LeaderboardResponse {
	/** Array of leaderboard entries */
	leaderboard: LeaderboardEntry[];
	/** Pagination metadata */
	pagination: PaginationMeta;
}

/**
 * Time period options for contribution filtering
 */
export type ContributionPeriod = 'today' | '7days' | '30days' | 'year';

/**
 * Contribution data for a specific period
 */
export interface PeriodContribution {
	/** Time period */
	period: ContributionPeriod;
	/** Total contributions for this period */
	contributions: number;
	/** User's rank for this period */
	rank: number;
}

/**
 * User profile data returned by API
 */
export interface UserProfile {
	/** Database ID */
	id: number;
	/** GitHub username */
	github_username: string;
	/** GitHub user ID */
	github_id: number;
	/** Display name from GitHub profile */
	display_name: string | null;
	/** GitHub avatar URL */
	avatar_url: string | null;
	/** Bio from GitHub profile */
	bio: string | null;
	/** Twitter/X handle */
	twitter_handle: string | null;
	/** Location from GitHub profile */
	location: string | null;
	/** Company from GitHub profile */
	company: string | null;
	/** Blog/website URL */
	blog: string | null;
	/** Number of public repositories */
	public_repos: number;
	/** Follower count */
	followers: number;
	/** Following count */
	following: number;
	/** When the GitHub account was created */
	github_created_at: string;
	/** When the user joined CommitRank */
	created_at: string;
	/** Last update timestamp */
	updated_at: string;
	/** Contribution data for all periods */
	contributions: PeriodContribution[];
}

/**
 * Request body for user registration
 */
export interface CreateUserRequest {
	/** GitHub username (required) */
	github_username: string;
	/** Twitter/X handle (optional) */
	twitter_handle?: string;
}

/**
 * Request body for user update
 */
export interface UpdateUserRequest {
	/** Twitter/X handle */
	twitter_handle?: string | null;
}

/**
 * Common API error codes
 */
export const API_ERROR_CODES = {
	// User-related errors
	INVALID_USERNAME: 'INVALID_USERNAME',
	INVALID_TWITTER: 'INVALID_TWITTER',
	USER_NOT_FOUND: 'USER_NOT_FOUND',
	USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
	GITHUB_USER_NOT_FOUND: 'GITHUB_USER_NOT_FOUND',

	// Validation errors
	INVALID_PERIOD: 'INVALID_PERIOD',
	INVALID_PAGINATION: 'INVALID_PAGINATION',

	// Server errors
	INTERNAL_ERROR: 'INTERNAL_ERROR',
	GITHUB_API_ERROR: 'GITHUB_API_ERROR',
	RATE_LIMITED: 'RATE_LIMITED'
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * Helper function to create a success response
 */
export function createSuccessResponse<T>(data: T, options?: { cached?: boolean }): ApiResponse<T> {
	return {
		success: true,
		data,
		cached: options?.cached,
		timestamp: new Date().toISOString()
	};
}

/**
 * Helper function to create an error response
 */
export function createErrorResponse(code: string, message: string): ApiResponse<never> {
	return {
		success: false,
		error: { code, message },
		timestamp: new Date().toISOString()
	};
}
