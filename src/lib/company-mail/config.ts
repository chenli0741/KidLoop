import "server-only";
import { googleMailProvider } from "../connected-mail/google";
import { tokenVault } from "../connected-mail/crypto";
import { MailError } from "../connected-mail/types";

export function applicationOrigin() {
  try {
    const url = new URL(process.env.KIDLOOP_APP_URL ?? "");
    const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) throw new Error();
    return url.origin;
  } catch { throw new MailError("NOT_CONFIGURED"); }
}
export function companyMailConfig() {
  try {
    const origin = applicationOrigin();
    const clientId = process.env.MAIL_GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.MAIL_GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new Error();
    const vault = tokenVault(process.env.MAIL_TOKEN_ENCRYPTION_KEY?.trim() ?? "");
    const provider = googleMailProvider({ clientId, clientSecret, redirectUri: `${origin}/api/mail/google/callback` });
    return { origin, provider, vault };
  } catch { throw new MailError("NOT_CONFIGURED"); }
}
