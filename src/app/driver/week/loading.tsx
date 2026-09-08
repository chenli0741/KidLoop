import { getLocale } from '@/lib/i18n-server';
import { text } from '@/lib/i18n';

export default async function LoadingSchedule() {
  const locale = await getLocale();
  return <div className="page-container"><p role="status">{text(locale, '正在加载本周日程…', 'Loading your schedule…')}</p></div>;
}
