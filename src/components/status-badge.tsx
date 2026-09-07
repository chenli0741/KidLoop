"use client";

import { useLocale } from "@/components/locale-provider";

const labels: Record<string, { zh: string; en: string }> = {
  AVAILABLE: { zh: "可用", en: "Available" },
  IN_SERVICE: { zh: "服务中", en: "In service" },
  MAINTENANCE: { zh: "维护中", en: "Maintenance" },
  OFF_DUTY: { zh: "休班", en: "Off duty" },
  SCHEDULED: { zh: "已安排", en: "Scheduled" },
  ACTIVE: { zh: "进行中", en: "Active" },
  PUBLISHED: { zh: "已发布", en: "Published" },
  IN_PROGRESS: { zh: "接送中", en: "In progress" },
  COMPLETED: { zh: "已完成", en: "Completed" },
  CANCELED: { zh: "已取消", en: "Canceled" },
  NEEDS_ATTENTION: { zh: "需要处理", en: "Needs attention" },
  PICKED_UP: { zh: "已接到", en: "Picked up" },
  DROPPED_OFF: { zh: "已送达", en: "Dropped off" },
  ABSENT: { zh: "缺席", en: "Absent" },
  EXCEPTION: { zh: "异常", en: "Issue" },
};

export function StatusBadge({ status }: { status: string }) {
  const locale = useLocale();
  return <span className={`status-badge status-${status.toLowerCase()}`}>{labels[status]?.[locale] ?? status}</span>;
}
