export type SettingKind = "term" | "exception" | "rule" | "route";
export type GradeTime = { grades: string[]; time: string };
export type PickupSetting = {
  id: string; name: string; updatedAt: string;
  startsOn?: string; endsOn?: string; pickupTime?: string | null;
  gradeTimes?: GradeTime[];
  weekdays?: number[]; grades?: string[];
  ruleId?: string; programId?: string; destination?: string; ruleName?: string;
};

/** Compact a grade group for calendar cards, e.g. TK、K、1、2、3 -> TK/K/1–3. */
export function formatGradeGroup(grades: string[] = []) {
  const special = grades.filter(g => !/^\d+$/.test(g));
  const nums = grades.filter(g => /^\d+$/.test(g)).map(Number).sort((a,b)=>a-b);
  const ranges: string[] = [];
  for (let i=0; i<nums.length;) {
    let j=i;
    while (j+1<nums.length && nums[j+1]===nums[j]+1) j++;
    ranges.push(j-i>=2 ? `${nums[i]}–${nums[j]}` : nums.slice(i,j+1).join("、"));
    i=j+1;
  }
  return [...special, ...ranges].join("、");
}
