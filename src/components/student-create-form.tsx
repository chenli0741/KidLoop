'use client';

import { useState, type ReactNode } from 'react';
import { ActionForm } from './action-form';
import { createStudent } from '@/app/actions';
import { text, type Locale } from '@/lib/i18n';
import type { StudentRouteOption } from '@/lib/student-route-options';

export function StudentCreateForm({ schoolId, programs, options, locale, children }: {
  schoolId: string;
  programs: { id: string; name: string }[];
  options: StudentRouteOption[];
  locale: Locale;
  children: ReactNode;
}) {
  const [programId, setProgramId] = useState('');
  const [routeKey, setRouteKey] = useState('');
  const candidates = options.filter(o => o.schoolId === schoolId && o.programId === programId);
  return <ActionForm action={createStudent} submitLabel={text(locale, '添加学生', 'Add student')}
    onReset={() => { setProgramId(''); setRouteKey(''); }}>
    {children}
    <label><span>{text(locale, '课外班', 'After-school program')}</span>
      <select name="programId" required value={programId} onChange={e => { setProgramId(e.target.value); setRouteKey(''); }}>
        <option value="" disabled>{text(locale, '选择课外班', 'Select program')}</option>
        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
    {candidates.length > 1 ? <label className="full"><span>{text(locale, '接送线路（可稍后安排）', 'Route (optional)')}</span>
      <select name="routeAssignment" value={routeKey} onChange={e => setRouteKey(e.target.value)}>
        <option value="">{text(locale, '待安排线路', 'Assign later')}</option>
        {candidates.map(o => <option key={o.key} value={o.key}>{o.routeName} · {o.pickupTime} → {o.dropoffTime}</option>)}
      </select>
    </label> : <input type="hidden" name="routeAssignment" value="" />}
    {programId && <p className="form-hint full" role="status">{candidates.length === 1
      ? text(locale, `保存时自动加入「${candidates[0].routeName}」。容量与冲突检查通过后，加入未开始及后续任务。`, `Saving automatically assigns ${candidates[0].routeName} after capacity and conflict checks, for unstarted and future trips.`)
      : candidates.length > 1 ? text(locale, '找到多条匹配线路，可选择一条；不选则保存为待安排。', 'Several routes match. Choose one, or save with route assignment pending.')
      : text(locale, '暂无匹配的已启用固定线路，保存后显示待安排线路。', 'No matching active recurring route. The student will be saved with route assignment pending.')}</p>}
  </ActionForm>;
}
