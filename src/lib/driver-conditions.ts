/** An empty value removes the restriction; times use the operations time zone. */
export function parseEarliestDismissalTime(value: FormDataEntryValue | null): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("请填写有效的最早可接放学时间 / Enter a valid earliest dismissal time");
  }
  return value;
}
