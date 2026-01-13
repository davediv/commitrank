-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    github_username TEXT NOT NULL UNIQUE,
    github_id INTEGER NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    location TEXT,
    company TEXT,
    blog TEXT,
    twitter_handle TEXT,
    public_repos INTEGER DEFAULT 0,
    followers INTEGER DEFAULT 0,
    following INTEGER DEFAULT 0,
    github_created_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create contributions table
CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    commit_count INTEGER NOT NULL DEFAULT 0,
    pr_count INTEGER NOT NULL DEFAULT 0,
    issue_count INTEGER NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    total_contributions INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS users_github_username_idx ON users(github_username);
CREATE INDEX IF NOT EXISTS users_updated_at_idx ON users(updated_at);

-- Create indexes for contributions table
-- user_id_idx: Efficient lookup of all contributions for a user
CREATE INDEX IF NOT EXISTS contributions_user_id_idx ON contributions(user_id);
-- date_idx: Filter contributions by date range
CREATE INDEX IF NOT EXISTS contributions_date_idx ON contributions(date);
-- user_date_idx: Composite for user+date lookups (used in sync)
CREATE INDEX IF NOT EXISTS contributions_user_date_idx ON contributions(user_id, date);
-- total_contributions_idx: Order by contribution count
CREATE INDEX IF NOT EXISTS contributions_total_contributions_idx ON contributions(total_contributions);
-- date_total_idx: Covering index for leaderboard aggregation queries
-- (optimizes: GROUP BY with date range filter and SUM aggregation)
CREATE INDEX IF NOT EXISTS contributions_date_total_idx ON contributions(date, total_contributions);
