import type { PickupSetting } from "./pickup-types";
type SchoolDayStatus = "holiday" | "outside-term" | "unconfigured" | "adjusted" | "pickup" | "weekend";

export function calendarDays(month: string, terms: PickupSetting[], exceptions: PickupSetting[], rules: PickupSetting[], routes: PickupSetting[] = []) {
  const [year, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
    const term = terms.find(t => t.startsOn! <= date && t.endsOn! >= date);
    const exception = exceptions.find(e => e.startsOn! <= date && e.endsOn! >= date);
    const closed = !!exception && !exception.pickupTime;
    const schoolTimes = term && !closed ? rules.filter(r=>r.weekdays?.includes(weekday) && r.grades?.length).map(r=>({id:r.id,grades:r.grades!,time:exception?.pickupTime || r.pickupTime || ""})).sort((a,b)=>a.time.localeCompare(b.time)) : [];
    const pickups = term && !closed ? routes.flatMap(route => {
      if ((route.startsOn && date<route.startsOn) || (route.endsOn && date>route.endsOn)) return [];
      const rule = rules.find(r => r.id === route.ruleId);
      return rule?.weekdays?.includes(weekday) && route.weekdays?.includes(weekday) && rule.grades?.length
        ? [{ id: route.id, name: route.name, destination: route.destination, grades: rule.grades, time: exception?.pickupTime || [route.pickupTime,rule.pickupTime].filter(Boolean).sort().at(-1) || "" }] : [];
    }).sort((a,b) => a.time.localeCompare(b.time)) : [];
    const status: SchoolDayStatus = closed ? "holiday" : !term ? (terms.length ? "outside-term" : "unconfigured") : schoolTimes.length ? (exception?.pickupTime ? "adjusted" : "pickup") : weekday >= 6 ? "weekend" : "unconfigured";
    return { date, day: index + 1, term, exception, closed, status, schoolTimes, pickups };
  });
}
