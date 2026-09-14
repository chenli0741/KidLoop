export type DriverRun = { driverId: string; routeId: string | null; schoolIds: string[]; date: string };

/** Learn from actual service, never from proposed/published assignments. */
export function familiarityScore(runs: DriverRun[], driverId: string, routeIds: string[], schoolId: string | undefined, date: string) {
  let score = 0;
  for (const run of runs) {
    if (run.driverId !== driverId || run.date >= date) continue;
    const age = (Date.parse(date) - Date.parse(run.date)) / 86400000;
    if (age > 180) continue;
    const match = run.routeId && routeIds.includes(run.routeId) ? 10 : schoolId && run.schoolIds.includes(schoolId) ? 2 : 0;
    score += match * Math.pow(0.5, age / 60);
  }
  return Math.round(score * 100) / 100;
}
