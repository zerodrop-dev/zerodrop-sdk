# zerodrop-client

Instant temporary email inboxes for testing auth flows, CI pipelines, and QA automation.

No signup. No configuration. Works in 4 lines.

## Install

```bash
npm install zerodrop-client
```

## Zero-Auth Mode (Local Development)

```javascript
import { ZeroDrop } from 'zerodrop-client';

const mail = new ZeroDrop();
const inbox = mail.generateInbox();
// → "swift-x7k29@zerodrop-sandbox.online"

const email = await mail.waitForLatest(inbox, { timeout: 10000 });
console.log(email.subject); // "Reset your password"
console.log(email.body);    // "Click here to reset..."
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

  const resetLink = email.body.match(/https?:\/\/[^\s]+/)[0];
  await page.goto(resetLink);
});
```

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
| Email retention | 30 min | 7 days |
| Custom domains | ✗ | ✓ |
| API key | ✗ | ✓ |
| Webhooks | ✗ | ✓ |
| AI spam filter | On | Off |

Get a Workspace at [zerodrop.dev](https://zerodrop.dev)

## License

MIT