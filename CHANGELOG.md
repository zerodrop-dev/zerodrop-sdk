# Changelog

All notable changes to `zerodrop-client` will be documented in this file.

---

## [0.2.1] — 2026-06-15

### Fixed
- SSE `parseEmail` now correctly handles array-wrapped Redis values — fixes empty `id` and `subject` fields when using SSE mode

---

## [0.2.0] — 2026-06-15

### Added
- SSE (Server-Sent Events) support in `waitForLatest()` — emails now arrive in sub-second latency instead of polling every 2 seconds
- SSE uses a backoff strategy: 500ms → 1000ms → 2000ms to respect Vercel Edge CPU limits
- Automatic fallback to polling if SSE connection fails or is unavailable
- `sse` option in `WaitForLatestOptions` — set `sse: false` to force polling mode

### Fixed
- Status page URL updated to `https://zerodrop.instatus.com` in `ZeroDropNetworkError` message (was previously pointing to an undeployed URL)

### Changed
- `waitForLatest()` now uses SSE by default — no code changes needed in existing tests
- SDK bundle size increased from 6.8kB to 10.9kB due to SSE stream parsing logic

---

## [0.1.9] — 2026-06-14

### Added
- `ZeroDropNetworkError` — new error class thrown when the API is unreachable or returns an unexpected response. Includes a link to `https://status.zerodrop.dev` in the error message.
- Network resilience in `waitForLatest()` — network errors are now retried until the timeout expires rather than crashing the test runner. Auth errors are still re-thrown immediately.
- `fetchLatest()` fetch call wrapped in try/catch — prevents unhandled `TypeError: fetch failed` from propagating to CI runners.

### Changed
- Constructor warning updated to mention shared domain risk for free tier users.

---

## [0.1.7] — 2026-06-13

### Added
- `otp` field on `ZeroDropEmail` — auto-extracted 4-8 digit OTP code. `null` if not detected.
- `magicLink` field on `ZeroDropEmail` — auto-extracted verification or reset link. `null` if not detected.
- Both fields are extracted at the Cloudflare edge before the email reaches Redis — no regex needed in tests.

### Changed
- `ZeroDropEmail` type updated with `otp` and `magicLink` fields.
- README updated with OTP extraction examples and updated type block.
- CI Pipeline Mode example updated to use `email.magicLink` instead of regex.

---

## [0.1.6] — 2026-06-13

### Added
- Initial `otp` and `magicLink` field support (type definitions only).

---

## [0.1.5] — 2026-06-13

### Added
- Test Isolation section to README — documents that every inbox is cryptographically isolated by default.
- Zero cross-test contamination messaging.

---

## [0.1.4] — 2026-06-03

### Changed
- Internal stability improvements.
- README updates.

---

## [0.1.3] — 2026-06-02

### Fixed
- Minor type fixes.

---

## [0.1.2] — 2026-06-01

### Added
- `waitForLatest()` timeout and pollInterval options.
- `ZeroDropTimeoutError` for clean timeout handling in CI.

---

## [0.1.1] — 2026-06-01

### Added
- `ZeroDropAuthError` for API key validation.
- Webhook support via `onReceived()`.

---

## [0.1.0] — 2026-06-01

### Initial release
- `generateInbox()` — local inbox generation, no network request.
- `fetchLatest()` — poll inbox for latest email.
- `waitForLatest()` — poll with timeout.
- Free sandbox mode with no API key required.
- TypeScript types included.
