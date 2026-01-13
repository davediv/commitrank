import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Users table - stores GitHub user profiles registered on CommitRank
 */
export const users = sqliteTable('users', {
	// Primary key
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),

	// GitHub identifiers (unique constraints)
	github_username: text('github_username').notNull().unique(),
	github_id: integer('github_id').notNull().unique(),

	// Profile information from GitHub
	display_name: text('display_name'),
	avatar_url: text('avatar_url'),
	bio: text('bio'),
	location: text('location'),
	company: text('company'),
	blog: text('blog'),

	// Social
	twitter_handle: text('twitter_handle'),

	// GitHub stats
	public_repos: integer('public_repos').default(0),
	followers: integer('followers').default(0),
	following: integer('following').default(0),

	// GitHub account creation date
	github_created_at: text('github_created_at'),

	// Timestamps
	created_at: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`),
	updated_at: text('updated_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

// Type exports for User model
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
