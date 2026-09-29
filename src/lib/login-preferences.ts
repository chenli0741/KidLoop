// This cookie is only a form hint and must never be used to authorize a user.
export const LOGIN_EMAIL_COOKIE = "kidloop_login_email";
// A short-lived, non-authorizing flag that keeps the login page mounted until
// the native client has finished saving a successful login to Keychain.
export const LOGIN_HANDOFF_COOKIE = "kidloop_login_handoff";
export const REMEMBERED_SESSION_SECONDS = 60 * 60 * 24 * 30;
export const TEMPORARY_SESSION_SECONDS = 60 * 60 * 12;
export const LOGIN_EMAIL_SECONDS = 60 * 60 * 24 * 180;

export function readLoginEmail(value: string | undefined) {
  if (!value || value.length > 800) return "";
  try {
    const email = decodeURIComponent(value);
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  } catch {
    return "";
  }
}
