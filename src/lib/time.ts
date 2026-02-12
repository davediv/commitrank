/**
 * Formats a Date as a UTC clock string using HH:mm:ss (24-hour format).
 */
export function formatUTCClockTime(date: Date): string {
	return (
		date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
			timeZone: 'UTC'
		}) + ' UTC'
	);
}
