// SQLite has no enums — these are the allowed values for the string fields
// in the schema. Validate against these before writing.

export const URGENCIES = ["LOW", "NORMAL", "URGENT"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED"] as const;
export type Status = (typeof STATUSES)[number];

export const TAG_ROLES = ["UNASSIGNED", "EQUIPMENT", "SERVICE_REQUEST"] as const;
export type TagRole = (typeof TAG_ROLES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

// Maps each status to its design-token color class (see globals.css @theme)
export const STATUS_COLOR_CLASS: Record<Status, string> = {
  OPEN: "text-status-open",
  ASSIGNED: "text-status-assigned",
  IN_PROGRESS: "text-status-progress",
  COMPLETED: "text-status-completed",
};
