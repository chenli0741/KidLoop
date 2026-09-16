"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { connectGmail, completeGmail, disconnectGmail } from "@/app/organizations/mail-actions";
import type { MailStatus } from "@/lib/company-mail/service";
import { isNativeMail, supportsNativeMail, authorizeNativeMail } from "@/lib/native-mail-auth";
import { useLocale } from "./locale-provider";
import { text } from "@/lib/i18n";

export function CompanyMailSettings({ connection }: { connection: MailStatus }) {
  const l = useLocale(), router = useRouter();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  async function connect() {
    setBusy(true); setNotice("");
    try {
      const native = isNativeMail();
      if (native && !supportsNativeMail()) {
        setNotice(text(l, "请更新 iPhone App 后连接 Gmail；也可以在电脑端公司设置完成连接。", "Update the iPhone app to connect Gmail, or connect from company settings on your computer."));
        return;
      }
      // Fail before starting OAuth if this tab cannot retain its one-time completion proof.
      if (!native) { sessionStorage.setItem("mail-storage-check", "1"); sessionStorage.removeItem("mail-storage-check"); }
      const result = await connectGmail(native);
      if (!result.ok) {
        setNotice(result.error === "NOT_CONFIGURED" ? text(l, "邮箱连接功能尚未开通，请联系平台维护人员。", "Email connection is not available yet. Contact the platform operator.") : text(l, "暂时无法连接，请稍后再试。", "Unable to connect right now. Please try again later."));
        return;
      }
      if (native) {
        await authorizeNativeMail(result.url, result.state);
        const completed = await completeGmail(result.state, result.proof);
        if (!completed.ok) throw new Error("CONNECT_FAILED");
        setNotice(text(l, "Gmail 已连接，可以发送邀请了。", "Gmail connected. You can now send invitations."));
        router.refresh();
      } else {
        sessionStorage.setItem(`mail-connect:${result.state}`, result.proof);
        window.location.assign(result.url);
      }
    } catch {
      setNotice(text(l, "连接未完成，原有邮箱保持不变。请重新连接并允许发信授权。", "Connection was not completed. Your existing mailbox stays unchanged. Reconnect and allow sending permission."));
    } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!connection.revision) return;
    setBusy(true); setNotice("");
    try {
      const result = await disconnectGmail(connection.revision);
      setNotice(result.ok ? text(l, "已断开。本公司将停止使用这个邮箱发信。", "Disconnected. This company will no longer send through this mailbox.") : text(l, "邮箱状态已变化，请刷新后重试。", "Mailbox state changed. Refresh and try again."));
      router.refresh();
    } catch { setNotice(text(l, "暂时无法断开，请稍后再试。", "Unable to disconnect right now. Try again later.")); }
    finally { setBusy(false); }
  }
  return <section className="account-card" aria-busy={busy}>
    <h2>{text(l, "公司发件邮箱", "Company sending mailbox")}</h2>
    <p>{text(l, "连接你自己的 Gmail，用它发送本公司的邀请，回复仍回到这个邮箱。", "Connect your Gmail to send company invitations. Replies arrive in that mailbox.")}</p>
    <p>{connection.email ?? text(l, "尚未连接邮箱", "No mailbox connected")}</p>
    {connection.status === "CONNECTED" && <p>{text(l, "已连接", "Connected")}</p>}
    {connection.status === "RECONNECT" && <p role="status">{text(l, "授权已失效，请重新连接。", "Authorization expired or was revoked. Please reconnect.")}</p>}
    {!connection.configured && <p>{text(l, "平台正在准备邮箱连接功能，暂时无法连接或发送。", "The platform is preparing email connection. Connecting and sending are not available yet.")}</p>}
    <p>{text(l, "只授权发送邮件及识别邮箱地址，不读取你的收件箱。公司管理人员可使用此连接发送邀请。", "Permission is limited to sending and identifying your email address. Your inbox is not read. Company administrators can send invitations through this connection.")}</p>
    <button className="button primary" onClick={connect} disabled={busy || !connection.configured}>{busy ? text(l, "处理中…", "Working…") : connection.email ? text(l, "重新连接 / 更换 Gmail", "Reconnect / change Gmail") : text(l, "连接 Gmail", "Connect Gmail")}</button>
    {connection.revision && <button className="button secondary" onClick={disconnect} disabled={busy}>{text(l, "断开连接", "Disconnect")}</button>}
    <p><Link href="/privacy.html#connected-gmail">{text(l, "邮箱授权与隐私说明", "Mailbox authorization and privacy")}</Link></p>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
