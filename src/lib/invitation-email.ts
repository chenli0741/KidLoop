import "server-only";
import type { AuthUser, UserRole } from "./types";
import { sendCompanyMail } from "./company-mail/service";
import { applicationOrigin } from "./company-mail/config";

/** KidLoop content only. OAuth, credential storage and delivery are separate modules. */
export async function sendInvitationEmail(admin: AuthUser, invite: {
  id: string; email: string; name: string; company: string; token: string; role: UserRole;
}) {
  const origin = applicationOrigin();
  const role = { ADMIN: "公司工作人员 / Company staff", DRIVER: "司机 / Driver", PARENT: "家长 / Parent" }[invite.role];
  const link = `${origin}/invite/${invite.token}`;
  return sendCompanyMail(admin, `invitation:${invite.id}`, {
    to: invite.email,
    messageId: `${invite.id}@${new URL(origin).hostname}`,
    subject: `KidLoop · ${invite.company.replace(/[\r\n]/g, " ")} 邀请你加入 / Invitation`,
    text: `${invite.name}，你好 / Hello,\n\n${invite.company} 邀请你以 ${role} 身份加入。\nYou are invited to join ${invite.company} as ${role}.\n\n${link}\n\n链接 7 天内有效。新用户设置密码激活；已有账号请登录原账号接受邀请。\nThis link expires in 7 days. Set a password to activate a new account, or sign in with your existing account to accept.\n\n如非预期邀请，请忽略此邮件。If you did not expect this invitation, ignore this email.`,
  });
}
