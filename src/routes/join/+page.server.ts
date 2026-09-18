import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { createDb } from '$lib/server/db';
import { insertContributions } from '$lib/server/db/contribution-inserts';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { API_ERROR_CODES } from '$lib/types';
import { isValidGitHubUsername, isValidTwitterHandle } from '$lib/validation';
import { fetchContributions, GitHubApiError } from '$lib/server/github';
import { invalidateLeaderboardCache, deleteCached, statsKey } from '$lib/server/cache';
import { checkRateLimit, rateLimitKey, RATE_LIMITS } from '$lib/server/ratelimit';
import { createLogger } from '$lib/server/logger';
import { cacheAvatarInBackground } from '$lib/server/avatar';
import { calculateTodayRank } from '$lib/server/user-profile';

export const actions: Actions = {
	default: async ({ request, platform, getClientAddress, cookies }) => {
		const log = createLogger('Join');
		log.info('Registration request received');

		// Rate limit check
		log.time('rate-limit-check');
		const kv = platform!.env.KV;
		const clientIp = getClientAddress();
		const rateLimitResult = await checkRateLimit(
			kv,
			rateLimitKey(clientIp, 'register'),
			RATE_LIMITS.REGISTER.limit,
			RATE_LIMITS.REGISTER.windowSeconds
		);
		log.timeEnd('rate-limit-check');

		if (!rateLimitResult.allowed) {
			log.warn('Rate limit exceeded', { clientIp, resetIn: rateLimitResult.resetIn });
			return fail(429, {
				error: API_ERROR_CODES.RATE_LIMITED,
				message: `Rate limit exceeded. Try again in ${Math.ceil(rateLimitResult.resetIn / 60)} minutes.`
			});
		}

		// Parse form data
		const formData = await request.formData();
		const github_username = formData.get('github_username')?.toString().trim() || '';
		const twitter_handle = formData.get('twitter_handle')?.toString().trim() || '';
		log.info('Form data parsed', { github_username, twitter_handle: twitter_handle || '(none)' });

		// Validate github_username is present
		if (!github_username) {
			log.warn('Validation failed: empty username');
			return fail(400, {
				error: API_ERROR_CODES.INVALID_USERNAME,
				message: 'GitHub username is required',
				github_username,
				twitter_handle
			});
		}

		// Validate github_username format
		if (!isValidGitHubUsername(github_username)) {
			log.warn('Validation failed: invalid username format', { github_username });
			return fail(400, {
				error: API_ERROR_CODES.INVALID_USERNAME,
				message:
					'Invalid GitHub username format. Must be 1-39 characters, alphanumeric or hyphen, cannot start/end with hyphen',
				github_username,
				twitter_handle
			});
		}

		// Validate twitter_handle format if provided
		if (twitter_handle && !isValidTwitterHandle(twitter_handle)) {
			log.warn('Validation failed: invalid twitter handle', { twitter_handle });
			return fail(400, {
				error: API_ERROR_CODES.INVALID_TWITTER,
				message:
					'Invalid Twitter handle format. Must be 1-15 characters, alphanumeric or underscore',
				github_username,
				twitter_handle
			});
		}

		const db = createDb(platform!.env.DB);
		const githubToken = platform!.env.GITHUB_TOKEN;
		const isProduction = platform?.env?.ENVIRONMENT === 'production';
		log.debug('Environment', { isProduction });

		// Check if user already exists
		log.time('check-existing-user');
		const existingUser = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.github_username, github_username.toLowerCase()))
			.limit(1);
		log.timeEnd('check-existing-user');

		if (existingUser.length > 0) {
			log.warn('User already exists', { github_username });
			return fail(409, {
				error: API_ERROR_CODES.USER_ALREADY_EXISTS,
				message: `User '${github_username}' is already registered`,
				github_username,
				twitter_handle
			});
		}

		// Fetch user data and contributions from GitHub
		try {
			log.time('github-api');
			log.info('Fetching GitHub data', { github_username });
			const githubData = await fetchContributions(github_username, githubToken);
			log.timeEnd('github-api');
			log.info('GitHub data received', {
				login: githubData.user.login,
				totalContributions: githubData.contributions.totalContributions,
				daysWithData: githubData.contributions.days.length
			});

			const githubId = githubData.user.databaseId;

			// Insert new user
			log.time('insert-user');
			log.info('Inserting user record');
			const newUser = await db
				.insert(users)
				.values({
					github_username: githubData.user.login,
					github_id: githubId,
					display_name: githubData.user.name,
					avatar_url: githubData.user.avatarUrl,
					bio: githubData.user.bio,
					location: githubData.user.location,
					company: githubData.user.company,
					blog: githubData.user.websiteUrl,
					twitter_handle: twitter_handle || githubData.user.twitterUsername || null,
					public_repos: githubData.user.repositories,
					followers: githubData.user.followers,
					following: githubData.user.following,
					github_created_at: githubData.user.createdAt
				})
				.returning();
			log.timeEnd('insert-user');

			const insertedUser = newUser[0];
			log.info('User inserted successfully', { userId: insertedUser.id });

			// Batch bounded statements within D1's 100-parameter limit.
			if (githubData.contributions.days.length > 0) {
				const contributionValues = githubData.contributions.days
					.filter((day) => day.contributionCount > 0)
					.map((day) => ({
						user_id: insertedUser.id,
						date: day.date,
						commit_count: day.contributionCount,
						pr_count: 0,
						issue_count: 0,
						review_count: 0,
						total_contributions: day.contributionCount
					}));

				log.info('Preparing contribution inserts', {
					totalDays: githubData.contributions.days.length,
					daysWithContributions: contributionValues.length
				});

				log.time('insert-contributions-batch');
				await insertContributions(db, contributionValues);
				log.timeEnd('insert-contributions-batch');
			} else {
				log.info('No contribution days to insert');
			}

			// Calculate initial rank
			log.time('calculate-rank');
			const rank = await calculateTodayRank(db, insertedUser.id);
			log.timeEnd('calculate-rank');
			log.info('Rank calculated', { rank });

			// Invalidate cache
			log.time('invalidate-cache');
			await Promise.all([invalidateLeaderboardCache(kv), deleteCached(kv, statsKey())]);
			log.timeEnd('invalidate-cache');
			log.info('Cache invalidated');

			// Cache avatar in background (fire-and-forget)
			if (githubData.user.avatarUrl && platform?.ctx) {
				cacheAvatarInBackground(
					platform.ctx,
					kv,
					insertedUser.github_username,
					githubData.user.avatarUrl
				);
			}

			// Store success info in a cookie for display after redirect
			cookies.set(
				'join_success',
				JSON.stringify({
					username: insertedUser.github_username,
					rank,
					contributions: githubData.contributions.totalContributions
				}),
				{
					path: '/',
					maxAge: 60, // 1 minute
					httpOnly: false
				}
			);

			log.info('Registration complete', {
				username: insertedUser.github_username,
				rank,
				totalContributions: githubData.contributions.totalContributions
			});

			// Redirect to homepage with success
			redirect(303, '/');
		} catch (error) {
			// Re-throw redirects - they're not errors, they're control flow
			if (isRedirect(error)) {
				throw error;
			}

			if (error instanceof GitHubApiError) {
				log.error('GitHub API error', { type: error.type, message: error.message });
				if (error.type === 'NOT_FOUND') {
					return fail(404, {
						error: API_ERROR_CODES.GITHUB_USER_NOT_FOUND,
						message: `GitHub user '${github_username}' not found`,
						github_username,
						twitter_handle
					});
				}
				if (error.type === 'RATE_LIMITED') {
					return fail(429, {
						error: API_ERROR_CODES.RATE_LIMITED,
						message: 'GitHub API rate limit exceeded. Please try again later.',
						github_username,
						twitter_handle
					});
				}
				if (error.type === 'UNAUTHORIZED') {
					return fail(500, {
						error: API_ERROR_CODES.GITHUB_API_ERROR,
						message: 'GitHub API authentication error',
						github_username,
						twitter_handle
					});
				}
			}

			log.error('Registration failed with unexpected error', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			return fail(500, {
				error: API_ERROR_CODES.INTERNAL_ERROR,
				message: 'An internal error occurred. Please try again later.',
				github_username,
				twitter_handle
			});
		}
	}
};
