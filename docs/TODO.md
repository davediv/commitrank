# CommitRank - Project TODO List

*Generated from PRD.md on 2025-01-13*

---

## Executive Summary

This document outlines the development tasks for **CommitRank**, a web application that ranks GitHub profiles by their commit contributions. The project uses SvelteKit with Svelte 5, Cloudflare Workers/D1/KV, and TailwindCSS v4 with shadcn-svelte components.

---

## Priority Levels

- 🔴 **Critical/Blocker**: Must be completed first (P0)
- 🟡 **High Priority**: Core MVP features (P1)
- 🟢 **Medium Priority**: Important but not blocking (P2)
- 🔵 **Low Priority**: Nice-to-have features (P3+)

---

## Phase 1: Foundation & Setup

### Infrastructure & Environment

- [x] 🔴 **INFRA-P1-001**: Configure Cloudflare Workers environment with wrangler.jsonc
  - **Success Criteria**:
    - `wrangler.jsonc` contains valid D1 database binding configuration
    - `wrangler.jsonc` contains valid KV namespace binding configuration
    - `npm run dev` starts local development server without errors
    - `npm run types` generates Cloudflare Worker types successfully
    - Environment bindings accessible in `platform.env` within SvelteKit
  - **Dependencies**: None

- [x] 🔴 **INFRA-P1-002**: Set up Cloudflare D1 database instance
  - **Success Criteria**:
    - D1 database created via Cloudflare dashboard or wrangler CLI
    - `database_id` updated in `wrangler.jsonc`
    - Database connection verified via `wrangler d1 execute` command
    - Local D1 database working for development (`--local` flag)
  - **Dependencies**: INFRA-P1-001

- [x] 🔴 **INFRA-P1-003**: Set up Cloudflare KV namespace for caching
  - **Success Criteria**:
    - KV namespace created via Cloudflare dashboard or wrangler CLI
    - KV binding configured in `wrangler.jsonc` as `KV`
    - KV operations (get/put/delete) verified via wrangler CLI
    - Local KV working for development
  - **Dependencies**: INFRA-P1-001

- [x] 🔴 **INFRA-P1-004**: Configure GitHub API token as Cloudflare secret
  - **Success Criteria**:
    - GitHub Personal Access Token created with `read:user` scope
    - Token stored as Cloudflare secret named `GITHUB_TOKEN`
    - Token accessible in Worker via `platform.env.GITHUB_TOKEN`
    - Token verified by making test API call to GitHub
  - **Dependencies**: INFRA-P1-001

- [x] 🟡 **INFRA-P1-005**: Configure environment variables in wrangler.jsonc
  - **Success Criteria**:
    - `ENVIRONMENT` variable set to `development` for local, `production` for deployed
    - Variables accessible in application code
    - Different configs for dev vs production environments
  - **Dependencies**: INFRA-P1-001

### Database & Data Models

- [x] 🔴 **DB-P1-001**: Create Drizzle ORM schema for users table
  - **Success Criteria**:
    - Schema file exists at `src/lib/server/db/schema.ts`
    - Users table includes all fields: id, github_username, github_id, display_name, avatar_url, bio, twitter_handle, location, company, blog, public_repos, followers, following, github_created_at, created_at, updated_at
    - `github_username` has unique constraint
    - `github_id` has unique constraint
    - TypeScript types exported for User model
    - Schema passes TypeScript compilation
  - **Dependencies**: INFRA-P1-002

- [x] 🔴 **DB-P1-002**: Create Drizzle ORM schema for contributions table
  - **Success Criteria**:
    - Contributions table includes: id, user_id (FK), date, commit_count, pr_count, issue_count, review_count, total_contributions, created_at
    - Foreign key constraint on user_id references users.id with CASCADE delete
    - Unique constraint on (user_id, date) combination
    - TypeScript types exported for Contribution model
    - Schema passes TypeScript compilation
  - **Dependencies**: DB-P1-001

