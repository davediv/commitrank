import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSuccessResponse, createErrorResponse, API_ERROR_CODES } from './types';

describe('API Response Helpers', () => {
	describe('createSuccessResponse', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should create a success response with data', () => {
			const data = { id: 1, name: 'test' };
			const response = createSuccessResponse(data);

			expect(response.success).toBe(true);
			expect(response.data).toEqual(data);
			expect(response.timestamp).toBe('2024-01-15T12:00:00.000Z');
		});

		it('should include cached flag when provided', () => {
			const data = { id: 1 };
			const response = createSuccessResponse(data, { cached: true });

			expect(response.cached).toBe(true);
		});

		it('should not include cached flag when not provided', () => {
			const data = { id: 1 };
			const response = createSuccessResponse(data);

			expect(response.cached).toBeUndefined();
		});

		it('should work with null data', () => {
			const response = createSuccessResponse(null);

			expect(response.success).toBe(true);
			expect(response.data).toBeNull();
		});

		it('should work with array data', () => {
			const data = [1, 2, 3];
			const response = createSuccessResponse(data);

			expect(response.data).toEqual([1, 2, 3]);
		});
	});

	describe('createErrorResponse', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should create an error response with code and message', () => {
			const response = createErrorResponse('TEST_ERROR', 'Test error message');

			expect(response.success).toBe(false);
			expect(response.error).toEqual({
				code: 'TEST_ERROR',
				message: 'Test error message'
			});
			expect(response.timestamp).toBe('2024-01-15T12:00:00.000Z');
		});

		it('should not include data field', () => {
			const response = createErrorResponse('TEST_ERROR', 'Test error message');

			expect(response.data).toBeUndefined();
		});

		it('should work with API_ERROR_CODES', () => {
			const response = createErrorResponse(
				API_ERROR_CODES.INVALID_USERNAME,
				'Invalid GitHub username'
			);

			expect(response.error?.code).toBe('INVALID_USERNAME');
		});
	});

	describe('API_ERROR_CODES', () => {
		it('should have user-related error codes', () => {
			expect(API_ERROR_CODES.INVALID_USERNAME).toBe('INVALID_USERNAME');
			expect(API_ERROR_CODES.INVALID_TWITTER).toBe('INVALID_TWITTER');
			expect(API_ERROR_CODES.USER_NOT_FOUND).toBe('USER_NOT_FOUND');
			expect(API_ERROR_CODES.USER_ALREADY_EXISTS).toBe('USER_ALREADY_EXISTS');
			expect(API_ERROR_CODES.GITHUB_USER_NOT_FOUND).toBe('GITHUB_USER_NOT_FOUND');
		});

		it('should have validation error codes', () => {
			expect(API_ERROR_CODES.INVALID_PERIOD).toBe('INVALID_PERIOD');
			expect(API_ERROR_CODES.INVALID_PAGINATION).toBe('INVALID_PAGINATION');
		});

		it('should have server error codes', () => {
			expect(API_ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
			expect(API_ERROR_CODES.GITHUB_API_ERROR).toBe('GITHUB_API_ERROR');
			expect(API_ERROR_CODES.RATE_LIMITED).toBe('RATE_LIMITED');
		});
	});
});
