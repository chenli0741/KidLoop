import Link from 'next/link';
import {db} from '@/lib/db';
import {readTrialRange} from '@/lib/schedule-trial-data';
import {text,type Locale} from '@/lib/i18n';
export async function DailyReviewAlert({date,locale}:{date:string;locale:Locale}){
 const {summaries}=await readTrialRange(db,[date]);const count=summaries[0]?.issueCount??0;
 return <section className="pickup-section"><h2>{text(locale,'每日接送核对','Daily pickup review')}</h2><p role="status">{count?text(locale,`今天有 ${count} 项待处理问题。`,`There are ${count} issues to review today.`):text(locale,'今天的安排已核对。','Today’s arrangements have been checked.')}</p><Link href={`/schedule/review?date=${date}`} className="button secondary">{text(locale,'查看本周／本月安排','Review week / month')}</Link></section>;
}
