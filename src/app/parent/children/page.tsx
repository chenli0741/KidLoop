import { PhotoUpload } from "@/components/photo-upload";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { getParentChildren } from "@/lib/parent-data";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { EmptyState } from "@/components/empty-state";
import { updateChild, updateFamilyDetails } from "@/app/profile/actions";

export default async function ChildrenPage() {
  await requireUser(["PARENT"]); const locale = await getLocale();
  const children = await getParentChildren();
  const familyValue = (key: "parentName" | "relationship" | "parentPhone" | "backupPhone" | "email" | "notes") => children.map(child => child[key]).find(Boolean) ?? "";
  return <div className="page-container"><PageHeader eyebrow={text(locale, "我的家庭", "My family")} title={text(locale, "孩子资料", "Children's information")} description={text(locale, "完善孩子的个人资料和接送联系方式。学校、班级及培训学校变更请联系管理员。", "Update your children's personal and pickup contact information. Contact your administrator to change school, class, or program.")} />
    {!children.length && <EmptyState title={text(locale, "尚未绑定孩子", "No children linked")} body={text(locale, "请联系管理员绑定孩子。", "Ask your administrator to link your children.")} />}
    {!!children.length && <section className="profile-panel family-details-panel"><h2>{text(locale, "家长与接送信息", "Parent and pickup information")}</h2><p className="form-hint">{text(locale, "以下信息适用于所有已绑定孩子，只需填写一次。", "This information applies to all linked children and only needs to be entered once.")}</p>
      <SettingsForm action={updateFamilyDetails} submitLabel={text(locale, "保存家长与接送信息", "Save parent and pickup information")}>
        {children.map(child => <input key={child.id} type="hidden" name="childVersion" value={`${child.id}|${child.updatedAt}`} />)}
        <label><span>{text(locale, "家长姓名", "Parent name")}</span><input name="parentName" defaultValue={familyValue("parentName")} maxLength={200} /></label>
        <label><span>{text(locale, "与孩子关系", "Relationship")}</span><input name="relationship" defaultValue={familyValue("relationship")} maxLength={80} /></label>
        <label><span>{text(locale, "接送联系电话", "Pickup contact phone")}</span><input name="parentPhone" type="tel" defaultValue={familyValue("parentPhone")} maxLength={80} /></label>
        <label><span>{text(locale, "备用电话", "Backup phone")}</span><input name="backupPhone" type="tel" defaultValue={familyValue("backupPhone")} maxLength={80} /></label>
        <label className="full"><span>{text(locale, "家长联系邮箱", "Parent contact email")}</span><input name="email" type="email" defaultValue={familyValue("email")} maxLength={254} /></label>
        <label className="full"><span>{text(locale, "常用接送备注", "Regular pickup notes")}</span><textarea name="notes" rows={3} defaultValue={familyValue("notes")} maxLength={4000} /></label>
      </SettingsForm>
    </section>}
    <div className="profile-grid">{children.map((child) => <section className="profile-panel" key={child.id} id={`child-${child.id}`}><h2>{child.name}</h2><p className="form-hint">{child.schoolName} · {child.classroomName} → {child.programName}</p>
      {child.photoUrl && <div className="family-photo"><Image unoptimized={child.photoUrl.startsWith("/api/")} src={child.photoUrl} alt={child.name} fill sizes="72px" /></div>}
      <SettingsForm action={updateChild} submitLabel={text(locale, "保存孩子资料", "Save child information")}>
        <input type="hidden" name="operatingTermId" value={child.operatingTermId}/><input type="hidden" name="id" value={child.id} /><input type="hidden" name="updatedAt" value={child.updatedAt} />
        <label className="full"><span>{text(locale, "孩子姓名", "Child name")}</span><input name="name" defaultValue={child.name} maxLength={200} required /></label>
        <label><span>{text(locale, "年级", "Grade")}</span><input name="grade" defaultValue={child.grade} maxLength={30} /></label>
        <label><span>{text(locale, "年龄", "Age")}</span><input name="age" type="number" min={3} max={20} step={1} defaultValue={child.age ?? ""} /></label>
        <PhotoUpload current={child.photoUrl} />
      </SettingsForm>
    </section>)}</div>
  </div>;
}