- [x] 🔴 **DB-P1-003**: Create database indexes for performance optimization
  - **Success Criteria**:
    - Index on `users.github_username`
    - Index on `users.updated_at`
    - Index on `contributions.user_id`
    - Index on `contributions.date`
    - Composite index on `contributions(user_id, date)`
    - Index on `contributions.total_contributions DESC`
    - Indexes verified with `.indexes` command in D1
  - **Dependencies**: DB-P1-002

- [x] 🔴 **DB-P1-004**: Run initial database migration to D1
  - **Success Criteria**:
    - `npm run db:generate` creates migration files without errors
    - `npm run db:push` applies schema to local D1
    - Tables verified via `wrangler d1 execute --local`
    - All columns and constraints present as defined
  - **Dependencies**: DB-P1-003

- [x] 🔴 **DB-P1-005**: Create database client helper function
  - **Success Criteria**:
    - `createDb` function exists in `src/lib/server/db/index.ts`
    - Function accepts D1Database binding and returns Drizzle client
    - Client properly typed with schema types
    - Function works in both server load functions and API routes
  - **Dependencies**: DB-P1-004

### UI Foundation

- [x] 🔴 **UI-P1-001**: Initialize shadcn-svelte with base configuration
  - **Success Criteria**:
    - shadcn-svelte initialized via CLI (`npx shadcn-svelte@latest init`)
    - `components.json` configuration file created
    - Base styles imported in `src/app.css`
    - TailwindCSS v4 properly configured for shadcn-svelte
    - Test component renders without errors
  - **Dependencies**: None

- [x] 🔴 **UI-P1-002**: Install core shadcn-svelte components via CLI
  - **Success Criteria**:
    - Button component installed: `npx shadcn-svelte@latest add button`
    - Input component installed: `npx shadcn-svelte@latest add input`
    - Card component installed: `npx shadcn-svelte@latest add card`
    - Avatar component installed: `npx shadcn-svelte@latest add avatar`
    - Badge component installed: `npx shadcn-svelte@latest add badge`
    - Skeleton component installed: `npx shadcn-svelte@latest add skeleton`
    - Alert component installed: `npx shadcn-svelte@latest add alert`
    - All components render correctly in isolation
  - **Dependencies**: UI-P1-001

- [x] 🔴 **UI-P1-003**: Install shadcn-svelte Data Table component
  - **Success Criteria**:
    - Data Table component installed: `npx shadcn-svelte@latest add table`
    - Table component supports custom columns
    - Table component supports sorting
    - Table component supports pagination
    - Sample data renders in table format
  - **Dependencies**: UI-P1-002

- [x] 🔴 **UI-P1-004**: Install shadcn-svelte Tabs component for time filters
  - **Success Criteria**:
    - Tabs component installed: `npx shadcn-svelte@latest add tabs`
    - Tabs support value binding for controlled state
    - Tab switching triggers callback/event
    - Tabs render horizontally on desktop, stack on mobile
  - **Dependencies**: UI-P1-002

- [x] 🟡 **UI-P1-005**: Configure TailwindCSS v4 theme with shadcn-svelte colors
  - **Success Criteria**:
    - Theme variables defined in `src/app.css` using `@theme` directive
    - Light mode colors configured per PRD spec
    - Dark mode colors configured per PRD spec
    - Colors properly applied to shadcn-svelte components
    - No CSS compilation errors
  - **Dependencies**: UI-P1-001

- [x] 🟡 **UI-P1-006**: Install and configure @lucide/svelte icon library
  - **Success Criteria**:
    - `@lucide/svelte` installed as dependency (Svelte 5 compatible)
    - Icons import correctly: Trophy, Github, Twitter, User, Calendar, RefreshCw, ChevronLeft, ChevronRight, Loader2
    - Icons render at correct sizes with TailwindCSS classes
    - Icons support color customization via className
  - **Dependencies**: None

