'use client';
import {useState} from 'react';
import {SettingsForm} from './settings-form';
import {saveSharing} from '@/app/schedule/actions';
import type {FixedRoute} from '@/lib/fixed-route-types';
import {text,type Locale} from '@/lib/i18n';

export function FixedRouteSharingForm({routes,operatingTermId,locale}:{routes:FixedRoute[];operatingTermId:string;locale:Locale}) {
 const available=routes.filter(r=>r.routeType==='RECURRING'&&!r.sharing);
 const [sourceId,setSourceId]=useState(''),[partnerId,setPartnerId]=useState('');
 const source=available.find(r=>r.id===sourceId),partner=available.find(r=>r.id===partnerId);
 return <SettingsForm action={saveSharing} submitLabel={text(locale,'建立共享并启用两条线路','Share and enable both routes')}>
  <input type="hidden" name="operatingTermId" value={operatingTermId}/>
  <input type="hidden" name="sourceVersion" value={source?.updatedAt??''}/><input type="hidden" name="partnerVersion" value={partner?.updatedAt??''}/>
  <p className="full form-hint">{text(locale,'先保存两条线路草稿，再建立共享。共享学校的学生只在主线路维护，另一条线路同步使用；其他学校保留本车固定名单。日期、星期和共享学校接人时间须一致，两车须使用不同司机和车辆。','Save two route drafts first. Maintain the shared school roster on the source route; the partner uses the same roster. Other schools keep their fixed riders. Dates, weekdays and shared pickup time must match; use different drivers and vehicles.')}</p>
  <label><span>{text(locale,'名单主线路','Roster source route')}</span><select required name="sourceRouteId" value={sourceId} onChange={e=>{setSourceId(e.target.value);setPartnerId('');}}><option value="">{text(locale,'选择主线路','Choose source')}</option>{available.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
  <label><span>{text(locale,'共享的另一条线路','Partner route')}</span><select required name="partnerRouteId" value={partnerId} onChange={e=>setPartnerId(e.target.value)}><option value="">{text(locale,'选择另一条线路','Choose partner')}</option>{available.filter(r=>r.id!==sourceId).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
  <label className="full"><span>{text(locale,'共享学校','Shared school')}</span><select key={sourceId} required name="schoolId"><option value="">{text(locale,'选择共享学校','Choose school')}</option>{source?.stops.filter(s=>s.schoolId).map(s=><option key={s.id} value={s.schoolId!}>{s.name} · {source.students.filter(a=>a.pickupStopId===s.id).length} {text(locale,'名候选学生','candidate riders')}</option>)}</select></label>
  <p className="full form-hint">{text(locale,'两车不预先分孩子，以司机实际接到为准；各车会为自己的固定学生预留座位。共享学生须在同一地点下车，两条线路均须经过该地点。已有车次只在核对匹配且尚未开始时关联，冲突在任务问题中显示。','Drivers claim riders at pickup; each vehicle reserves seats for its fixed riders. Shared riders must have one common destination visited by both routes. Matching unstarted daily trips are linked; conflicts appear in task issues.')}</p>
 </SettingsForm>;
}
