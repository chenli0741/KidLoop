import { Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import { ResourceDialog } from "@/components/resource-dialog";
import { createStudentStatusReason, deleteStudentStatusReason, updateStudentStatusReason } from "@/app/actions";

type Reason = { id:string; name_zh:string; name_en:string; roles:string[] };
function reasonFields(locale: "zh" | "en", row?: Reason) { return <><label><span>{text(locale,"编号","ID")}</span><input name="id" value={row?.id ?? undefined} readOnly={!!row} placeholder="LATE_RELEASE" required /></label><label><span>{text(locale,"中文名称","Chinese name")}</span><input name="nameZh" defaultValue={row?.name_zh} required /></label><label><span>{text(locale,"英文名称","English name")}</span><input name="nameEn" defaultValue={row?.name_en} required /></label><div className="settings-checkbox full"><label><input type="checkbox" name="roles" value="ADMIN" defaultChecked={row?.roles.includes("ADMIN") ?? true}/>{text(locale,"管理员","Admin")}</label><label><input type="checkbox" name="roles" value="DRIVER" defaultChecked={row?.roles.includes("DRIVER") ?? true}/>{text(locale,"司机","Driver")}</label><label><input type="checkbox" name="roles" value="PARENT" defaultChecked={row?.roles.includes("PARENT") ?? false}/>{text(locale,"家长","Parent")}</label></div></>; }
export async function StudentStatusReasonResources() {
  await requireUser(["ADMIN"]); const locale = await getLocale();
  const rows = (await query<Reason>("select id,name_zh,name_en,roles from student_status_reasons where active order by id")).rows;
  return <section className="content-section resource-list-section"><div className="section-heading"><div><span className="eyebrow">{text(locale,"系统配置","System configuration")}</span><h2>{text(locale,"学生接送原因","Student status reasons")}</h2><p className="form-hint">{text(locale,"统一维护原因和可使用的角色。","Maintain reasons and the roles that can use them.")}</p></div><div className="resource-heading-actions"><span className="section-count">{rows.length}</span><ResourceDialog title={text(locale,"添加接送原因","Add reason")}><ActionForm action={createStudentStatusReason} submitLabel={text(locale,"保存","Save")}>{reasonFields(locale)}</ActionForm></ResourceDialog></div></div>
    {rows.length ? <div className="resource-rows">{rows.map(row => <article className="resource-row" key={row.id}><div className="resource-row-main"><strong>{locale === "zh" ? row.name_zh : row.name_en}</strong><span>{row.id} · {row.roles.map(role => role === "ADMIN" ? text(locale,"管理员","Admin") : role === "DRIVER" ? text(locale,"司机","Driver") : text(locale,"家长","Parent")).join("、")}</span></div><div className="resource-row-actions"><ResourceDialog title={text(locale,"编辑接送原因","Edit reason")} trigger={<button type="button" className="icon-button" title={text(locale,"编辑","Edit")} aria-label={text(locale,"编辑","Edit")}><Pencil size={16}/></button>}><ActionForm action={updateStudentStatusReason} submitLabel={text(locale,"保存","Save")}>{reasonFields(locale,row)}</ActionForm></ResourceDialog><ActionForm action={deleteStudentStatusReason} submitLabel="" submitIcon={<Trash2 size={16}/>} submitClassName="icon-only-action" className="inline-action-form"><input type="hidden" name="id" value={row.id}/></ActionForm></div></article>)}</div> : <p className="form-hint">{text(locale,"暂无接送原因。","No reasons yet.")}</p>}
  </section>;
}
