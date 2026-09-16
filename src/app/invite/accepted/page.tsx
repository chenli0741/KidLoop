import Link from "next/link";
import { getUser,homeFor } from "@/lib/auth";
import { getIdentity } from "@/lib/identity";
import { logout } from "@/app/login/actions";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
export default async function AcceptedPage(){
 const l=await getLocale(),identity=await getIdentity(),user=await getUser();
 return <main className="login-page"><section className="login-card"><h1>{text(l,'邀请已接受','Invitation accepted')}</h1>
 <p>{user?text(l,'当前登录公司保持不变。如需进入新公司，请退出并重新登录选择。','Your current company stays selected. Sign out and sign in to choose your new company.'):text(l,'账号已关联公司，登录后即可使用。绑定多家公司时，登录后选择一家。','Your account is linked. Sign in to continue; choose one company when you have multiple memberships.')}</p>
 <Link className="button primary" href={user?homeFor(user.role):identity?'/organizations':'/login'}>{text(l,'继续','Continue')}</Link>
 {identity&&<form action={logout}><button className="button secondary">{text(l,'退出并重新登录','Sign out and sign in again')}</button></form>}
 </section></main>;
}
