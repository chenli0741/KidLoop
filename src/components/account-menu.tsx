"use client";
import { useRef, useId, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CircleUserRound, KeyRound, Languages, LogOut, Pencil, UsersRound, X } from "lucide-react";
import { setLocale } from "@/app/actions";
import { logout } from "@/app/login/actions";
import { useLocale } from "@/components/locale-provider";
import { text } from "@/lib/i18n";
import { isTestAccount } from '@/lib/test-account';
import type { AuthUser } from "@/lib/types";

export function AccountMenu({ user }: { user: AuthUser }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const locale = useLocale();
  const close = () => dialog.current?.close();
  const role = { ADMIN: text(locale, "管理员", "Admin"), DRIVER: text(locale, "司机", "Driver"), PARENT: text(locale, "家长", "Parent") }[user.role];
  return <>
    <button className="account-trigger" type="button" aria-label={text(locale, "账号菜单", "Account menu")} aria-haspopup="dialog" aria-expanded={open} onClick={() => { dialog.current?.showModal(); setOpen(true); }}><>{user.photoUrl && failedPhoto !== user.photoUrl ? <Image className="account-avatar" src={user.photoUrl} alt="" width={40} height={40} unoptimized onError={() => setFailedPhoto(user.photoUrl ?? null)} /> : <CircleUserRound size={24} />}</><span>{user.name}</span></button>
    <dialog ref={dialog} className="account-menu" aria-labelledby={titleId} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="account-menu-content">
        <header><div><span className="eyebrow">{role}</span><h2 id={titleId}>{user.name}</h2><p>{user.email}</p></div><button type="button" className="icon-button" aria-label={text(locale, "关闭账号菜单", "Close account menu")} onClick={close}><X size={19} /></button></header>
        <nav aria-label={text(locale, "个人账号", "Personal account")}>
          <Link href="/profile" onClick={close}><Pencil size={19} />{text(locale, "个人资料", "Personal information")}</Link>
          <Link href="/profile#password" onClick={close}><KeyRound size={19} />{text(locale, "修改密码", "Change password")}</Link>
          {user.role === "PARENT" && <Link href="/parent/children" onClick={close}><UsersRound size={19} />{text(locale, "修改孩子资料", "Edit children's information")}</Link>}
        </nav>
        {!isTestAccount(user) && <div className="account-menu-language"><span><Languages size={19} />{text(locale, "语言", "Language")}</span><form action={setLocale}><button name="locale" value="zh" aria-pressed={locale === "zh"}>中文</button><button name="locale" value="en" aria-pressed={locale === "en"}>English</button></form></div>}
        <form action={logout}><button className="account-menu-logout"><LogOut size={19} />{text(locale, "退出登录", "Sign out")}</button></form>
      </div>
    </dialog>
  </>;
}
