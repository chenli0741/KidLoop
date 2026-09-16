"use client";
import { useState } from "react";
import { ActionForm } from "./action-form";
import { sendMemberInvitation } from "@/app/accounts/invitation-actions";
import { useLocale } from "./locale-provider";
import { text } from "@/lib/i18n";
import type { UserRole } from "@/lib/types";
export type InvitationParent={id:string;name:string;email:string;children:string};
export function InvitationForm({drivers,parents}:{drivers:{id:string;name:string}[];parents:InvitationParent[]}){
 const l=useLocale(),[role,setRole]=useState<UserRole>('PARENT'),[parent,setParent]=useState(''),[email,setEmail]=useState('');
 return <ActionForm action={sendMemberInvitation} submitLabel={text(l,'发送邀请邮件','Send invitation email')} onReset={()=>{setParent('');setEmail('');}}>
 <label className="full"><span>{text(l,'成员角色','Member role')}</span><select name="role" value={role} onChange={e=>{setRole(e.target.value as UserRole);setParent('');setEmail('');}}><option value="ADMIN">{text(l,'公司工作人员（管理权限）','Company staff (management access)')}</option><option value="DRIVER">{text(l,'司机','Driver')}</option><option value="PARENT">{text(l,'家长','Parent')}</option></select></label>
 {role==='ADMIN'&&<label className="full"><span>{text(l,'姓名','Name')}</span><input name="name" maxLength={100} required/></label>}
 {role==='DRIVER'&&<label className="full"><span>{text(l,'已有司机资料','Existing driver record')}</span><select name="driverId" defaultValue="" required><option value="" disabled>{text(l,'选择司机','Select a driver')}</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
 {role==='PARENT'&&<label className="full"><span>{text(l,'已有家长及孩子资料','Existing parent and children')}</span><select name="parentId" value={parent} onChange={e=>{setParent(e.target.value);setEmail(parents.find(p=>p.id===e.target.value)?.email??'');}} required><option value="" disabled>{text(l,'选择家长','Select a parent')}</option>{parents.map(p=><option key={p.id} value={p.id}>{p.name} · {p.children}</option>)}</select></label>}
 <label className="full"><span>{text(l,'邀请邮箱','Invitation email')}</span><input name="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required/></label>
 <p className="full">{text(l,'司机和家长请先建立名单资料。接受邀请前不会获得公司访问权限；已有账号可直接登录接受，无需重复注册。','Create driver and parent roster records first. Access starts only after acceptance. Existing users sign in to accept without registering again.')}</p>
 </ActionForm>;
}
