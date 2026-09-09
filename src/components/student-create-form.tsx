'use client';

import { useState, type ReactNode } from 'react';
import { ActionForm } from './action-form';
import { createStudent } from '@/app/actions';
import { text, type Locale } from '@/lib/i18n';
import type { StudentRouteOption } from '@/lib/student-route-options';

export function StudentCreateForm({ programs, locale, children }: {
  schoolId: string;
  programs: { id: string; name: string }[];
  options: StudentRouteOption[];
  locale: Locale;
  children: ReactNode;
}) {
  const [programId, setProgramId] = useState('');
  return <ActionForm action={createStudent} submitLabel={text(locale, '添加学生', 'Add student')}
    onReset={() => { setProgramId(''); }}>
    {children}
    <label><span>{text(locale, '课外班', 'After-school program')}</span>
      <select name="programId" required value={programId} onChange={e => { setProgramId(e.target.value); }}>
        <option value="" disabled>{text(locale, '选择课外班', 'Select program')}</option>
        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
    <p className="form-hint full">{text(locale,'保存后按学校、年级放学时间和课外班自动匹配接送名单。','Pickup rosters match automatically using school, grade dismissal time and program.')}</p>
  </ActionForm>;
}
