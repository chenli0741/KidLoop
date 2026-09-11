"use client";

import { useRouter } from "next/navigation";

export function ReviewDatePicker({ date, view, label }: { date: string; view: string; label: string }) {
  const router = useRouter();
  return <label>{label}<input type="date" value={date} onChange={event => router.push(`?date=${event.target.value}&view=${view}`)} required /></label>;
}
