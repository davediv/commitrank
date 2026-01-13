/**
 * Validation Utilities for CommitRank
 *
 * Provides validation functions for user input including
 * GitHub usernames and Twitter handles.
 */

/**
 * GitHub username validation regex
 * Rules:
 * - Must start with alphanumeric character
 * - Can contain alphanumeric characters and hyphens
 * - Hyphen cannot appear consecutively or at the end
 * - Maximum 39 characters
 */
export const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

/**
 * Twitter/X handle validation regex
 * Rules:
 * - 1-15 characters
 * - Alphanumeric and underscores only
 */
export const TWITTER_HANDLE_REGEX = /^[a-zA-Z0-9_]{1,15}$/;

/**
 * Validate a GitHub username
 *
 * @param username - The username to validate
 * @returns true if valid, false otherwise
 */
export function isValidGitHubUsername(username: string): boolean {
	if (!username || typeof username !== 'string') {
		return false;
	}
	return GITHUB_USERNAME_REGEX.test(username);
}

/**
 * Validate a Twitter/X handle
 *
 * @param handle - The handle to validate (without @ prefix)
 * @returns true if valid, false otherwise
 */
export function isValidTwitterHandle(handle: string): boolean {
	if (!handle || typeof handle !== 'string') {
		return false;
	}
	return TWITTER_HANDLE_REGEX.test(handle);
}
