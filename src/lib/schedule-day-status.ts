import type { TripStatus } from './types';

export type ScheduleDayStatus = 'empty'|'planned'|'loading';
export function scheduleDayStatus(trips:ReadonlyArray<{status:TripStatus}>):ScheduleDayStatus {
 return trips.some(t=>t.status!=='CANCELED')?'planned':'empty';
}
export const scheduleStatusLabels:Record<ScheduleDayStatus,{zh:string;en:string}>={
 empty:{zh:'无行程',en:'No trips'},planned:{zh:'有行程',en:'Has trips'},loading:{zh:'加载中',en:'Loading'},
};

export function scheduleDatePeriod(date: string, today: string) {
 return date < today ? 'past' : date === today ? 'today' : 'future';
}
export const schedulePeriodLabels = {
 past: {zh: '过去', en: 'Past'}, today: {zh: '今天', en: 'Today'}, future: {zh: '未来', en: 'Upcoming'},
};
