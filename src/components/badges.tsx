import { STATUS_LABELS, type Status, type Urgency } from "@/lib/constants";

export function UrgencyBadge({
  urgency,
  pulse = false,
}: {
  urgency: Urgency;
  pulse?: boolean;
}) {
  const style =
    urgency === "URGENT"
      ? "bg-accent text-bg"
      : urgency === "NORMAL"
        ? "border border-status-assigned text-status-assigned"
        : "border border-border text-text-muted";
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-sm px-2 font-display text-xs font-semibold uppercase tracking-widest ${style} ${
        pulse ? "animate-pulse-urgent" : ""
      }`}
    >
      {urgency}
    </span>
  );
}

const STATUS_STYLES: Record<Status, string> = {
  OPEN: "border-status-open text-status-open",
  ASSIGNED: "border-status-assigned text-status-assigned",
  IN_PROGRESS: "border-status-progress text-status-progress",
  COMPLETED: "border-status-completed text-status-completed",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-sm border px-2 font-display text-xs font-semibold uppercase tracking-widest ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
