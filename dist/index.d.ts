export interface ZeroDropEmail {
    id: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    rawBody: string;
    receivedAt: Date;
    otp: string | null;
    magicLink: string | null;
}
export interface ZeroDropFilter {
    from?: string;
    subject?: string;
    body?: string;
    hasOtp?: boolean;
    hasMagicLink?: boolean;
}
export interface WaitForLatestOptions {
    timeout?: number;
    pollInterval?: number;
    sse?: boolean;
    filter?: ZeroDropFilter;
}
export interface ZeroDropOptions {
    baseUrl?: string;
}
export declare class ZeroDropTimeoutError extends Error {
    constructor(inbox: string, timeoutMs: number);
}
export declare class ZeroDropAuthError extends Error {
    constructor(detail?: string);
}
export declare class ZeroDropNetworkError extends Error {
    constructor(message: string);
}
export declare class ZeroDrop {
    private apiKey;
    private baseUrl;
    /** The inbox prefix your key carries ("k7x2"), or null without a key. */
    readonly prefix: string | null;
    constructor(apiKey?: string, options?: ZeroDropOptions);
    generateInbox(): string;
    fetchLatest(inbox: string, filter?: ZeroDropFilter): Promise<ZeroDropEmail | null>;
    private waitForLatestSSE;
    waitForLatest(inbox: string, options?: WaitForLatestOptions): Promise<ZeroDropEmail>;
    onReceived(inbox: string, webhookUrl: string): Promise<{
        registered: boolean;
    }>;
    private sleep;
}
export default ZeroDrop;
//# sourceMappingURL=index.d.ts.map