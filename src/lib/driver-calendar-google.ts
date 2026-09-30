import "server-only";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export type CalendarCredentials = { refreshToken: string };
export type GoogleCalendarEvent = {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  source: { title: string; url: string };
};

type Config = { clientId: string; clientSecret: string; redirectUri: string };
type TokenBody = { access_token?: string; refresh_token?: string; scope?: string; error?: string };

export function googleCalendarProvider(config: Config) {
  async function token(parameters: Record<string, string>) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }),
    });
    const body = await response.json() as TokenBody;
    if (!response.ok || !body.access_token) throw new Error(body.error === "invalid_grant" ? "RECONNECT" : "GOOGLE_ERROR");
    return body;
  }
  async function request(accessToken: string, path: string, init: RequestInit) {
    const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
    });
    if (response.status === 401 || response.status === 403) throw new Error("RECONNECT");
    if (!response.ok && response.status !== 404) throw new Error("GOOGLE_ERROR");
    return response;
  }
  return {
    authorizationUrl(state: string, challenge: string) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code",
        scope: `openid email ${GOOGLE_CALENDAR_SCOPE}`, access_type: "offline", prompt: "consent select_account",
        state, code_challenge: challenge, code_challenge_method: "S256",
      }).toString();
      return url.toString();
    },
    async exchange(code: string, verifier: string) {
      const granted = await token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: config.redirectUri });
      if (!granted.refresh_token || !granted.scope?.split(" ").includes(GOOGLE_CALENDAR_SCOPE)) throw new Error("RECONNECT");
      const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${granted.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
      });
      const profile = await response.json() as { sub?: string; email?: string; email_verified?: boolean };
      if (!response.ok || !profile.sub || !profile.email_verified || !profile.email) throw new Error("RECONNECT");
      return { subject: profile.sub, email: profile.email.toLowerCase(), credentials: { refreshToken: granted.refresh_token } };
    },
    async refresh(credentials: CalendarCredentials) {
      const result = await token({ grant_type: "refresh_token", refresh_token: credentials.refreshToken });
      return { accessToken: result.access_token!, credentials: { refreshToken: result.refresh_token ?? credentials.refreshToken } };
    },
    async create(accessToken: string, event: GoogleCalendarEvent) {
      const response = await request(accessToken, "/calendars/primary/events", { method: "POST", body: JSON.stringify(event) });
      const body = await response.json() as { id?: string };
      if (!body.id) throw new Error("GOOGLE_ERROR");
      return body.id;
    },
    async update(accessToken: string, eventId: string, event: GoogleCalendarEvent) {
      const response = await request(accessToken, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "PUT", body: JSON.stringify(event) });
      return response.status !== 404;
    },
    async remove(accessToken: string, eventId: string) {
      await request(accessToken, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
    },
  };
}
