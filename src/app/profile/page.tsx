import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { updatePassword, updateProfile } from "./actions";

export default async function ProfilePage() {
  const user = await requireUser(); const locale = await getLocale();
  const { rows: [profile] } = await query<{ name: string; email: string; phone: string; updated_at: string }>("select case when u.role='DRIVER' then d.name else u.name end as name,u.email,case when u.role='DRIVER' then d.phone else u.phone end as phone,u.updated_at::text from app_users u left join drivers d on d.id=u.driver_id where u.id=$1", [user.id]);
  return <div className="page-container"><PageHeader eyebrow={text(locale, "我的账号", "My account")} title={text(locale, "个人资料", "Personal information")} description={text(locale, "管理你的联系信息、登录邮箱和密码。", "Manage your contact information, login email, and password.")} />
    <div className="profile-grid"><section className="profile-panel"><h2>{text(locale, "账号信息", "Account information")}</h2><p className="form-hint">{text(locale, "更改登录邮箱时，需要验证当前密码。", "Your current password is required when changing your login email.")}</p>
      <SettingsForm action={updateProfile} submitLabel={text(locale, "保存个人资料", "Save profile")}>
        <input type="hidden" name="updatedAt" value={profile.updated_at} />
        <label className="full"><span>{text(locale, "姓名", "Name")}</span><input name="name" autoComplete="name" defaultValue={profile.name} maxLength={100} required /></label>
        <label className="full"><span>{text(locale, "联系电话", "Phone")}</span><input name="phone" type="tel" autoComplete="tel" defaultValue={profile.phone} maxLength={80} /></label>
        <label className="full"><span>{text(locale, "登录邮箱", "Login email")}</span><input name="email" type="email" autoComplete="username" defaultValue={profile.email} maxLength={254} required /></label>
        <label className="full"><span>{text(locale, "当前密码（更改邮箱时填写）", "Current password (to change email)")}</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={128} /></label>
      </SettingsForm>
    </section><section className="profile-panel" id="password"><h2>{text(locale, "修改密码", "Change password")}</h2><p className="form-hint">{text(locale, "修改后，所有设备需要使用新密码重新登录。", "After changing your password, sign in again on all devices.")}</p>
      <SettingsForm action={updatePassword} submitLabel={text(locale, "更新密码", "Update password")}>
        <input type="hidden" name="username" autoComplete="username" value={profile.email} />
        <label className="full"><span>{text(locale, "当前密码", "Current password")}</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required /></label>
        <label className="full"><span>{text(locale, "新密码（12–128 字符）", "New password (12–128 characters)")}</span><input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <label className="full"><span>{text(locale, "确认新密码", "Confirm new password")}</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      </SettingsForm>
    </section></div>
    {user.role === "PARENT" && <Link className="button secondary child-profile-link" href="/parent/children">{text(locale, "修改孩子资料", "Edit children's information")}</Link>}
  </div>;
}
