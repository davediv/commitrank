import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	createSuccessResponse,
	createErrorResponse,
	API_ERROR_CODES,
	type UserProfile,
	type UpdateUserRequest
} from '$lib/types';
import { isValidGitHubUsername, TWITTER_HANDLE_REGEX } from '$lib/validation';
import {
	getCached,
	setCached,
	deleteCached,
	userKey,
	profilePageKey,
	CACHE_TTL
} from '$lib/server/cache';
import { checkRateLimit, rateLimitKey, RATE_LIMITS } from '$lib/server/ratelimit';
import {
	computePeriodContributions,
	findUserByUsername,
	buildUserProfile
} from '$lib/server/user-profile';

export const GET: RequestHandler = async ({ params, platform }) => {
	const { username } = params;

	// Validate username format
	if (!username || !isValidGitHubUsername(username)) {
		return json(
			createErrorResponse(API_ERROR_CODES.INVALID_USERNAME, 'Invalid GitHub username format'),
			{ status: 400 }
		);
	}

	try {
		const kv = platform!.env.KV;
		const cacheKey = userKey(username);

		// Check cache first
		const cachedProfile = await getCached<UserProfile>(kv, cacheKey);
		if (cachedProfile) {
			return json(createSuccessResponse(cachedProfile, { cached: true }));
		}

		// Cache miss - query database
		const db = createDb(platform!.env.DB);

		const user = await findUserByUsername(db, username);
		if (!user) {
			return json(
				createErrorResponse(API_ERROR_CODES.USER_NOT_FOUND, `User '${username}' not found`),
				{ status: 404 }
			);
		}

		// Fetch contributions and ranks for all periods
		const periodContributions = await computePeriodContributions(db, user.id);
		const userProfile: UserProfile = buildUserProfile(user, periodContributions);

		// Cache the response
		await setCached(kv, cacheKey, userProfile, CACHE_TTL.USER);

		return json(createSuccessResponse(userProfile, { cached: false }));
	} catch (error) {
		console.error('User API error:', error);
		return json(createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred'), {
			status: 500
		});
	}
};

export const PATCH: RequestHandler = async ({ params, request, platform, getClientAddress }) => {
	const { username } = params;

	// Validate username format
	if (!username || !isValidGitHubUsername(username)) {
		return json(
			createErrorResponse(API_ERROR_CODES.INVALID_USERNAME, 'Invalid GitHub username format'),
			{ status: 400 }
		);
	}

	// Rate limit check
	const kv = platform!.env.KV;
	const clientIp = getClientAddress();
	const rateLimitResult = await checkRateLimit(
		kv,
		rateLimitKey(clientIp, 'update_user'),
		RATE_LIMITS.UPDATE_USER.limit,
		RATE_LIMITS.UPDATE_USER.windowSeconds
	);

	if (!rateLimitResult.allowed) {
		return json(
			createErrorResponse(
				API_ERROR_CODES.RATE_LIMITED,
				`Rate limit exceeded. Try again in ${Math.ceil(rateLimitResult.resetIn / 60)} minutes.`
			),
			{
				status: 429,
				headers: {
					'Retry-After': rateLimitResult.resetIn.toString(),
					'X-RateLimit-Limit': RATE_LIMITS.UPDATE_USER.limit.toString(),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': Math.ceil(Date.now() / 1000 + rateLimitResult.resetIn).toString()
				}
			}
		);
	}

	// Parse request body
	let body: UpdateUserRequest;
	try {
		body = await request.json();
	} catch {
		return json(createErrorResponse(API_ERROR_CODES.INVALID_TWITTER, 'Invalid JSON body'), {
			status: 400
		});
	}

	const { twitter_handle } = body;

	// Validate twitter_handle format if provided and not null
	if (twitter_handle !== undefined && twitter_handle !== null && twitter_handle !== '') {
		if (typeof twitter_handle !== 'string' || !TWITTER_HANDLE_REGEX.test(twitter_handle)) {
			return json(
				createErrorResponse(
					API_ERROR_CODES.INVALID_TWITTER,
					'Invalid Twitter handle format. Must be 1-15 characters, alphanumeric or underscore'
				),
				{ status: 400 }
			);
		}
	}

	try {
		const db = createDb(platform!.env.DB);

		// Check if user exists
		const userResult = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.github_username, username))
			.limit(1);

		if (userResult.length === 0) {
			return json(
				createErrorResponse(API_ERROR_CODES.USER_NOT_FOUND, `User '${username}' not found`),
				{ status: 404 }
			);
		}

		// Update user
		const updatedUsers = await db
			.update(users)
			.set({
				twitter_handle: twitter_handle === '' ? null : twitter_handle,
				updated_at: new Date().toISOString()
			})
			.where(eq(users.github_username, username))
			.returning();

		const updatedUser = updatedUsers[0];

		// Invalidate user caches
		await Promise.all([
			deleteCached(kv, userKey(username)),
			deleteCached(kv, profilePageKey(username))
		]);

		return json(
			createSuccessResponse({
				id: updatedUser.id,
				github_username: updatedUser.github_username,
				display_name: updatedUser.display_name,
				avatar_url: updatedUser.avatar_url,
				twitter_handle: updatedUser.twitter_handle,
				updated_at: updatedUser.updated_at
			})
		);
	} catch (error) {
		console.error('User update error:', error);
		return json(createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, 'An internal error occurred'), {
			status: 500
		});
	}
};
