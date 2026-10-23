"use strict";
// ============================================
// @zerodrop/client
// Instant temporary email inboxes for CI/CD
// ============================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZeroDrop = exports.ZeroDropHeldError = exports.ZeroDropNetworkError = exports.ZeroDropAuthError = exports.ZeroDropTimeoutError = void 0;
const BASE_URL = "https://zerodrop.dev";
const FREE_DOMAIN = "zerodrop-sandbox.online";
const POLL_INTERVAL = 2000;
// A free key from https://zerodrop.dev/keys: zd_<prefix>_<32 letters/digits>.
// Inboxes named <prefix>-... can be read only with that key.
const KEY_FORMAT = /^zd_([a-z0-9]{4})_[A-Za-z0-9]{32}$/;
// A key goes into an HTTP header, so after trimming it may hold only visible
// ASCII. Anything else is refused without echoing the key: the runtime's own
// header check would quote the whole value in its error message.
const SENDABLE_KEY = /^[\x21-\x7e]+$/;
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
    constructor(detail) {
        super(`ZeroDrop: ${detail || "Invalid or missing API key."}`);
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
const HELD_DEFAULT = "ZeroDrop held the email sent to this inbox: without an API key, one sender can reach only a few " +
    "different inboxes a day. Get a free key at https://zerodrop.dev/keys and set ZERODROP_API_KEY.";
// Without an API key, one sender can reach only a few different inboxes a
// day. Past that, ZeroDrop holds the email and leaves a notice in the inbox
// instead; fetchLatest() and waitForLatest() then throw this, with the
// server's reason, rather than returning nothing until the timeout.
class ZeroDropHeldError extends Error {
    constructor(reason) {
        super(reason || HELD_DEFAULT);
        this.name = "ZeroDropHeldError";
    }
}
exports.ZeroDropHeldError = ZeroDropHeldError;
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
// Filter matcher
// Returns true if email matches all filter conditions
// ============================================
function matchesFilter(email, filter) {
    if (!filter)
        return true;
    if (filter.from) {
        const fromLower = email.from.toLowerCase();
        const filterLower = filter.from.toLowerCase();
        if (!fromLower.includes(filterLower))
            return false;
    }
    if (filter.subject) {
        const subjectLower = email.subject.toLowerCase();
        const filterLower = filter.subject.toLowerCase();
        if (!subjectLower.includes(filterLower))
            return false;
    }
    if (filter.body) {
        const bodyLower = email.body.toLowerCase();
        const filterLower = filter.body.toLowerCase();
        if (!bodyLower.includes(filterLower))
            return false;
    }
    if (filter.hasOtp === true && !email.otp)
        return false;
    if (filter.hasOtp === false && email.otp)
        return false;
    if (filter.hasMagicLink === true && !email.magicLink)
        return false;
    if (filter.hasMagicLink === false && email.magicLink)
        return false;
    return true;
}
function isNotice(item) {
    return item.held === true;
}
function heldError(notice) {
    return new ZeroDropHeldError(typeof notice.reason === "string" ? notice.reason.trim() : undefined);
}
function toEmail(item) {
    var _a, _b;
    return {
        id: item.id,
        from: item.from,
        to: item.to,
        subject: item.subject || "",
        body: extractBody(item.raw),
        rawBody: item.raw,
        receivedAt: new Date(item.receivedAt),
        otp: (_a = item.otp) !== null && _a !== void 0 ? _a : null,
        magicLink: (_b = item.magicLink) !== null && _b !== void 0 ? _b : null,
    };
}
// Parse a raw Redis email string (as the SSE stream sends it)
function parseItem(raw) {
    let parsed = JSON.parse(raw);
    // Redis REST API sometimes wraps values in an array
    if (Array.isArray(parsed))
        parsed = JSON.parse(parsed[0]);
    return parsed;
}
// ============================================
// API key helpers
// ============================================
// ZERODROP_API_KEY from the environment, where there is one (Node, Bun,
// Deno with env access). Browsers have none.
function envApiKey() {
    var _a, _b;
    try {
        const env = (_a = globalThis.process) === null || _a === void 0 ? void 0 : _a.env;
        const key = (_b = env === null || env === void 0 ? void 0 : env.ZERODROP_API_KEY) === null || _b === void 0 ? void 0 : _b.trim();
        return key ? key : null;
    }
    catch (_c) {
        return null;
    }
}
// The inbox prefix a key carries: "zd_k7x2_..." -> "k7x2".
function keyPrefix(apiKey) {
    const m = apiKey ? KEY_FORMAT.exec(apiKey) : null;
    return m ? m[1] : null;
}
// The server explains a 401 in its JSON body; pass that on.
async function authError(res) {
    try {
        const data = (await res.json());
        return new ZeroDropAuthError(typeof (data === null || data === void 0 ? void 0 : data.error) === "string" ? data.error : undefined);
    }
    catch (_a) {
        return new ZeroDropAuthError();
    }
}
// ============================================
// Random inbox generator (zero-auth)
// ============================================
// Without a key, an inbox's name is its only access control, so names come
// from a cryptographic random source where the runtime has one (Node 19+,
// browsers, Deno, Bun). Older runtimes fall back to Math.random.
function randomInt(max) {
    const webCrypto = globalThis.crypto;
    if (typeof (webCrypto === null || webCrypto === void 0 ? void 0 : webCrypto.getRandomValues) !== "function")
        return Math.floor(Math.random() * max);
    const limit = 256 - (256 % max); // bytes at or above this are discarded, so no value is favoured
    const byte = new Uint8Array(1);
    do
        webCrypto.getRandomValues(byte);
    while (byte[0] >= limit);
    return byte[0] % max;
}
function generateRandomInboxName() {
    const adjectives = [
        "swift", "dark", "cold", "null", "void",
        "zero", "dead", "raw", "base", "core"
    ];
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const adj = adjectives[randomInt(adjectives.length)];
    let id = "";
    for (let i = 0; i < 7; i++)
        id += chars[randomInt(chars.length)];
    return `${adj}-${id}`;
}
// ============================================
// Main ZeroDrop Client
// ============================================
class ZeroDrop {
    constructor(apiKey, options = {}) {
        // Trimmed like ZERODROP_API_KEY (trim also drops no-break spaces and
        // byte-order marks); a blank key falls back to the environment.
        this.apiKey = (apiKey === null || apiKey === void 0 ? void 0 : apiKey.trim()) || envApiKey();
        if (this.apiKey && !SENDABLE_KEY.test(this.apiKey)) {
            throw new TypeError("ZeroDrop: the API key contains a character that can't be sent in an HTTP header, " +
                "such as a line break. Copy it again from https://zerodrop.dev/keys.");
        }
        this.prefix = keyPrefix(this.apiKey);
        this.baseUrl = options.baseUrl || BASE_URL;
        if (!this.apiKey) {
            console.warn("[ZeroDrop] No API key: anyone who knows an inbox's name can read it, and one sender can reach only a few different inboxes a day.\n" +
                "[ZeroDrop] Free key for private, unlimited inboxes: https://zerodrop.dev/keys (set ZERODROP_API_KEY).\n" +
                "[ZeroDrop] Inboxes expire in 30 minutes. Free tier uses a shared domain — for production CI use Workspaces: https://zerodrop.dev");
        }
        else if (!this.prefix) {
            console.warn("[ZeroDrop] That API key isn't in the zd_xxxx_... format from https://zerodrop.dev/keys, " +
                "so generated inboxes get no prefix and stay public.");
        }
    }
    // ============================================
    // generateInbox()
    // Returns a ready-to-use email address instantly
    // No network request needed. With a key, the name
    // starts with your prefix: k7x2-swift-x7k29ab
    // ============================================
    generateInbox() {
        const name = generateRandomInboxName();
        return `${this.prefix ? `${this.prefix}-` : ""}${name}@${FREE_DOMAIN}`;
    }
    // ============================================
    // fetchLatest()
    // Fetches current emails for an inbox via REST
    // Returns null if empty or no match; throws
    // ZeroDropHeldError if the inbox has only a
    // notice that ZeroDrop held the email
    // ============================================
    async fetchLatest(inbox, filter) {
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
            throw await authError(res);
        if (!res.ok) {
            throw new ZeroDropNetworkError(`API returned ${res.status}`);
        }
        let data;
        try {
            data = await res.json();
        }
        catch (_a) {
            throw new ZeroDropNetworkError("Failed to parse API response");
        }
        if (!data.emails || data.emails.length === 0)
            return null;
        // Find the first email that matches the filter. A notice of held mail is
        // never returned as an email; if nothing matches, it explains why.
        let notice = null;
        for (const latest of data.emails) {
            if (isNotice(latest)) {
                notice !== null && notice !== void 0 ? notice : (notice = latest);
                continue;
            }
            const email = toEmail(latest);
            if (matchesFilter(email, filter))
                return email;
        }
        if (notice)
            throw heldError(notice);
        return null;
    }
    // ============================================
    // waitForLatestSSE()
    // Uses SSE stream for sub-second email delivery
    // Falls back to polling on error
    // ============================================
    async waitForLatestSSE(inbox, timeoutMs, filter) {
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
                                const item = parseItem(data);
                                // A notice of held mail: polling sees every item, and throws
                                // ZeroDropHeldError unless an email matches
                                if (isNotice(item))
                                    return null;
                                const email = toEmail(item);
                                if (matchesFilter(email, filter))
                                    return email;
                                // Email arrived but didn't match filter — keep waiting
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
    // Throws ZeroDropTimeoutError on timeout, and
    // ZeroDropHeldError at once if ZeroDrop held the email
    // Supports filter by sender, subject, body, otp, magicLink
    // ============================================
    async waitForLatest(inbox, options = {}) {
        var _a, _b;
        const timeout = (_a = options.timeout) !== null && _a !== void 0 ? _a : 10000;
        const pollInterval = (_b = options.pollInterval) !== null && _b !== void 0 ? _b : POLL_INTERVAL;
        const useSSE = options.sse !== false; // SSE on by default
        const filter = options.filter;
        // Try SSE first
        if (useSSE) {
            try {
                const email = await this.waitForLatestSSE(inbox, timeout, filter);
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
                const email = await this.fetchLatest(inbox, filter);
                if (email)
                    return email;
            }
            catch (err) {
                if (err instanceof ZeroDropAuthError || err instanceof ZeroDropHeldError)
                    throw err;
                console.warn(`[ZeroDrop] Poll error (retrying): ${err.message}`);
            }
            await this.sleep(pollInterval);
        }
        throw new ZeroDropTimeoutError(inbox, timeout);
    }
    // ============================================
    // onReceived()
    // ZeroDrop has no webhooks: the endpoint this
    // called was never built. Kept so existing code
    // compiles; it rejects at once.
    // ============================================
    /** @deprecated ZeroDrop has no webhooks. Use waitForLatest(). */
    async onReceived(_inbox, _webhookUrl) {
        throw new Error("ZeroDrop: webhooks aren't available. Use waitForLatest() to wait for an email.");
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