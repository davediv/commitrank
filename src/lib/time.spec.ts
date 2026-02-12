import { describe, it, expect } from 'vitest';
import { formatUTCClockTime } from './time';

describe('formatUTCClockTime', () => {
	it('formats time as HH:mm:ss UTC', () => {
		const date = new Date('2026-02-12T08:42:55.000Z');
		expect(formatUTCClockTime(date)).toBe('08:42:55 UTC');
	});
});