- [x] 🟡 **UI-P1-007**: Create base layout component with header
  - **Success Criteria**:
    - Layout component at `src/routes/+layout.svelte`
    - Header displays "CommitRank" logo/text (left)
    - Header displays "Join Leaderboard" CTA button (right)
    - Header is sticky on scroll
    - Layout is responsive across all breakpoints
    - Uses semantic HTML (header, main, footer)
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify header renders
    - Verify "CommitRank" text/logo visible on left
    - Verify "Join Leaderboard" button visible on right
    - Scroll page and verify header remains sticky
    - Resize to mobile and verify responsive behavior
  - **Dependencies**: UI-P1-002, UI-P1-006

---

## Phase 2: Core Features

### API Development

- [x] 🔴 **API-P2-001**: Create TypeScript types for API responses
  - **Success Criteria**:
    - `ApiResponse<T>` interface defined in `src/lib/types.ts`
    - Response includes: success, data, error, cached, timestamp fields
    - Error type includes: code, message fields
    - Types exported and usable across codebase
    - Types enforce consistent API response format
  - **Dependencies**: DB-P1-005

- [x] 🔴 **API-P2-002**: Implement GET /api/leaderboard endpoint
  - **Success Criteria**:
    - Endpoint accepts query params: period (today|7days|30days|year), page, limit
    - Default period is `today`, default page is 1, default limit is 20
    - Returns leaderboard array with: rank, github_username, display_name, avatar_url, twitter_handle, contributions
    - Returns pagination object: page, limit, total, totalPages
    - Returns proper 200 status with ApiResponse format
    - Invalid period returns 400 error
    - Maximum limit enforced at 100
  - **Dependencies**: API-P2-001, DB-P1-005

- [x] 🔴 **API-P2-003**: Implement POST /api/users endpoint (user registration)
  - **Success Criteria**:
    - Accepts JSON body: github_username (required), twitter_handle (optional)
    - Validates github_username format: 1-39 chars, alphanumeric + hyphen
    - Validates twitter_handle format: 1-15 chars, alphanumeric + underscore
    - Verifies GitHub user exists via GitHub API call
    - Returns 404 `GITHUB_USER_NOT_FOUND` if user doesn't exist
    - Returns 409 `USER_ALREADY_EXISTS` if already registered
    - Returns 400 `INVALID_USERNAME` for invalid format
    - Returns 400 `INVALID_TWITTER` for invalid Twitter format
    - On success, inserts user and contributions to D1
    - Returns 201 with user data including initial rank
  - **Dependencies**: API-P2-001, API-P2-005, DB-P1-005

- [x] 🔴 **API-P2-004**: Implement GET /api/users/[username] endpoint
  - **Success Criteria**:
    - Returns user details by github_username
    - Response includes all user fields from database
    - Response includes contributions for all periods (today, 7days, 30days, year)
    - Response includes rank for all periods
    - Returns 404 if user not found
    - Returns 200 with ApiResponse format on success
  - **Dependencies**: API-P2-001, DB-P1-005

- [x] 🟡 **API-P2-005**: Implement GitHub API client for user validation and data fetching
  - **Success Criteria**:
    - Function to validate GitHub username exists (REST API)
    - Function to fetch contribution data (GraphQL API)
    - GraphQL query matches PRD appendix specification
    - Proper error handling for rate limits (403)
    - Proper error handling for not found (404)
    - Returns parsed contribution data by date
    - Client uses GITHUB_TOKEN from env
  - **Dependencies**: INFRA-P1-004

- [x] 🟡 **API-P2-006**: Implement PATCH /api/users/[username] endpoint
  - **Success Criteria**:
    - Accepts JSON body: twitter_handle
    - Validates twitter_handle format
    - Updates user record in D1
    - Returns 404 if user not found
    - Returns 200 with updated user data on success
    - Invalidates relevant cache keys on update
  - **Dependencies**: API-P2-001, DB-P1-005, CACHE-P2-001

