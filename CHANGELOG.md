# Changelog

All notable changes to `zerodrop-client` will be documented in this file.

---

## [0.4.0] — 2026-10-23

### Added
- `ZeroDropHeldError`. Without an API key, one sender can reach only a few different inboxes a day; past that, ZeroDrop holds the email and leaves a notice in the inbox instead. `fetchLatest()` and `waitForLatest()` now throw `ZeroDropHeldError` with the server's reason, and `waitForLatest()` stops at once instead of waiting until the timeout. A notice is never returned as an email.

### Changed
- Generated inbox names come from `crypto.getRandomValues()` where the runtime has it (Node 19+, browsers, Deno, Bun) instead of `Math.random()`. Without a key, the name is the inbox's only access control.
- `onReceived()` is deprecated and rejects at once. ZeroDrop has no webhooks: the endpoint it called was never built.
- The no-key warning mentions the daily limit.

---

## [0.3.1] — 2026-10-23

### Fixed
- A key with a character that can't be sent in an HTTP header, such as a line break, could appear in full in an error message, because the runtime's header check quotes the value. `new ZeroDrop()` now refuses such a key with a `TypeError` whose message never includes the key.
- A key passed to the constructor is trimmed like `ZERODROP_API_KEY`, and a blank one falls back to the environment.

---

## [0.3.0] — 2026-10-14

### Added
- Free API keys from https://zerodrop.dev/keys. `new ZeroDrop()` reads `ZERODROP_API_KEY` from the environment when no key is passed.
- With a key, `generateInbox()` starts names with your key's prefix (`k7x2-swift-x7k29ab`), and only your key can read those inboxes.
- `mail.prefix`: your key's inbox prefix, or `null` without a key.

### Changed
- A 401 now carries the server's reason in `ZeroDropAuthError.message`, for example when an inbox belongs to another key.
- The no-key warning points to https://zerodrop.dev/keys. A key that isn't in the `zd_xxxx_…` format gets its own warning.

---

## [0.2.2] — 2026-06-26

### Added
- Email filtering in `waitForLatest()` via `options.filter`
- `ZeroDropFilter` interface with five filter conditions:
  - `from` — partial match on sender address (case-insensitive)
  - `subject` — partial match on subject line (case-insensitive)
  - `body` — partial match on email body (case-insensitive)
  - `hasOtp` — only match emails with an auto-extracted OTP
  - `hasMagicLink` — only match emails with an auto-extracted magic link
- Filtering works in both SSE and polling modes
- `fetchLatest()` now accepts an optional `filter` parameter

### Usage
```typescript
const email = await mail.waitForLatest(inbox, {
  timeout: 15000,
  filter: {
    from: 'noreply@yourapp.com',
    subject: 'Verify',
    hasOtp: true
  }
})
```

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
- Status page URL updated to `https://zerodrop.instatus.com` in `ZeroDropNetworkError` message

### Changed
- `waitForLatest()` now uses SSE by default — no code changes needed in existing tests
- SDK bundle size increased from 6.8kB to 10.9kB due to SSE stream parsing logic

---

## [0.1.9] — 2026-06-14

### Added
- `ZeroDropNetworkError` — new error class thrown when the API is unreachable or returns an unexpected response
- Network resilience in `waitForLatest()` — network errors are now retried until timeout
- `fetchLatest()` fetch call wrapped in try/catch

### Changed
- Constructor warning updated to mention shared domain risk for free tier users

---

## [0.1.7] — 2026-06-13

### Added
- `otp` field on `ZeroDropEmail` — auto-extracted 4-8 digit OTP code
- `magicLink` field on `ZeroDropEmail` — auto-extracted verification or reset link
- Both fields extracted at Cloudflare edge — no regex needed in tests

### Changed
- `ZeroDropEmail` type updated with `otp` and `magicLink` fields
- README updated with OTP extraction examples

---

## [0.1.6] — 2026-06-13

### Added
- Initial `otp` and `magicLink` field support (type definitions only)

---

## [0.1.5] — 2026-06-13

### Added
- Test Isolation section to README
- Zero cross-test contamination messaging

---

## [0.1.4] — 2026-06-03

### Changed
- Internal stability improvements
- README updates

---

## [0.1.3] — 2026-06-02

### Fixed
- Minor type fixes

---

## [0.1.2] — 2026-06-01

### Added
- `waitForLatest()` timeout and pollInterval options
- `ZeroDropTimeoutError` for clean timeout handling in CI

---

## [0.1.1] — 2026-06-01

### Added
- `ZeroDropAuthError` for API key validation
- Webhook support via `onReceived()`

---

## [0.1.0] — 2026-06-01

### Initial release
- `generateInbox()` — local inbox generation, no network request
- `fetchLatest()` — poll inbox for latest email
- `waitForLatest()` — poll with timeout
- Free sandbox mode with no API key required
- TypeScript types included