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

export interface ZeroDropFilter {
  from?: string;             // Exact or partial match on sender address
  subject?: string;          // Exact or partial match on subject line
  body?: string;             // Partial match on email body
  hasOtp?: boolean;          // Only return emails with an extracted OTP
  hasMagicLink?: boolean;    // Only return emails with an extracted magic link
}

export interface WaitForLatestOptions {
  timeout?: number;
  pollInterval?: number;
  sse?: boolean;             // Use SSE for faster delivery (default: true)
  filter?: ZeroDropFilter;   // Filter emails by sender, subject, body, etc.
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
// Filter matcher
// Returns true if email matches all filter conditions
// ============================================

function matchesFilter(email: ZeroDropEmail, filter?: ZeroDropFilter): boolean {
  if (!filter) return true;

  if (filter.from) {
    const fromLower = email.from.toLowerCase();
    const filterLower = filter.from.toLowerCase();
    if (!fromLower.includes(filterLower)) return false;
  }

  if (filter.subject) {
    const subjectLower = email.subject.toLowerCase();
    const filterLower = filter.subject.toLowerCase();
    if (!subjectLower.includes(filterLower)) return false;
  }

  if (filter.body) {
    const bodyLower = email.body.toLowerCase();
    const filterLower = filter.body.toLowerCase();
    if (!bodyLower.includes(filterLower)) return false;
  }

  if (filter.hasOtp === true && !email.otp) return false;
  if (filter.hasOtp === false && email.otp) return false;

  if (filter.hasMagicLink === true && !email.magicLink) return false;
  if (filter.hasMagicLink === false && email.magicLink) return false;

  return true;
}

// ============================================
// Parse raw Redis email string into ZeroDropEmail
// ============================================

function parseEmail(raw: string): ZeroDropEmail {
  let parsed = JSON.parse(raw);
  // Redis REST API sometimes wraps values in an array
  if (Array.isArray(parsed)) parsed = JSON.parse(parsed[0]);
  const email = parsed as {
    id: string;
    from: string;
    to: string;
    subject: string;
    raw: string;
    receivedAt: string;
    otp?: string | null;
    magicLink?: string | null;
  };
  return {
    id: email.id,
    from: email.from,
    to: email.to,
    subject: email.subject || "",
    body: extractBody(email.raw),
    rawBody: email.raw,
    receivedAt: new Date(email.receivedAt),
    otp: email.otp ?? null,
    magicLink: email.magicLink ?? null,
  };
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
    return `${name}@${FREE_DOMAIN}`;
  }

  // ============================================
  // fetchLatest()
  // Fetches current emails for an inbox via REST
  // Returns null if empty or no match
  // ============================================

  async fetchLatest(
    inbox: string,
    filter?: ZeroDropFilter
  ): Promise<ZeroDropEmail | null> {
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

    // Find the first email that matches the filter
    for (const latest of data.emails) {
      const email: ZeroDropEmail = {
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

      if (matchesFilter(email, filter)) return email;
    }

    return null;
  }

  // ============================================
  // waitForLatestSSE()
  // Uses SSE stream for sub-second email delivery
  // Falls back to polling on error
  // ============================================

  private async waitForLatestSSE(
    inbox: string,
    timeoutMs: number,
    filter?: ZeroDropFilter
  ): Promise<ZeroDropEmail | null> {
    const inboxName = inbox.split("@")[0].toLowerCase();
    const headers: Record<string, string> = {};

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    let res: Response;

    try {
      res = await fetch(
        `${this.baseUrl}/api/inbox/${inboxName}/stream`,
        {
          headers,
          signal: AbortSignal.timeout(timeoutMs + 1000),
        }
      );
    } catch {
      return null; // Fall back to polling
    }

    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "__timeout__") return null;
            if (data) {
              try {
                const email = parseEmail(data);
                if (matchesFilter(email, filter)) return email;
                // Email arrived but didn't match filter — keep waiting
              } catch {
                return null;
              }
            }
          }
        }
      }
    } finally {
      reader.cancel();
    }

    return null;
  }

  // ============================================
  // waitForLatest()
  // Uses SSE by default for sub-second delivery
  // Falls back to polling if SSE fails
  // Throws ZeroDropTimeoutError on timeout
  // Supports filter by sender, subject, body, otp, magicLink
  // ============================================

  async waitForLatest(
    inbox: string,
    options: WaitForLatestOptions = {}
  ): Promise<ZeroDropEmail> {
    const timeout = options.timeout ?? 10000;
    const pollInterval = options.pollInterval ?? POLL_INTERVAL;
    const useSSE = options.sse !== false; // SSE on by default
    const filter = options.filter;

    // Try SSE first
    if (useSSE) {
      try {
        const email = await this.waitForLatestSSE(inbox, timeout, filter);
        if (email) return email;
      } catch {
        // SSE failed — fall through to polling
        console.warn("[ZeroDrop] SSE unavailable, falling back to polling");
      }
    }

    // Polling fallback
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const email = await this.fetchLatest(inbox, filter);
        if (email) return email;
      } catch (err) {
        if (err instanceof ZeroDropAuthError) throw err;
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