- [x] 🟡 **API-P2-007**: Implement GET /api/stats endpoint
  - **Success Criteria**:
    - Returns total_users count
    - Returns total_contributions_today
    - Returns total_contributions_year
    - Returns last_sync timestamp
    - Returns next_sync timestamp (calculated)
    - Uses caching for performance
    - Returns 200 with ApiResponse format
  - **Dependencies**: API-P2-001, DB-P1-005, CACHE-P2-001

### Caching Implementation

- [x] 🔴 **CACHE-P2-001**: Implement KV cache helper utilities
  - **Success Criteria**:
    - Cache helper in `src/lib/server/cache.ts`
    - Function to get cached value by key
    - Function to set cached value with TTL
    - Function to delete/invalidate cache key
    - Function to invalidate multiple keys by pattern
    - TTL constants defined per PRD: LEADERBOARD (300s), USER (600s), GITHUB (3600s), STATS (300s)
    - Type-safe cache operations with generics
  - **Dependencies**: INFRA-P1-003

- [x] 🔴 **CACHE-P2-002**: Add caching layer to GET /api/leaderboard
  - **Success Criteria**:
    - Check KV cache before database query
    - Cache key format: `leaderboard:{period}`
    - Cache TTL: 5 minutes (300 seconds)
    - Cache hit returns cached data with `cached: true`
    - Cache miss queries D1, stores result, returns with `cached: false`
    - Response includes cache status in API response
  - **Dependencies**: CACHE-P2-001, API-P2-002

- [x] 🟡 **CACHE-P2-003**: Add caching layer to GET /api/users/[username]
  - **Success Criteria**:
    - Cache key format: `user:{username}`
    - Cache TTL: 10 minutes (600 seconds)
    - Cache invalidation on user update
    - Proper cache miss handling
  - **Dependencies**: CACHE-P2-001, API-P2-004

- [x] 🟡 **CACHE-P2-004**: Add caching layer to GET /api/stats
  - **Success Criteria**:
    - Cache key: `stats:total`
    - Cache TTL: 5 minutes (300 seconds)
    - Invalidates on new user registration
  - **Dependencies**: CACHE-P2-001, API-P2-007

- [x] 🔴 **CACHE-P2-005**: Implement cache invalidation on user registration
  - **Success Criteria**:
    - POST /api/users invalidates: `leaderboard:*` (all periods)
    - POST /api/users invalidates: `stats:total`
    - Invalidation runs after successful database insert
    - No invalidation on registration failure
  - **Dependencies**: CACHE-P2-001, API-P2-003

### Rate Limiting

- [x] 🟡 **RATE-P2-001**: Implement rate limiting utility using KV
  - **Success Criteria**:
    - Rate limit function in `src/lib/server/ratelimit.ts`
    - Function accepts: KV namespace, key, limit, window (seconds)
    - Returns: { allowed: boolean, remaining: number }
    - Uses atomic increment with TTL
    - Key format: `ratelimit:{identifier}`
  - **Dependencies**: INFRA-P1-003

- [x] 🟡 **RATE-P2-002**: Apply rate limiting to POST /api/users
  - **Success Criteria**:
    - Limit: 5 requests per IP per hour
    - Rate limit key based on client IP
    - Returns 429 `RATE_LIMITED` when exceeded
    - Response includes retry-after information
    - Rate limit checked before validation/processing
  - **Dependencies**: RATE-P2-001, API-P2-003

- [x] 🟢 **RATE-P2-003**: Apply rate limiting to GET /api/leaderboard
  - **Success Criteria**:
    - Limit: 100 requests per IP per minute
    - Returns 429 when exceeded
    - Response includes rate limit headers
  - **Dependencies**: RATE-P2-001, API-P2-002

- [x] 🟢 **RATE-P2-004**: Apply rate limiting to PATCH /api/users/[username]
  - **Success Criteria**:
    - Limit: 10 requests per IP per hour
    - Returns 429 when exceeded
  - **Dependencies**: RATE-P2-001, API-P2-006

