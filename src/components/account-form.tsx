"use client";
import { useState } from "react";
import { SettingsForm } from "@/components/settings-form";
import { updateAccount } from "@/app/accounts/actions";
import { useLocale } from "@/components/locale-provider";
import { StudentSchoolChecklist, type AccountStudent } from "@/components/student-school-checklist";
import { text } from "@/lib/i18n";
import type { UserRole } from "@/lib/types";

export type EditableAccount = {id:string;name:string;email:string;phone:string;role:UserRole;driver_id:string|null;updatedAt:string;student_ids:string[]};
export function AccountForm({ drivers, students, initial }: { initial:EditableAccount; drivers: { id: string; name: string }[]; students: AccountStudent[] }) {
  const locale = useLocale();
  const [role, setRole] = useState<UserRole>(initial.role);
  return <SettingsForm action={updateAccount} submitLabel={text(locale,"保存修改","Save changes")}>
    <input type="hidden" name="userId" value={initial.id}/><input type="hidden" name="updatedAt" value={initial.updatedAt}/>
    {role !== "DRIVER" && <label><span>{text(locale, "姓名", "Name")}</span><input name="name" defaultValue={initial.name} maxLength={100} required /></label>}
    <label><span>{text(locale, "登录邮箱", "Login email")}</span><input name="email" defaultValue={initial.email} readOnly type="email" maxLength={254} autoComplete="off" required /></label>

    {role !== "DRIVER" && <label className="full"><span>{text(locale,"电话","Phone")}</span><input name="phone" type="tel" maxLength={80} defaultValue={initial.phone}/></label>}
    <label className="full"><span>{text(locale, "角色", "Role")}</span><select name="role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="PARENT">{text(locale, "家长", "Parent")}</option><option value="DRIVER">{text(locale, "司机", "Driver")}</option><option value="ADMIN">{text(locale, "公司工作人员", "Company staff")}</option></select></label>
    {role === "DRIVER" && <label className="full"><span>{text(locale, "绑定司机", "Link driver")}</span><select name="driverId" required defaultValue={initial.driver_id ?? ""}><option value="" disabled>{text(locale, "选择司机", "Select driver")}</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>}
    {role === "PARENT" && <StudentSchoolChecklist students={students} selectedIds={initial.student_ids} legend={text(locale,"绑定孩子","Linked children")} schoolLabel={text(locale,"按学校筛选","Filter by school")} allSchoolsLabel={text(locale,"全部学校","All schools")} />}
  </SettingsForm>;
}
