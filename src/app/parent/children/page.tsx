import { PhotoUpload } from "@/components/photo-upload";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { getParentChildren } from "@/lib/parent-data";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { EmptyState } from "@/components/empty-state";
import { updateChild } from "@/app/profile/actions";

export default async function ChildrenPage() {
  await requireUser(["PARENT"]); const locale = await getLocale();
  const children = await getParentChildren();
  return <div className="page-container"><PageHeader eyebrow={text(locale, "我的家庭", "My family")} title={text(locale, "孩子资料", "Children's information")} description={text(locale, "完善孩子的个人资料。学校、班级及培训学校变更请联系管理员。", "Update your children's personal information. Contact your administrator to change school, class, or program.")} />
    {!children.length && <EmptyState title={text(locale, "尚未绑定孩子", "No children linked")} body={text(locale, "请联系管理员绑定孩子。", "Ask your administrator to link your children.")} />}
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