### Feature: Public Leaderboard

- [x] 🔴 **FEAT-P2-001**: Implement server load function for leaderboard page
  - **Success Criteria**:
    - Load function in `src/routes/+page.server.ts`
    - Fetches leaderboard data based on period query param
    - Default period: `today`
    - Returns typed leaderboard data to page
    - Handles database errors gracefully
    - Sets appropriate cache headers
  - **Dependencies**: API-P2-002, DB-P1-005

- [x] 🔴 **UI-P2-001**: Implement leaderboard page with time filter tabs
  - **Success Criteria**:
    - Page at `src/routes/+page.svelte`
    - Displays trophy icon with "GitHub Commit Leaderboard" heading
    - Time filter tabs: Today, Last 7 Days, Last 30 Days, Last Year
    - Default tab: Today
    - Tab change triggers data reload with new period
    - Uses Svelte 5 runes ($state, $derived)
    - Properly typed Props interface
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify page loads
    - Verify trophy icon and heading visible
    - Verify 4 time filter tabs render
    - Verify "Today" tab is active by default
    - Click "Last 7 Days" tab and verify it becomes active
    - Check Network tab for API request with period param
    - Verify no console errors
  - **Dependencies**: FEAT-P2-001, UI-P1-004, UI-P1-006

- [x] 🔴 **UI-P2-002**: Implement leaderboard data table component
  - **Success Criteria**:
    - Displays columns: Rank, User (avatar + username), Contributions, Twitter
    - Rank column shows medal emoji for top 3 (gold, silver, bronze)
    - User column shows avatar (circular) + github_username
    - Contributions column shows number with formatting
    - Twitter column shows @handle as link (or "-" if none)
    - GitHub username links to GitHub profile
    - Table supports 20 items per page
    - Uses shadcn-svelte Table component
    - Responsive: hides non-essential columns on mobile
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify table renders
    - Verify columns visible: Rank, User, Contributions, Twitter
    - Verify first 3 rows show medal emojis
    - Verify avatars render as circular images
    - Click GitHub username and verify opens GitHub profile
    - Click Twitter handle and verify opens Twitter profile
    - Resize to mobile and verify responsive behavior
    - Check Network tab for avatar image loads
  - **Dependencies**: UI-P2-001, UI-P1-003

- [x] 🟡 **UI-P2-003**: Implement pagination for leaderboard
  - **Success Criteria**:
    - Shows "Page X of Y" text
    - Previous/Next buttons with chevron icons
    - Previous disabled on first page
    - Next disabled on last page
    - Page change triggers data reload
    - URL updates with page parameter
    - Pagination info shows total users
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify pagination renders below table
    - Verify "Page 1 of X" text shows
    - Verify Previous button is disabled
    - Click Next and verify data reloads with page 2
    - Verify URL updates with `?page=2`
    - Navigate to last page and verify Next is disabled
    - Click Previous and verify returns to prior page
  - **Dependencies**: UI-P2-002, FEAT-P2-001

