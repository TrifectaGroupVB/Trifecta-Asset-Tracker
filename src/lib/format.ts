export function formatRequestNumber(n: number): string {
  return `SR-${String(n).padStart(4, "0")}`;
}

export function formatOrderNumber(n: number): string {
  return `PO-${String(n).padStart(4, "0")}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "PDF";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  // Dates are stored as UTC midnight; format in UTC so they don't shift a day
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatAge(from: Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "Call for price";
  return price.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
