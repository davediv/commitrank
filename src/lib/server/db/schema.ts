import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';

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

/**
 * Contributions table - stores daily contribution data for each user
 */
export const contributions = sqliteTable(
	'contributions',
	{
		// Primary key
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),

		// Foreign key to users table
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),

		// Date of contributions (YYYY-MM-DD format)
		date: text('date').notNull(),

		// Contribution counts by type
		commit_count: integer('commit_count').notNull().default(0),
		pr_count: integer('pr_count').notNull().default(0),
		issue_count: integer('issue_count').notNull().default(0),
		review_count: integer('review_count').notNull().default(0),

		// Total contributions for the day
		total_contributions: integer('total_contributions').notNull().default(0),

		// Timestamp
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(table) => [
		// Unique constraint on (user_id, date) combination
		unique('contributions_user_date_unique').on(table.user_id, table.date)
	]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
	contributions: many(contributions)
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
	user: one(users, {
		fields: [contributions.user_id],
		references: [users.id]
	})
}));

// Type exports for Contribution model
export type Contribution = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