- [x] 🟡 **UI-P2-004**: Implement loading skeleton for leaderboard
  - **Success Criteria**:
    - Skeleton component shown while data loads
    - Skeleton mimics table row structure
    - Shows appropriate number of skeleton rows (20)
    - Skeleton animates (shimmer effect)
    - Skeleton replaced by real data on load
    - Smooth transition between skeleton and data
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` with slow network throttling
    - Verify skeleton rows appear during load
    - Verify skeleton has shimmer animation
    - Verify skeleton replaced by real data when loaded
    - Verify no layout shift during transition
  - **Dependencies**: UI-P2-002, UI-P1-002

### Feature: User Registration

- [x] 🔴 **FEAT-P2-002**: Implement /join route with server actions
  - **Success Criteria**:
    - Page at `src/routes/join/+page.svelte`
    - Form action in `src/routes/join/+page.server.ts`
    - Form action calls POST /api/users internally
    - Success redirects to leaderboard with success message
    - Failure stays on page with error message
    - Proper CSRF protection via SvelteKit form actions
  - **Dependencies**: API-P2-003

- [x] 🔴 **UI-P2-005**: Implement registration form component
  - **Success Criteria**:
    - Form heading: "Join the CommitRank Leaderboard"
    - GitHub username input (required, with label)
    - Twitter/X handle input (optional, with label)
    - "Join Leaderboard" submit button
    - Privacy notice text below form
    - Form validation on client-side before submit
    - Uses shadcn-svelte Input and Button components
    - Uses Svelte 5 runes for form state
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/join` and verify form renders
    - Verify GitHub username input visible with label
    - Verify Twitter handle input visible with label
    - Verify "Join Leaderboard" button visible
    - Verify privacy notice text at bottom
    - Submit empty form and verify validation error
    - Enter valid username and submit
    - Check Network tab for form submission
  - **Dependencies**: FEAT-P2-002, UI-P1-002

- [x] 🔴 **UI-P2-006**: Implement client-side form validation
  - **Success Criteria**:
    - GitHub username: required validation
    - GitHub username: format validation (1-39 chars, alphanumeric + hyphen)
    - Twitter handle: format validation if provided (1-15 chars, alphanumeric + underscore)
    - Error messages display below respective fields
    - Submit button disabled while submitting
    - Validation runs on blur and on submit
    - Uses shadcn-svelte error styling
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/join`
    - Submit empty form and verify "required" error on GitHub field
    - Enter invalid characters in GitHub field and verify format error
    - Enter 40+ characters and verify length error
    - Enter valid GitHub, invalid Twitter and verify Twitter error
    - Verify error messages clear when input corrected
    - Verify submit button shows loading state during submission
  - **Dependencies**: UI-P2-005

- [x] 🟡 **UI-P2-007**: Implement success/error feedback for registration
  - **Success Criteria**:
    - Success: shows Alert with "Successfully joined!" message
    - Success: displays user's initial rank
    - Success: provides link to view on leaderboard
    - Error: shows Alert with specific error message
    - Error messages are user-friendly (not raw API errors)
    - Uses shadcn-svelte Alert component
    - Toasts/alerts auto-dismiss or are dismissible
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/join`
    - Submit with non-existent GitHub user
    - Verify error alert shows "GitHub user not found"
    - Submit with valid existing user
    - Verify error shows "User already registered"
    - Submit with new valid user (if possible in test)
    - Verify success alert with rank information
    - Verify alert can be dismissed
  - **Dependencies**: UI-P2-005, FEAT-P2-002

### Feature: Scheduled Data Sync

- [x] 🔴 **FEAT-P2-003**: Implement Cloudflare Cron Trigger handler
  - **Success Criteria**:
    - Cron handler in Worker (handles `scheduled` event)
    - Cron schedule configured in wrangler.jsonc: `0 */6 * * *` (every 6 hours)
    - Handler fetches all users ordered by updated_at ASC
    - Handler iterates through users and syncs contributions
    - Handler respects rate limits (100ms delay between requests)
    - Handler invalidates all KV cache after completion
    - Handler logs sync summary (success/failure counts)
  - **Dependencies**: API-P2-005, CACHE-P2-001, DB-P1-005

- [x] 🔴 **FEAT-P2-004**: Implement user contribution sync function
  - **Success Criteria**:
    - Function fetches contribution data from GitHub GraphQL
    - Function parses daily contributions for past 365 days
    - Function upserts contribution records to D1 (insert or update)
    - Function updates user.updated_at timestamp
    - Function handles partial failures gracefully
    - Function returns success/failure status
  - **Dependencies**: API-P2-005, DB-P1-002

