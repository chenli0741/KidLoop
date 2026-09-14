import {parseEarliestDismissalTime} from './driver-conditions';
export type DriverPreferences = {
 earliestDismissalTime?: string|null;
 latestDismissalTime?: string|null;
 schoolPreferenceMode?: 'NONE'|'PREFER'|'ONLY';
 preferredSchoolIds?: string[];
};
export function parseDriverPreferences(form:FormData):DriverPreferences {
 const earliestDismissalTime=parseEarliestDismissalTime(form.get('earliestDismissalTime'));
 const latestDismissalTime=parseEarliestDismissalTime(form.get('latestDismissalTime'));
 const mode=form.get('schoolPreferenceMode')??'NONE';
 const ids=[...new Set(form.getAll('preferredSchoolIds').map(String))];
 if(!['NONE','PREFER','ONLY'].includes(String(mode)) || ids.some(id=>! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || (mode!=='NONE'&&!ids.length) || (earliestDismissalTime&&latestDismissalTime&&earliestDismissalTime>latestDismissalTime)) throw new Error('请检查时间范围，并为学校偏好选择学校 / Check the time range and select schools for the preference');
 return {earliestDismissalTime,latestDismissalTime,schoolPreferenceMode:mode as DriverPreferences['schoolPreferenceMode'],preferredSchoolIds:mode==='NONE'?[]:ids};
}
export function driverAllowsSchools(d:DriverPreferences,schools:string[]) {
 return d.schoolPreferenceMode!=='ONLY' || (schools.length>0&&schools.every(id=>d.preferredSchoolIds?.includes(id)));
}
export function driverAllowsTime(d:DriverPreferences,time:string) {
 return (!d.earliestDismissalTime||time>=d.earliestDismissalTime)&&(!d.latestDismissalTime||time<=d.latestDismissalTime);
}
// Explicit preferences outrank learned familiarity; PREFER remains available for cover.
export function schoolPreferenceScore(d:DriverPreferences,schools:string[]) {
 if(!d.schoolPreferenceMode||d.schoolPreferenceMode==='NONE')return 0;
 const unique=[...new Set(schools)];
 return unique.length?unique.filter(id=>d.preferredSchoolIds?.includes(id)).length/unique.length:0;
}
