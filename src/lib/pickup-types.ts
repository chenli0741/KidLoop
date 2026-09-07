export type SettingKind = "term" | "exception" | "rule" | "route";
export type PickupSetting = {
  id: string; name: string; updatedAt: string;
  startsOn?: string; endsOn?: string; pickupTime?: string | null;
  weekdays?: number[]; classroomIds?: string[]; classNames?: string;
  ruleId?: string; programId?: string; destination?: string; ruleName?: string;
};
