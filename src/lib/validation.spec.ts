import { describe, it, expect } from 'vitest';
import {
	isValidGitHubUsername,
	isValidTwitterHandle,
	GITHUB_USERNAME_REGEX,
	TWITTER_HANDLE_REGEX
} from './validation';

describe('GitHub Username Validation', () => {
	describe('isValidGitHubUsername', () => {
		it('should accept valid alphanumeric usernames', () => {
			expect(isValidGitHubUsername('octocat')).toBe(true);
			expect(isValidGitHubUsername('github')).toBe(true);
			expect(isValidGitHubUsername('user123')).toBe(true);
			expect(isValidGitHubUsername('Test')).toBe(true);
		});

		it('should accept usernames with hyphens in the middle', () => {
			expect(isValidGitHubUsername('my-repo')).toBe(true);
			expect(isValidGitHubUsername('user-name-here')).toBe(true);
			expect(isValidGitHubUsername('a-b-c')).toBe(true);
		});

		it('should accept single character usernames', () => {
			expect(isValidGitHubUsername('a')).toBe(true);
			expect(isValidGitHubUsername('5')).toBe(true);
		});

		it('should accept usernames up to 39 characters', () => {
			const maxLengthUsername = 'a'.repeat(39);
			expect(isValidGitHubUsername(maxLengthUsername)).toBe(true);
		});

		it('should reject usernames longer than 39 characters', () => {
			const tooLongUsername = 'a'.repeat(40);
			expect(isValidGitHubUsername(tooLongUsername)).toBe(false);
		});

		it('should reject usernames starting with a hyphen', () => {
			expect(isValidGitHubUsername('-username')).toBe(false);
		});

		it('should reject usernames with consecutive hyphens', () => {
			expect(isValidGitHubUsername('user--name')).toBe(false);
		});

		it('should reject usernames ending with a hyphen', () => {
			expect(isValidGitHubUsername('username-')).toBe(false);
		});

		it('should reject usernames with special characters', () => {
			expect(isValidGitHubUsername('user_name')).toBe(false);
			expect(isValidGitHubUsername('user.name')).toBe(false);
			expect(isValidGitHubUsername('user@name')).toBe(false);
			expect(isValidGitHubUsername('user name')).toBe(false);
		});

		it('should reject empty strings', () => {
			expect(isValidGitHubUsername('')).toBe(false);
		});

		it('should reject null and undefined', () => {
			expect(isValidGitHubUsername(null as unknown as string)).toBe(false);
			expect(isValidGitHubUsername(undefined as unknown as string)).toBe(false);
		});

		it('should reject non-string values', () => {
			expect(isValidGitHubUsername(123 as unknown as string)).toBe(false);
			expect(isValidGitHubUsername({} as unknown as string)).toBe(false);
		});
	});

	describe('GITHUB_USERNAME_REGEX', () => {
		it('should be defined and be a RegExp', () => {
			expect(GITHUB_USERNAME_REGEX).toBeInstanceOf(RegExp);
		});
	});
});

describe('Twitter Handle Validation', () => {
	describe('isValidTwitterHandle', () => {
		it('should accept valid alphanumeric handles', () => {
			expect(isValidTwitterHandle('username')).toBe(true);
			expect(isValidTwitterHandle('User123')).toBe(true);
			expect(isValidTwitterHandle('abc')).toBe(true);
		});

		it('should accept handles with underscores', () => {
			expect(isValidTwitterHandle('user_name')).toBe(true);
			expect(isValidTwitterHandle('_username')).toBe(true);
			expect(isValidTwitterHandle('username_')).toBe(true);
			expect(isValidTwitterHandle('_')).toBe(true);
		});

		it('should accept single character handles', () => {
			expect(isValidTwitterHandle('a')).toBe(true);
			expect(isValidTwitterHandle('5')).toBe(true);
		});

		it('should accept handles up to 15 characters', () => {
			const maxLengthHandle = 'a'.repeat(15);
			expect(isValidTwitterHandle(maxLengthHandle)).toBe(true);
		});

		it('should reject handles longer than 15 characters', () => {
			const tooLongHandle = 'a'.repeat(16);
			expect(isValidTwitterHandle(tooLongHandle)).toBe(false);
		});

		it('should reject handles with hyphens', () => {
			expect(isValidTwitterHandle('user-name')).toBe(false);
		});

		it('should reject handles with special characters', () => {
			expect(isValidTwitterHandle('user.name')).toBe(false);
			expect(isValidTwitterHandle('user@name')).toBe(false);
			expect(isValidTwitterHandle('user name')).toBe(false);
			expect(isValidTwitterHandle('user$name')).toBe(false);
		});

		it('should reject empty strings', () => {
			expect(isValidTwitterHandle('')).toBe(false);
		});

		it('should reject null and undefined', () => {
			expect(isValidTwitterHandle(null as unknown as string)).toBe(false);
			expect(isValidTwitterHandle(undefined as unknown as string)).toBe(false);
		});

		it('should reject non-string values', () => {
			expect(isValidTwitterHandle(123 as unknown as string)).toBe(false);
			expect(isValidTwitterHandle({} as unknown as string)).toBe(false);
		});
	});

	describe('TWITTER_HANDLE_REGEX', () => {
		it('should be defined and be a RegExp', () => {
			expect(TWITTER_HANDLE_REGEX).toBeInstanceOf(RegExp);
		});
	});
});
