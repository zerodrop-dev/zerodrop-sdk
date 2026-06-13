"use strict";
// ============================================
// @zerodrop/client
// Instant temporary email inboxes for CI/CD
// ============================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZeroDrop = exports.ZeroDropNetworkError = exports.ZeroDropAuthError = exports.ZeroDropTimeoutError = void 0;
const BASE_URL = "https://zerodrop.dev";
const FREE_DOMAIN = "zerodrop-sandbox.online";
const POLL_INTERVAL = 2000;
// ============================================
// Custom Errors
// ============================================
class ZeroDropTimeoutError extends Error {
    constructor(inbox, timeoutMs) {
        super(`ZeroDrop: No email received at "${inbox}" within ${timeoutMs}ms. ` +
            `Check that your app is sending to the correct address.`);
        this.name = "ZeroDropTimeoutError";
    }
}
exports.ZeroDropTimeoutError = ZeroDropTimeoutError;
class ZeroDropAuthError extends Error {
    constructor() {
        super("ZeroDrop: Invalid or missing API key.");
        this.name = "ZeroDropAuthError";
    }
}
exports.ZeroDropAuthError = ZeroDropAuthError;
class ZeroDropNetworkError extends Error {
    constructor(message) {
        super(`ZeroDrop: Network error — ${message}. ` +
            `Check https://zerodrop.instatus.com for service status.`);
        this.name = "ZeroDropNetworkError";
    }
}
exports.ZeroDropNetworkError = ZeroDropNetworkError;
// ============================================
// Email body extractor
// ============================================
function extractBody(raw) {
    if (!raw)
        return "";
    const plainMatch = raw.match(/Content-Type: text\/plain[^\r\n]*\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\r\n--)/);
    if (plainMatch)
        return plainMatch[1].trim();
    const lines = raw.split("\r\n");
    const bodyStart = lines.findIndex((l) => l === "");
    return lines
        .slice(bodyStart + 1)
        .join("\n")
        .trim()
        .substring(0, 5000);
}
// ============================================
// Parse raw Redis email string into ZeroDropEmail
// ============================================
function parseEmail(raw) {
    var _a, _b;
    const parsed = JSON.parse(raw);
    return {
        id: parsed.id,
        from: parsed.from,
        to: parsed.to,
        subject: parsed.subject || "",
        body: extractBody(parsed.raw),
        rawBody: parsed.raw,
        receivedAt: new Date(parsed.receivedAt),
        otp: (_a = parsed.otp) !== null && _a !== void 0 ? _a : null,
        magicLink: (_b = parsed.magicLink) !== null && _b !== void 0 ? _b : null,
    };
}
// ============================================
// Random inbox generator (zero-auth)
// ============================================
function generateRandomInboxName() {
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
class ZeroDrop {
    constructor(apiKey, options = {}) {
        this.apiKey = apiKey || null;
        this.baseUrl = options.baseUrl || BASE_URL;
        if (!apiKey) {
            console.warn("[ZeroDrop] No API key provided. Running in public sandbox mode.\n" +
                "[ZeroDrop] Emails are AI-filtered and inboxes expire in 30 minutes.\n" +
                "[ZeroDrop] Free tier uses a shared domain — for production CI use Workspaces: https://zerodrop.dev");
        }
    }
    // ============================================
    // generateInbox()
    // Returns a ready-to-use email address instantly
    // No network request needed
    // ============================================
    generateInbox() {
        const name = generateRandomInboxName();
        return `${name}@${FREE_DOMAIN}`;
    }
    // ============================================
    // fetchLatest()
    // Fetches current emails for an inbox via REST
    // Returns null if empty
    // ============================================
    async fetchLatest(inbox) {
        var _a, _b;
        const inboxName = inbox.split("@")[0].toLowerCase();
        const headers = {
            "Content-Type": "application/json",
        };
        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }
        let res;
        try {
            res = await fetch(`${this.baseUrl}/api/inbox/${inboxName}?source=sdk`, { headers });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "fetch failed";
            throw new ZeroDropNetworkError(message);
        }
        if (res.status === 401)
            throw new ZeroDropAuthError();
        if (!res.ok) {
            throw new ZeroDropNetworkError(`API returned ${res.status}`);
        }
        let data;
        try {
            data = await res.json();
        }
        catch (_c) {
            throw new ZeroDropNetworkError("Failed to parse API response");
        }
        if (!data.emails || data.emails.length === 0)
            return null;
        const latest = data.emails[0];
        return {
            id: latest.id,
            from: latest.from,
            to: latest.to,
            subject: latest.subject || "",
            body: extractBody(latest.raw),
            rawBody: latest.raw,
            receivedAt: new Date(latest.receivedAt),
            otp: (_a = latest.otp) !== null && _a !== void 0 ? _a : null,
            magicLink: (_b = latest.magicLink) !== null && _b !== void 0 ? _b : null,
        };
    }
    // ============================================
    // waitForLatestSSE()
    // Uses SSE stream for sub-second email delivery
    // Falls back to polling on error
    // ============================================
    async waitForLatestSSE(inbox, timeoutMs) {
        var _a;
        const inboxName = inbox.split("@")[0].toLowerCase();
        const headers = {};
        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }
        let res;
        try {
            res = await fetch(`${this.baseUrl}/api/inbox/${inboxName}/stream`, {
                headers,
                signal: AbortSignal.timeout(timeoutMs + 1000),
            });
        }
        catch (_b) {
            return null; // Fall back to polling
        }
        if (!res.ok || !res.body)
            return null;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = (_a = lines.pop()) !== null && _a !== void 0 ? _a : "";
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6).trim();
                        if (data === "__timeout__")
                            return null;
                        if (data) {
                            try {
                                return parseEmail(data);
                            }
                            catch (_c) {
                                return null;
                            }
                        }
                    }
                }
            }
        }
        finally {
            reader.cancel();
        }
        return null;
    }
    // ============================================
    // waitForLatest()
    // Uses SSE by default for sub-second delivery
    // Falls back to polling if SSE fails
    // Throws ZeroDropTimeoutError on timeout
    // ============================================
    async waitForLatest(inbox, options = {}) {
        var _a, _b;
        const timeout = (_a = options.timeout) !== null && _a !== void 0 ? _a : 10000;
        const pollInterval = (_b = options.pollInterval) !== null && _b !== void 0 ? _b : POLL_INTERVAL;
        const useSSE = options.sse !== false; // SSE on by default
        // Try SSE first
        if (useSSE) {
            try {
                const email = await this.waitForLatestSSE(inbox, timeout);
                if (email)
                    return email;
            }
            catch (_c) {
                // SSE failed — fall through to polling
                console.warn("[ZeroDrop] SSE unavailable, falling back to polling");
            }
        }
        // Polling fallback
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                const email = await this.fetchLatest(inbox);
                if (email)
                    return email;
            }
            catch (err) {
                if (err instanceof ZeroDropAuthError)
                    throw err;
                console.warn(`[ZeroDrop] Poll error (retrying): ${err.message}`);
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
    async onReceived(inbox, webhookUrl) {
        if (!this.apiKey) {
            throw new ZeroDropAuthError();
        }
        let res;
        try {
            res = await fetch(`${this.baseUrl}/api/webhooks/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({ inbox, webhookUrl }),
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "fetch failed";
            throw new ZeroDropNetworkError(message);
        }
        if (res.status === 401)
            throw new ZeroDropAuthError();
        if (!res.ok) {
            throw new ZeroDropNetworkError(`Webhook registration failed: ${res.status}`);
        }
        return { registered: true };
    }
    // ============================================
    // Private helpers
    // ============================================
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.ZeroDrop = ZeroDrop;
// ============================================
// Default export for convenience
// ============================================
exports.default = ZeroDrop;
//# sourceMappingURL=index.js.map