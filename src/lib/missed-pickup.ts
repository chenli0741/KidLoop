export const missedPickupReasons = [
  { id: "COLLECTED_ELSEWHERE", zh: "临时接走", en: "Picked up by someone else at short notice" },
  { id: "NOT_COME_OUT", zh: "孩子在学校但没有出来", en: "Child at school but did not come out" },
  { id: "KEPT_AT_SCHOOL", zh: "孩子被留校", en: "Child kept at school" },
  { id: "OTHER", zh: "其他原因", en: "Other reason" },
] as const;

export type MissedPickupDetails = { reason: string; parentNotified: boolean };
