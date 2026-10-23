# zerodrop-client

[![npm version](https://img.shields.io/npm/v/zerodrop-client.svg)](https://www.npmjs.com/package/zerodrop-client)
[![npm downloads](https://img.shields.io/npm/dm/zerodrop-client.svg)](https://www.npmjs.com/package/zerodrop-client)
[![license](https://img.shields.io/npm/l/zerodrop-client.svg)](https://github.com/zerodrop-dev/zerodrop-sdk/blob/main/LICENSE)

Email verification infrastructure for CI pipelines and AI agents.

Send a verification email. Catch it at the edge. Get `email.otp` and `email.magicLink` back — auto-extracted, no regex, no Docker, no signup to try.

```javascript
const email = await mail.waitForLatest(inbox);

email.otp        // "123456" — auto-extracted
email.magicLink  // "https://..." — no regex needed
```

**[Documentation](https://docs.zerodrop.dev)** · [GitHub](https://github.com/zerodrop-dev) · [Status](https://zerodrop.instatus.com)

## Install

```bash
npm install zerodrop-client
```

## Test Isolation

Every inbox is isolated by default. `generateInbox()` returns a unique, random address on every call — no shared state, no pools, no configuration needed.

Zero cross-test contamination. Every test gets its own inbox, which expires automatically 30 minutes after its latest email.

This means parallel CI builds work out of the box — 10 workers, 10 inboxes, zero race conditions. Without an API key, one sender can reach only 5 different inboxes a day, so for a CI suite get a [free key](#free-api-key-private-inboxes).

## Zero-Auth Mode (Local Development)

```javascript
import { ZeroDrop } from 'zerodrop-client';

const mail = new ZeroDrop();
const inbox = mail.generateInbox();
// → "swift-x7k29@zerodrop-sandbox.online"

const email = await mail.waitForLatest(inbox, { timeout: 10000 });
console.log(email.subject);   // "Reset your password"
console.log(email.otp);       // "123456" — auto-extracted, no regex needed
console.log(email.magicLink); // "https://..." — auto-extracted verification link
```

## Free API Key (Private Inboxes)

Without a key, anyone who knows an inbox's name can read it, and one sender can reach only 5 different inboxes a day. With a free key, your inboxes start with your own prefix, only your key can read them, and mail to them isn't limited.

1. Sign in with GitHub at [zerodrop.dev/keys](https://zerodrop.dev/keys) and create a key.
2. Set it as `ZERODROP_API_KEY`. The client reads it automatically, or you can pass it to the constructor.

```javascript
const mail = new ZeroDrop();          // reads ZERODROP_API_KEY when it's set
const inbox = mail.generateInbox();
// → "k7x2-swift-x7k29ab@zerodrop-sandbox.online", where k7x2 is your prefix
```

Reading a `k7x2-…` inbox without your key fails with a `ZeroDropAuthError` that says why. Without a key, if ZeroDrop held an email because its sender passed the daily limit, the inbox gets a notice instead, and `fetchLatest()` and `waitForLatest()` throw a `ZeroDropHeldError` that says so (0.4.0 or later; older versions return the notice as if it were the email, or time out when a filter skips it). `mail.prefix` holds your prefix if you build an address yourself. A key holding a character that can't be sent in an HTTP header (a line break, say) makes `new ZeroDrop()` throw a `TypeError`; the message never includes the key.

## CI Pipeline Mode (Playwright / Cypress)

```javascript
import { ZeroDrop } from 'zerodrop-client';

const mail = new ZeroDrop(process.env.ZERODROP_API_KEY);

test('password reset flow', async ({ page }) => {
  const inbox = mail.generateInbox();

  await page.goto('/forgot-password');
  await page.fill('[name="email"]', inbox);
  await page.click('[type="submit"]');

  const email = await mail.waitForLatest(inbox, { timeout: 15000 });
  expect(email.subject).toContain('Reset your password');

  // No regex — magicLink is auto-extracted at the edge
  await page.goto(email.magicLink);
});
```

## OTP Auto-Extraction

ZeroDrop extracts OTP codes and magic links at the edge before emails reach your test suite. No regex required.

```javascript
const email = await mail.waitForLatest(inbox);

// Auto-extracted fields
email.otp        // "123456" — 4-8 digit verification code
email.magicLink  // "https://app.com/verify?token=abc" — verification/reset link

// Raw body still available if you need it
email.body       // Full plain-text body
```

Both fields are `null` if not detected in the email.

## Email Filtering

Filter emails by sender, subject, body, or extracted fields. Useful when multiple emails land in the same inbox.

```javascript
// Only match emails from a specific sender
const email = await mail.waitForLatest(inbox, {
  filter: { from: 'noreply@yourapp.com' }
});

// Only match emails with a specific subject
const email = await mail.waitForLatest(inbox, {
  filter: { subject: 'Verify your email' }
});

// Only match emails that contain an OTP
const email = await mail.waitForLatest(inbox, {
  filter: { hasOtp: true }
});

// Only match emails that contain a magic link
const email = await mail.waitForLatest(inbox, {
  filter: { hasMagicLink: true }
});

// Combine multiple filters
const email = await mail.waitForLatest(inbox, {
  timeout: 15000,
  filter: {
    from: 'noreply@yourapp.com',
    subject: 'Reset',
    hasMagicLink: true
  }
});
```

All string filters are case-insensitive partial matches.

## Parallel CI Runs

Inbox generation is client-side — no API call.
50 parallel tests generate 50 inboxes instantly. Mail to them needs a
free API key: without one, one sender can reach only 5 different
inboxes a day.

```javascript
// Safe to run in parallel — generateInbox() is local
const inboxes = Array.from({ length: 50 }, () => mail.generateInbox());
```

The rate limit applies to the polling endpoint — 20 requests
per 10 seconds per IP on the free tier. For heavy parallel
usage, stagger `waitForLatest()` calls slightly:

```javascript
// Stagger polls to avoid burst on shared IP
const results = await Promise.all(
  inboxes.map((inbox, i) =>
    new Promise(resolve => setTimeout(resolve, i * 100))
      .then(() => mail.waitForLatest(inbox, { timeout: 15000 }))
  )
);
```

Polls are rate-limited per IP address (20 requests per
10 seconds), so stagger large parallel runs as above.

## API

### `new ZeroDrop(apiKey?, options?)`
- `apiKey` — optional. Defaults to the `ZERODROP_API_KEY` environment variable. Without a key, inboxes are public to anyone who knows the name.
- `options.baseUrl` — override the API base URL.

### `mail.generateInbox(): string`
Returns a ready-to-use email address instantly. No network request. With a key, the name starts with your prefix.

### `mail.prefix: string | null`
Your key's inbox prefix (`"k7x2"`), or `null` without a key.

### `mail.fetchLatest(inbox, filter?): Promise<ZeroDropEmail | null>`
Returns the latest email matching the filter, or null if none matches. Throws `ZeroDropHeldError` if nothing matches and the inbox has a notice that ZeroDrop held an email.

### `mail.waitForLatest(inbox, options?): Promise<ZeroDropEmail>`
Uses a server-sent event stream, and falls back to polling automatically.
Throws `ZeroDropTimeoutError` on timeout, and `ZeroDropHeldError` at once if ZeroDrop held the email (see below).
- `options.timeout` — ms to wait (default: 10000)
- `options.pollInterval` — ms between polls in fallback mode (default: 2000)
- `options.sse` — set `false` to force polling mode (default: true)
- `options.filter` — filter emails by sender, subject, body, otp, magicLink

## Types

```typescript
interface ZeroDropEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  rawBody: string;
  receivedAt: Date;
  otp: string | null;        // Auto-extracted OTP code (4-8 digits)
  magicLink: string | null;  // Auto-extracted verification/reset link
}

interface ZeroDropFilter {
  from?: string;             // Partial match on sender address
  subject?: string;          // Partial match on subject line
  body?: string;             // Partial match on email body
  hasOtp?: boolean;          // Only match emails with an extracted OTP
  hasMagicLink?: boolean;    // Only match emails with an extracted magic link
}
```

## Error Handling

```javascript
import { ZeroDrop, ZeroDropTimeoutError, ZeroDropHeldError } from 'zerodrop-client';

try {
  const email = await mail.waitForLatest(inbox, { timeout: 10000 });
} catch (err) {
  if (err instanceof ZeroDropTimeoutError) {
    console.error('No email received — check your app is sending correctly');
  } else if (err instanceof ZeroDropHeldError) {
    // Without an API key, the sender passed the daily limit. The message
    // says so; a free key from https://zerodrop.dev/keys lifts it.
    console.error(err.message);
  }
}
```

| Error | When |
|---|---|
| `ZeroDropTimeoutError` | No email arrived within the timeout |
| `ZeroDropHeldError` | ZeroDrop held the email: without an API key, its sender passed the daily limit (5 different inboxes a day) |
| `ZeroDropAuthError` | The inbox belongs to an API key, and the request had no key or another one |
| `ZeroDropNetworkError` | The API couldn't be reached or answered with an error |

## Free vs Workspace

| | Free | Workspace |
|---|---|---|
| Inbox generation | ✓ | ✓ |
| OTP auto-extraction | ✓ | ✓ |
| Magic link extraction | ✓ | ✓ |
| Email filtering | ✓ | ✓ |
| Email retention | 30 min | Extended |
| Custom domains | ✗ | ✓ |
| API key | ✓ free at [zerodrop.dev/keys](https://zerodrop.dev/keys) | ✓ |
| Daily limit per sender | 5 inboxes without a key, none with one | None |

Get a Workspace at [zerodrop.dev](https://zerodrop.dev)

## License

MIT