import "server-only";
import type { UserRole } from "./types";

export function invitationMailConfig() {
  const origin = new URL(process.env.KIDLOOP_APP_URL ?? "");
  const local = process.env.NODE_ENV !== "production"
    && ["localhost", "127.0.0.1"].includes(origin.hostname)
    && ["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "").hostname);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.KIDLOOP_MAIL_FROM?.trim();
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/"
    || (origin.protocol !== "https:" && !(local && origin.protocol === "http:"))) {
    throw new Error("mail_configuration");
  }
  if ((process.env.KIDLOOP_MAIL_PROVIDER ?? "resend") !== "resend"
    || !apiKey || !from || /[\r\n]/.test(from)) {
    throw new Error("mail_configuration");
  }
  return { origin: origin.origin, apiKey, from };
}

export async function sendInvitationEmail(invite: {
  id: string; email: string; name: string; company: string; token: string; role: UserRole;
}) {
  const config = invitationMailConfig();
  const role = {
    ADMIN: "公司工作人员 / Company staff",
    DRIVER: "司机 / Driver",
    PARENT: "家长 / Parent",
  }[invite.role];
  const link = `${config.origin}/invite/${invite.token}`;
  const message = {
    from: config.from,
    to: [invite.email],
    subject: `KidLoop · ${invite.company.replace(/[\r\n]/g, " ")} 邀请你加入 / Invitation`,
    text: `${invite.name}，你好 / Hello,\n\n${invite.company} 邀请你以 ${role} 身份加入。\nYou are invited to join ${invite.company} as ${role}.\n\n${link}\n\n链接 7 天内有效。新用户设置密码激活；已有账号请登录原账号接受邀请。\nThis link expires in 7 days. Set a password to activate a new account, or sign in with your existing account to accept.\n\n如非预期邀请，请忽略此邮件。If you did not expect this invitation, ignore this email.`,
  };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `kidloop-invitation-${invite.id}`,
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !(await response.json()).id) throw new Error("mail_delivery");
}
