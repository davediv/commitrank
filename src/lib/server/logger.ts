/**
 * Structured Logging Utility for Cloudflare Workers
 *
 * Provides context-aware logging with timing support for debugging
 * server-side operations in production.
 *
 * Usage:
 * ```typescript
 * const log = createLogger('Join', requestId);
 * log.info('Starting registration', { username });
 * log.time('github-api');
 * // ... do work
 * log.timeEnd('github-api'); // Logs duration
 * log.error('Failed', { error: err.message });
 * ```
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
	[key: string]: unknown;
}

export interface Logger {
	debug: (message: string, context?: LogContext) => void;
	info: (message: string, context?: LogContext) => void;
	warn: (message: string, context?: LogContext) => void;
	error: (message: string, context?: LogContext) => void;
	time: (label: string) => void;
	timeEnd: (label: string) => void;
}

/**
 * Format log context as a compact string
 */
function formatContext(context?: LogContext): string {
	if (!context || Object.keys(context).length === 0) return '';

	const formatted = Object.entries(context)
		.map(([key, value]) => {
			if (value instanceof Error) {
				return `${key}=${value.message}`;
			}
			if (typeof value === 'object' && value !== null) {
				return `${key}=${JSON.stringify(value)}`;
			}
			return `${key}=${value}`;
		})
		.join(' ');

	return ` { ${formatted} }`;
}

/**
 * Create a context-aware logger instance
 *
 * @param prefix - Operation name (e.g., 'Join', 'Sync', 'API')
 * @param requestId - Optional request ID for correlation
 * @returns Logger instance with debug, info, warn, error, time, timeEnd methods
 */
export function createLogger(prefix: string, requestId?: string): Logger {
	const timers = new Map<string, number>();
	const reqId = requestId || generateRequestId();
	const fullPrefix = `[${prefix}:${reqId}]`;

	const log = (level: LogLevel, message: string, context?: LogContext) => {
		const timestamp = new Date().toISOString();
		const contextStr = formatContext(context);
		const logLine = `${timestamp} ${fullPrefix} ${level}: ${message}${contextStr}`;

		switch (level) {
			case 'ERROR':
				console.error(logLine);
				break;
			case 'WARN':
				console.warn(logLine);
				break;
			default:
				console.log(logLine);
		}
	};

	return {
		debug: (message: string, context?: LogContext) => log('DEBUG', message, context),
		info: (message: string, context?: LogContext) => log('INFO', message, context),
		warn: (message: string, context?: LogContext) => log('WARN', message, context),
		error: (message: string, context?: LogContext) => log('ERROR', message, context),

		time: (label: string) => {
			timers.set(label, Date.now());
		},

		timeEnd: (label: string) => {
			const start = timers.get(label);
			if (start) {
				const duration = Date.now() - start;
				timers.delete(label);
				log('INFO', `${label} completed`, { durationMs: duration });
			}
		}
	};
}

/**
 * Generate a short request ID for log correlation
 * Format: 8 character hex string
 */
function generateRequestId(): string {
	return Math.random().toString(16).substring(2, 10);
}

/**
 * Sanitize sensitive data for logging
 * Masks tokens, passwords, and other sensitive fields
 */
export function sanitize<T extends Record<string, unknown>>(
	data: T,
	sensitiveKeys: string[] = ['token', 'password', 'secret', 'key', 'authorization']
): T {
	const result = { ...data };

	for (const key of Object.keys(result)) {
		const lowerKey = key.toLowerCase();
		if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
			result[key as keyof T] = '[REDACTED]' as T[keyof T];
		}
	}

	return result;
}
