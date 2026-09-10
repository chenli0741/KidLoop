import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import { createStudentStatusReason, updateStudentStatusReason } from "@/app/actions";

type Reason = { id:string; name_zh:string; name_en:string; roles:string[] };
export async function StudentStatusReasonResources() {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const rows = (await query<Reason>("select id,name_zh,name_en,roles from student_status_reasons where active order by id")).rows;
  return <section className="content-section"><div className="section-heading"><div><span className="eyebrow">{text(locale,"系统配置","System configuration")}</span><h2>{text(locale,"学生接送原因","Student status reasons")}</h2><p className="form-hint">{text(locale,"统一维护原因，并设置哪些角色可以使用。","Maintain one reason catalog and choose which roles can use each reason.")}</p></div></div><ActionForm action={createStudentStatusReason} submitLabel={text(locale,"添加原因","Add reason")}><div className="form-grid"><label><span>{text(locale,"编号","ID")}</span><input name="id" placeholder="LATE_RELEASE" required /></label><label><span>{text(locale,"中文名称","Chinese name")}</span><input name="nameZh" required /></label><label><span>{text(locale,"英文名称","English name")}</span><input name="nameEn" required /></label></div><div className="settings-checkbox"><label><input type="checkbox" name="roles" value="ADMIN" defaultChecked />{text(locale,"管理员","Admin")}</label><label><input type="checkbox" name="roles" value="DRIVER" defaultChecked />{text(locale,"司机","Driver")}</label><label><input type="checkbox" name="roles" value="PARENT" />{text(locale,"家长","Parent")}</label></div></ActionForm><div className="record-grid">{rows.map(row => <article className="record-card" key={row.id}><div className="record-main"><strong>{locale === "zh" ? row.name_zh : row.name_en}</strong><span>{row.id}</span></div><ActionForm action={updateStudentStatusReason} submitLabel={text(locale,"保存可见角色","Save roles")}><input type="hidden" name="id" value={row.id}/><div className="settings-checkbox"><label><input type="checkbox" name="roles" value="ADMIN" defaultChecked={row.roles.includes("ADMIN")}/>{text(locale,"管理员","Admin")}</label><label><input type="checkbox" name="roles" value="DRIVER" defaultChecked={row.roles.includes("DRIVER")}/>{text(locale,"司机","Driver")}</label><label><input type="checkbox" name="roles" value="PARENT" defaultChecked={row.roles.includes("PARENT")}/>{text(locale,"家长","Parent")}</label></div></ActionForm></article>)}</div></section>;
}
