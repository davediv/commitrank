// vitest-browser-svelte render types have compatibility issues with Svelte 5 props
import { page } from 'vitest/browser';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import type { ActionData } from './$types';

// Mock $app/forms enhance function
vi.mock('$app/forms', () => ({
	enhance: vi.fn(() => () => {})
}));

// Mock data types
type FormProps = {
	form: ActionData;
};

// No form data (initial render)
const noFormData: FormProps = {
	form: null
};

// Form data with error
const formWithError: FormProps = {
	form: {
		error: 'INVALID_USERNAME',
		message: 'Invalid GitHub username format',
		github_username: 'invalid-user-',
		twitter_handle: ''
	}
};

// Form data with twitter error
const formWithTwitterError: FormProps = {
	form: {
		error: 'INVALID_TWITTER',
		message: 'Invalid Twitter handle format',
		github_username: 'validuser',
		twitter_handle: 'invalid-handle'
	}
};

describe('/join/+page.svelte - Registration Form', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Page Structure', () => {
		it('should render the page title', async () => {
			render(Page, { props: noFormData });

			await expect.element(page.getByText('Join the CommitRank Leaderboard')).toBeInTheDocument();
		});

		it('should render the page description', async () => {
			render(Page, { props: noFormData });

			await expect
				.element(page.getByText(/Enter your GitHub username to see where you rank/))
				.toBeInTheDocument();
		});

		it('should render back to leaderboard link', async () => {
			render(Page, { props: noFormData });

			const backLink = page.getByRole('link', { name: /Back to Leaderboard/i });
			await expect.element(backLink).toBeInTheDocument();
		});
	});

	describe('Form Elements', () => {
		it('should render GitHub username input', async () => {
			render(Page, { props: noFormData });

			const githubInput = page.getByRole('textbox', { name: /GitHub Username/i });
			await expect.element(githubInput).toBeInTheDocument();
		});

		it('should render Twitter handle input', async () => {
			render(Page, { props: noFormData });

			const twitterInput = page.getByRole('textbox', { name: /Twitter/i });
			await expect.element(twitterInput).toBeInTheDocument();
		});

		it('should render submit button', async () => {
			render(Page, { props: noFormData });

			const submitButton = page.getByRole('button', { name: 'Join Leaderboard' });
			await expect.element(submitButton).toBeInTheDocument();
		});

		it('should indicate GitHub username is required', async () => {
			render(Page, { props: noFormData });

			// Check for asterisk or required indicator
			const requiredIndicator = page.getByText('*');
			await expect.element(requiredIndicator).toBeInTheDocument();
		});

		it('should indicate Twitter handle is optional', async () => {
			render(Page, { props: noFormData });

			await expect.element(page.getByText('(optional)')).toBeInTheDocument();
		});

		it('should show @ prefix for Twitter input', async () => {
			render(Page, { props: noFormData });

			await expect.element(page.getByText('@')).toBeInTheDocument();
		});
	});

	describe('Form Input Placeholders', () => {
		it('should have placeholder for GitHub input', async () => {
			render(Page, { props: noFormData });

			const githubInput = page.getByPlaceholder('octocat');
			await expect.element(githubInput).toBeInTheDocument();
		});

		it('should have placeholder for Twitter input', async () => {
			render(Page, { props: noFormData });

			const twitterInput = page.getByPlaceholder('username');
			await expect.element(twitterInput).toBeInTheDocument();
		});
	});

	describe('Error Display', () => {
		it('should display error alert when form has error', async () => {
			render(Page, { props: formWithError });

			await expect.element(page.getByText('Registration Failed')).toBeInTheDocument();
			await expect.element(page.getByText('Invalid GitHub username format')).toBeInTheDocument();
		});

		it('should display twitter error when form has twitter error', async () => {
			render(Page, { props: formWithTwitterError });

			await expect.element(page.getByText('Invalid Twitter handle format')).toBeInTheDocument();
		});
	});

	describe('Form Submission Behavior', () => {
		it('should have submit button that submits the form', async () => {
			render(Page, { props: noFormData });

			// Check submit button exists and is of type submit
			const submitButton = page.getByRole('button', { name: 'Join Leaderboard' });
			await expect.element(submitButton).toBeInTheDocument();
			await expect.element(submitButton).toHaveAttribute('type', 'submit');
		});
	});

	describe('Privacy Notice', () => {
		it('should display privacy notice', async () => {
			render(Page, { props: noFormData });

			await expect
				.element(page.getByText(/By joining, you agree to have your public GitHub/))
				.toBeInTheDocument();
		});

		it('should mention publicly available information', async () => {
			render(Page, { props: noFormData });

			await expect.element(page.getByText(/publicly available information/)).toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('should have GitHub username label', async () => {
			render(Page, { props: noFormData });

			// GitHub label - look for exact match or partial
			await expect.element(page.getByText(/GitHub Username/)).toBeInTheDocument();
		});

		it('should have Twitter handle label', async () => {
			render(Page, { props: noFormData });

			// Twitter label
			await expect.element(page.getByText(/Twitter/)).toBeInTheDocument();
		});

		it('should have required attribute on GitHub input', async () => {
			render(Page, { props: noFormData });

			const githubInput = page.getByRole('textbox', { name: /GitHub Username/i });
			await expect.element(githubInput).toHaveAttribute('required');
		});
	});
});
