import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { contributions } from '$lib/server/db/schema';
import { eq, gte, asc, and } from 'drizzle-orm';
import type { ProfilePageData, ContributionDayData } from '$lib/types';
import { isValidGitHubUsername } from '$lib/validation';
import { getCached, setCached, profilePageKey, CACHE_TTL } from '$lib/server/cache';
import {
	computePeriodContributions,
	findUserByUsername,
	buildUserProfile
} from '$lib/server/user-profile';

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	const { username } = params;

	if (!username || !isValidGitHubUsername(username)) {
		error(404, 'User not found');
	}

	const kv = platform!.env.KV;
	const cacheKey = profilePageKey(username);

	try {
		// Check cache first
		const cached = await getCached<ProfilePageData>(kv, cacheKey);
		if (cached) {
			setHeaders({ 'Cache-Control': 'public, max-age=60' });
			return { ...cached, cached: true };
		}

		// Cache miss — query database
		const db = createDb(platform!.env.DB);

		const user = await findUserByUsername(db, username);
		if (!user) {
			error(404, 'User not found');
		}

		// Calculate date range for daily contributions (past ~370 days for full heatmap)
		const yearAgo = new Date();
		yearAgo.setDate(yearAgo.getDate() - 370);
		const startDate = yearAgo.toISOString().split('T')[0];

		// Run period contributions and daily data queries in parallel
		const [periodContributions, dailyResult] = await Promise.all([
			computePeriodContributions(db, user.id),
			db
				.select({
					date: contributions.date,
					total: contributions.total_contributions
				})
				.from(contributions)
				.where(and(eq(contributions.user_id, user.id), gte(contributions.date, startDate)))
				.orderBy(asc(contributions.date))
		]);

		const dailyContributions: ContributionDayData[] = dailyResult.map((row) => ({
			date: row.date,
			count: row.total
		}));

		const profile = buildUserProfile(user, periodContributions);
		const pageData: ProfilePageData = { profile, dailyContributions };

		// Cache the full payload
		await setCached(kv, cacheKey, pageData, CACHE_TTL.USER);

		setHeaders({ 'Cache-Control': 'public, max-age=30' });

		return { ...pageData, cached: false };
	} catch (err) {
		// Re-throw SvelteKit errors (404, etc.)
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Profile load error:', err);
		error(500, 'Failed to load profile');
	}
};
