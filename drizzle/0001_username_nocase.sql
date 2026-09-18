-- Non-unique: preserves existing case-sensitive username uniqueness semantics.
CREATE INDEX IF NOT EXISTS users_github_username_nocase_idx
ON users(github_username COLLATE NOCASE);