- [x] 🟡 **FEAT-P2-005**: Handle scheduled sync partial failures
  - **Success Criteria**:
    - Individual user sync failures don't stop entire job
    - Failed user syncs logged with username and error
    - Summary includes both success and failure counts
    - Failed users still get updated_at bumped (to prevent retry loop)
    - Critical errors (DB unavailable) terminate job early
  - **Dependencies**: FEAT-P2-003, FEAT-P2-004

---

## Phase 3: Integration & Polish

### Performance Optimization

- [x] 🟡 **PERF-P3-001**: Optimize database queries with proper indexing
  - **Success Criteria**:
    - Leaderboard queries use indexes (verified with EXPLAIN)
    - Query time for top 100 leaderboard < 50ms
    - Contribution aggregation queries optimized
    - No full table scans for common operations
  - **Dependencies**: DB-P1-003, API-P2-002

- [x] 🟡 **PERF-P3-002**: Implement SSR optimization for leaderboard page
  - **Success Criteria**:
    - Page renders entirely on server (no client fetch on initial load)
    - Time to First Byte (TTFB) < 100ms from edge
    - HTML response is complete and indexable
    - Minimal client-side JavaScript for interactivity
    - Page works with JavaScript disabled (core content)
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify data renders immediately
    - Check Network tab → verify no additional data fetch on page load
    - Check Lighthouse → verify TTFB metric
    - Disable JavaScript and reload → verify content still visible
  - **Dependencies**: FEAT-P2-001, UI-P2-001

- [x] 🟢 **PERF-P3-003**: Implement image optimization for avatars
  - **Success Criteria**:
    - Avatar images use lazy loading (loading="lazy")
    - Avatar URLs use GitHub's size parameter (e.g., `?s=48`)
    - No layout shift when images load (explicit dimensions)
    - Failed avatar loads show fallback/placeholder
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and scroll through leaderboard
    - Check Network tab → verify avatars load lazily on scroll
    - Verify avatar URLs include size parameter
    - Verify no Cumulative Layout Shift (CLS) in DevTools
  - **Dependencies**: UI-P2-002

- [x] 🟢 **PERF-P3-004**: Ensure bundle size stays within budget
  - **Success Criteria**:
    - Initial JS bundle < 100KB gzipped
    - Initial CSS bundle < 30KB gzipped
    - Total HTML < 50KB
    - No unused CSS or JS in production build
    - Tree-shaking verified for dependencies
  - **Dependencies**: UI-P2-004

### Security Implementation

- [x] 🟡 **SEC-P3-001**: Implement input sanitization for all user inputs
  - **Success Criteria**:
    - GitHub username validated on server (not just client)
    - Twitter handle validated on server
    - Query parameters validated (period, page, limit)
    - No XSS vulnerabilities in rendered output
    - No SQL injection possible (parameterized queries)
  - **Dependencies**: API-P2-003, API-P2-006

- [x] 🟡 **SEC-P3-002**: Configure CORS headers for API routes
  - **Success Criteria**:
    - CORS allows commitrank.dev origin only in production
    - CORS allows localhost in development
    - Preflight requests handled correctly
    - Non-allowed origins receive 403
  - **Dependencies**: API-P2-002

- [x] 🟢 **SEC-P3-003**: Implement Content Security Policy headers
  - **Success Criteria**:
    - CSP header set in response
    - Script sources restricted to self
    - Image sources allow GitHub avatars
    - No inline scripts (or with nonce)
    - CSP violations logged (report-uri)
  - **Dependencies**: UI-P1-007

### Testing & Quality Assurance

- [x] 🟡 **TEST-P3-001**: Write unit tests for API utility functions
  - **Success Criteria**:
    - Tests for GitHub username validation function
    - Tests for Twitter handle validation function
    - Tests for rate limit helper function
    - Tests for cache helper functions
    - All tests pass with `npm run test`
    - Code coverage > 80% for utility functions
  - **Dependencies**: API-P2-001, RATE-P2-001, CACHE-P2-001

