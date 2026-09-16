import { MailError, type MailCredentials, type MailMessage, type MailProvider } from "./types";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };
type TokenResponse = { access_token?: string; refresh_token?: string; scope?: string; error?: string };
const emailPattern = /^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/;

/** Only requests sending and verified account identity, never mailbox-reading access. */
export function googleMailProvider(config: GoogleConfig): MailProvider {
  async function token(parameters: Record<string, string>): Promise<TokenResponse> {
    let response: Response;
    try {
      response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }),
      });
    } catch { throw new MailError("PROVIDER_ERROR"); }
    const body = await response.json() as TokenResponse;
    if (body.error === "invalid_grant") throw new MailError("RECONNECT");
    if (response.status === 429) throw new MailError("RATE_LIMIT");
    if (!response.ok || !body.access_token) throw new MailError("PROVIDER_ERROR");
    return body;
  }
  return {
    authorizationUrl(state, challenge) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code",
        scope: `openid email ${GMAIL_SEND_SCOPE}`, access_type: "offline", prompt: "consent select_account",
        state, code_challenge: challenge, code_challenge_method: "S256",
      }).toString();
      return url.toString();
    },
    async exchange(code, verifier) {
      const granted = await token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: config.redirectUri });
      if (!granted.refresh_token || !granted.scope?.split(" ").includes(GMAIL_SEND_SCOPE)) throw new MailError("RECONNECT");
      const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${granted.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
      });
      const profile = await response.json() as { sub?: string; email?: string; email_verified?: boolean };
      if (!response.ok || !profile.sub || !profile.email_verified || !profile.email || !emailPattern.test(profile.email)) throw new MailError("RECONNECT");
      return { subject: profile.sub, email: profile.email.toLowerCase(), credentials: { refreshToken: granted.refresh_token } };
    },
    async refresh(credentials: MailCredentials) {
      const result = await token({ grant_type: "refresh_token", refresh_token: credentials.refreshToken });
      return { accessToken: result.access_token!, credentials: { refreshToken: result.refresh_token ?? credentials.refreshToken } };
    },
    async send(accessToken: string, from: string, message: MailMessage) {
      if (!emailPattern.test(from) || !emailPattern.test(message.to) || /[\r\n]/.test(message.subject)
        || !/^[a-zA-Z0-9._@-]+$/.test(message.messageId) || message.subject.length > 500 || message.text.length > 200000) {
        throw new MailError("PROVIDER_ERROR");
      }
      // RFC 2047 encoded words and base64 body keep arbitrary Unicode and header injection safe.
      const words: string[] = [];
      let word = "";
      for (const character of message.subject) {
        if (Buffer.byteLength(word + character) > 30) { words.push(word); word = ""; }
        word += character;
      }
      words.push(word);
      const subject = words.map(part => `=?UTF-8?B?${Buffer.from(part).toString("base64")}?=`).join("\r\n ");
      const body = Buffer.from(message.text).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
      const mime = [`From: ${from}`, `To: ${message.to}`, `Subject: ${subject}`, `Message-ID: <${message.messageId}>`,
        "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", body].join("\r\n");
      let response: Response;
      try {
        response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
        });
      } catch { throw new MailError("DELIVERY_UNKNOWN"); }
      if (response.status === 401) throw new MailError("RECONNECT");
      if (response.status === 429) throw new MailError("RATE_LIMIT");
      if (response.status >= 500) throw new MailError("DELIVERY_UNKNOWN");
      let result: { id?: string; error?: { errors?: { reason?: string }[] } };
      try { result = await response.json(); } catch { throw new MailError("DELIVERY_UNKNOWN"); }
      const reasons = result.error?.errors?.map(e => e.reason) ?? [];
      if (reasons.some(r => ["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"].includes(r ?? ""))) throw new MailError("RATE_LIMIT");
      if (reasons.includes("insufficientPermissions")) throw new MailError("RECONNECT");
      if (!response.ok) throw new MailError("PROVIDER_ERROR");
      if (!result.id) throw new MailError("DELIVERY_UNKNOWN");
      return result.id;
    },
  };
}
