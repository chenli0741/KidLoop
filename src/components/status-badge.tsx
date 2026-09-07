const labels: Record<string, string> = {
  AVAILABLE: "Available",
  IN_SERVICE: "In service",
  MAINTENANCE: "Maintenance",
  OFF_DUTY: "Off duty",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  PUBLISHED: "Published",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
  NEEDS_ATTENTION: "Needs attention",
  PICKED_UP: "Picked up",
  DROPPED_OFF: "Dropped off",
  ABSENT: "Absent",
  EXCEPTION: "Issue",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{labels[status] ?? status}</span>;
}
