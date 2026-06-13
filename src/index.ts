// ============================================
// @zerodrop/client
// Instant temporary email inboxes for CI/CD
// ============================================

const BASE_URL = "https://zerodrop.dev";
const FREE_DOMAIN = "zerodrop-sandbox.online";
const POLL_INTERVAL = 2000;

// ============================================
// Types
// ============================================

export interface ZeroDropEmail {
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

export interface WaitForLatestOptions {
  timeout?: number;
  pollInterval?: number;
}

export interface ZeroDropOptions {
  baseUrl?: string;
}

// ============================================
// Custom Errors
// ============================================

export class ZeroDropTimeoutError extends Error {
  constructor(inbox: string, timeoutMs: number) {
    super(
      `ZeroDrop: No email received at "${inbox}" within ${timeoutMs}ms. ` +
      `Check that your app is sending to the correct address.`
    );
    this.name = "ZeroDropTimeoutError";
  }
}

export class ZeroDropAuthError extends Error {
  constructor() {
    super("ZeroDrop: Invalid or missing API key.");
    this.name = "ZeroDropAuthError";
  }
}

export class ZeroDropNetworkError extends Error {
  constructor(message: string) {
    super(
      `ZeroDrop: Network error — ${message}. ` +
      `Check https://zerodrop.instatus.com for service status.`
    );
    this.name = "ZeroDropNetworkError";
  }
}

// ============================================
// Email body extractor
// ============================================

function extractBody(raw: string): string {
  if (!raw) return "";
  const plainMatch = raw.match(
    /Content-Type: text\/plain[^\r\n]*\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\r\n--)/
  );
  if (plainMatch) return plainMatch[1].trim();
  const lines = raw.split("\r\n");
  const bodyStart = lines.findIndex((l) => l === "");
  return lines
    .slice(bodyStart + 1)
    .join("\n")
    .trim()
    .substring(0, 5000);
}

// ============================================
// Random inbox generator (zero-auth)
// ============================================

function generateRandomInboxName(): string {
  const adjectives = [
    "swift", "dark", "cold", "null", "void",
    "zero", "dead", "raw", "base", "core"
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const id = Math.random().toString(36).substring(2, 9);
  return `${adj}-${id}`;
}

// ============================================
// Main ZeroDrop Client
// ============================================

export class ZeroDrop {
  private apiKey: string | null;
  private baseUrl: string;

  constructor(apiKey?: string, options: ZeroDropOptions = {}) {
    this.apiKey = apiKey || null;
    this.baseUrl = options.baseUrl || BASE_URL;

    if (!apiKey) {
      console.warn(
        "[ZeroDrop] No API key provided. Running in public sandbox mode.\n" +
        "[ZeroDrop] Emails are AI-filtered and inboxes expire in 30 minutes.\n" +
        "[ZeroDrop] Free tier uses a shared domain — for production CI use Workspaces: https://zerodrop.dev"
      );
    }
  }

  // ============================================
  // generateInbox()
  // Returns a ready-to-use email address instantly
  // No network request needed
  // ============================================

  generateInbox(): string {
    const name = generateRandomInboxName();
    const domain = FREE_DOMAIN;
    return `${name}@${domain}`;
  }

  // ============================================
  // fetchLatest()
  // Fetches current emails for an inbox
  // Returns null if empty
  // ============================================

  async fetchLatest(inbox: string): Promise<ZeroDropEmail | null> {
    const inboxName = inbox.split("@")[0].toLowerCase();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    let res: Response;

    try {
      res = await fetch(
        `${this.baseUrl}/api/inbox/${inboxName}?source=sdk`,
        { headers }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "fetch failed";
      throw new ZeroDropNetworkError(message);
    }

    if (res.status === 401) throw new ZeroDropAuthError();

    if (!res.ok) {
      throw new ZeroDropNetworkError(`API returned ${res.status}`);
    }

    let data: {
      emails: Array<{
        id: string;
        from: string;
        to: string;
        subject: string;
        raw: string;
        receivedAt: string;
        otp?: string | null;
        magicLink?: string | null;
      }>;
      count: number;
    };

    try {
      data = await res.json();
    } catch {
      throw new ZeroDropNetworkError("Failed to parse API response");
    }

    if (!data.emails || data.emails.length === 0) return null;

    const latest = data.emails[0];

    return {
      id: latest.id,
      from: latest.from,
      to: latest.to,
      subject: latest.subject || "",
      body: extractBody(latest.raw),
      rawBody: latest.raw,
      receivedAt: new Date(latest.receivedAt),
      otp: latest.otp ?? null,
      magicLink: latest.magicLink ?? null,
    };
  }

  // ============================================
  // waitForLatest()
  // Polls until an email arrives or timeout
  // Network errors are retried until timeout
  // Throws ZeroDropTimeoutError on timeout
  // ============================================

  async waitForLatest(
    inbox: string,
    options: WaitForLatestOptions = {}
  ): Promise<ZeroDropEmail> {
    const timeout = options.timeout ?? 10000;
    const pollInterval = options.pollInterval ?? POLL_INTERVAL;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const email = await this.fetchLatest(inbox);
        if (email) return email;
      } catch (err) {
        // Retry network errors until timeout
        // Auth errors are re-thrown immediately
        if (err instanceof ZeroDropAuthError) throw err;
        // Log network errors but keep polling
        console.warn(`[ZeroDrop] Poll error (retrying): ${(err as Error).message}`);
      }
      await this.sleep(pollInterval);
    }

    throw new ZeroDropTimeoutError(inbox, timeout);
  }

  // ============================================
  // onReceived()
  // Registers a webhook for a workspace inbox
  // Requires API key
  // ============================================

  async onReceived(
    inbox: string,
    webhookUrl: string
  ): Promise<{ registered: boolean }> {
    if (!this.apiKey) {
      throw new ZeroDropAuthError();
    }

    let res: Response;

    try {
      res = await fetch(`${this.baseUrl}/api/webhooks/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ inbox, webhookUrl }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "fetch failed";
      throw new ZeroDropNetworkError(message);
    }

    if (res.status === 401) throw new ZeroDropAuthError();

    if (!res.ok) {
      throw new ZeroDropNetworkError(`Webhook registration failed: ${res.status}`);
    }

    return { registered: true };
  }

  // ============================================
  // Private helpers
  // ============================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// Default export for convenience
// ============================================

export default ZeroDrop;