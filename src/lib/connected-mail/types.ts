/** Framework-independent contracts: copy this directory into any Node.js application. */
export type MailErrorCode = "NOT_CONFIGURED" | "NOT_CONNECTED" | "RECONNECT" | "RATE_LIMIT" | "DELIVERY_UNKNOWN" | "PROVIDER_ERROR" | "INVALID_FLOW";
export class MailError extends Error {
  constructor(public readonly code: MailErrorCode) { super(code); this.name = "MailError"; }
}
export type MailMessage = { to: string; subject: string; text: string; messageId: string };
export type MailCredentials = { refreshToken: string };
export type AuthorizedMailbox = { subject: string; email: string; credentials: MailCredentials };
export interface MailProvider {
  authorizationUrl(state: string, challenge: string): string;
  exchange(code: string, verifier: string): Promise<AuthorizedMailbox>;
  refresh(credentials: MailCredentials): Promise<{ accessToken: string; credentials: MailCredentials }>;
  send(accessToken: string, from: string, message: MailMessage): Promise<string>;
}
