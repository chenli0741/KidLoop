import {text,type Locale} from '@/lib/i18n';

export function StudentWeekdays({locale,selected=[]}:{locale:Locale;selected?:number[]}) {
  const zh=['周一','周二','周三','周四','周五','周六','周日'];
  const en=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return <fieldset className="full student-weekdays"><legend>{text(locale,'每周不接送','No pickup on')}</legend>
    {zh.map((name,i)=><label key={i} className="record-checkbox"><input type="checkbox" name="noPickupWeekdays" value={i+1} defaultChecked={selected.includes(i+1)}/>{text(locale,name,en[i])}</label>)}
  </fieldset>;
}
