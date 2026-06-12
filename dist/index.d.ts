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
export interface WaitForLatestOptions {
    timeout?: number;
    pollInterval?: number;
}
export interface ZeroDropOptions {
    baseUrl?: string;
}
export declare class ZeroDropTimeoutError extends Error {
    constructor(inbox: string, timeoutMs: number);
}
export declare class ZeroDropAuthError extends Error {
    constructor();
}
export declare class ZeroDrop {
    private apiKey;
    private baseUrl;
    constructor(apiKey?: string, options?: ZeroDropOptions);
    generateInbox(): string;
    fetchLatest(inbox: string): Promise<ZeroDropEmail | null>;
    waitForLatest(inbox: string, options?: WaitForLatestOptions): Promise<ZeroDropEmail>;
    onReceived(inbox: string, webhookUrl: string): Promise<{
        registered: boolean;
    }>;
    private sleep;
}
export default ZeroDrop;
//# sourceMappingURL=index.d.ts.map