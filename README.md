# zerodrop-client

Instant temporary email inboxes for testing auth flows, CI pipelines, and QA automation.

No signup. No configuration. Works in 4 lines.

## Install

```bash
npm install zerodrop-client
```

## Test Isolation

Every inbox is isolated by default. `generateInbox()` returns a unique address on every call — no shared state, no pools, no configuration needed.

Zero cross-test contamination. Every test run gets a cryptographically isolated inbox that expires automatically after 30 minutes.

This means parallel CI builds work out of the box — 10 workers, 10 inboxes, zero race conditions.

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

## Parallel CI Runs

Inbox generation is client-side — no API call, no throttling.
50 parallel tests generate 50 inboxes instantly.

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

For CI pipelines with 20+ parallel tests, use a Workspace
API key — dedicated rate limit bucket, not shared with
the public pool.

## Webhook Mode (Staging Servers)

```javascript
const mail = new ZeroDrop(process.env.ZERODROP_API_KEY);

await mail.onReceived('qa-test@yourcompany.com', 'https://your-server.com/webhook');
// ZeroDrop POSTs the email JSON to your URL when it arrives
```

## API

### `new ZeroDrop(apiKey?, options?)`
- `apiKey` — optional. Omit for free sandbox mode.
- `options.baseUrl` — override the API base URL.

### `mail.generateInbox(): string`
Returns a ready-to-use email address instantly. No network request.

### `mail.fetchLatest(inbox): Promise<ZeroDropEmail | null>`
Returns the latest email or null if inbox is empty.

### `mail.waitForLatest(inbox, options?): Promise<ZeroDropEmail>`
Polls until an email arrives. Throws `ZeroDropTimeoutError` on timeout.
- `options.timeout` — ms to wait (default: 10000)
- `options.pollInterval` — ms between polls (default: 2000)

### `mail.onReceived(inbox, webhookUrl): Promise<{ registered: boolean }>`
Registers a webhook. Requires API key (Workspace tier).

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
```

## Error Handling

```javascript
import { ZeroDrop, ZeroDropTimeoutError } from 'zerodrop-client';

try {
  const email = await mail.waitForLatest(inbox, { timeout: 10000 });
} catch (err) {
  if (err instanceof ZeroDropTimeoutError) {
    console.error('No email received — check your app is sending correctly');
  }
}
```

## Free vs Workspace

| | Free | Workspace |
|---|---|---|
| Inbox generation | ✓ | ✓ |
| OTP auto-extraction | ✓ | ✓ |
| Magic link extraction | ✓ | ✓ |
| Email retention | 30 min | 7 days |
| Custom domains | ✗ | ✓ |
| API key | ✗ | ✓ |
| Webhooks | ✗ | ✓ |
| AI spam filter | On | Off |

Get a Workspace at [zerodrop.dev](https://zerodrop.dev)

## License

MIT