- [x] 🟡 **TEST-P3-002**: Write integration tests for API endpoints
  - **Success Criteria**:
    - Test GET /api/leaderboard with different periods
    - Test POST /api/users with valid/invalid data
    - Test GET /api/users/[username] for existing/non-existing
    - Test PATCH /api/users/[username]
    - Test GET /api/stats
    - Tests use mock D1 database
    - All tests pass
  - **Dependencies**: API-P2-002, API-P2-003, API-P2-004, API-P2-006, API-P2-007

- [x] 🟡 **TEST-P3-003**: Write component tests for Svelte components
  - **Success Criteria**:
    - Test leaderboard table rendering
    - Test registration form validation
    - Test time filter tab switching
    - Test pagination controls
    - Tests run with `npm run test:unit`
    - Use Svelte testing library
  - **Dependencies**: UI-P2-002, UI-P2-005, UI-P2-003
  - **Implementation Notes**: Added 47 new component tests using vitest-browser-svelte:
    - `src/routes/page.svelte.spec.ts`: 28 tests for leaderboard page (header, stats, tabs, table, empty state, pagination, SEO)
    - `src/routes/join/page.svelte.spec.ts`: 19 tests for registration form (structure, inputs, validation, errors, accessibility)

- [x] 🟢 **TEST-P3-004**: Perform end-to-end manual testing
  - **Success Criteria**:
    - Test complete registration flow
    - Test leaderboard viewing across all periods
    - Test pagination through results
    - Test responsive design on mobile/tablet/desktop
    - Test error scenarios (rate limiting, invalid input)
    - Document any issues found
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify leaderboard loads
    - Click through all time period tabs
    - Navigate through multiple pages
    - Navigate to `/join` and complete registration
    - Verify redirect and success message
    - Verify new user appears in leaderboard
    - Test on mobile viewport
    - Check Console for any JavaScript errors
    - Check Network for failed requests
  - **Dependencies**: UI-P2-001, UI-P2-005, UI-P2-003
  - **Test Results** (2025-01-13):
    - ✅ Leaderboard page loads with header, stats, 4 period tabs, table structure, empty state
    - ✅ All time period tabs work (Today, 7 Days, 30 Days, Year) with URL param updates
    - ✅ Join page renders with form elements (GitHub input required, Twitter optional)
    - ✅ Client-side validation works (tested invalid username "-invaliduser" shows error)
    - ✅ No JavaScript console errors detected
    - ✅ All network requests successful (200/304 responses)
    - ✅ Desktop UI is clean, well-structured, properly aligned
    - ⚠️ Pagination not fully testable (no users in database)
    - ⚠️ Full registration flow not testable without real GitHub API

### Build & Type Checking

- [x] 🔴 **BUILD-P3-001**: Ensure TypeScript type checking passes
  - **Success Criteria**:
    - `npm run check` completes without errors
    - All component props properly typed
    - All API responses properly typed
    - No `any` types in production code
    - Strict mode enabled in tsconfig.json
  - **Dependencies**: All API and UI tasks
  - **Implementation Notes**: Fixed Svelte 5 state reactivity warnings in +page.svelte and join/+page.svelte using $derived and $effect runes

- [x] 🔴 **BUILD-P3-002**: Ensure linting passes
  - **Success Criteria**:
    - `npm run lint` completes without errors
    - ESLint rules followed throughout codebase
    - Prettier formatting consistent
    - No unused imports or variables
  - **Dependencies**: BUILD-P3-001
  - **Implementation Notes**: Fixed unused eslint-disable directives in worker-configuration.d.ts and re-formatted with Prettier

- [ ] 🔴 **BUILD-P3-003**: Ensure production build succeeds
  - **Success Criteria**:
    - `npm run build` completes without errors
    - Build output compatible with Cloudflare Workers
    - All static assets generated correctly
    - Build size within budget
    - No build warnings
  - **Dependencies**: BUILD-P3-002

---

*End of TODO List*
