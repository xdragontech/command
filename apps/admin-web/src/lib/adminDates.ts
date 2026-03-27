const ADMIN_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const ADMIN_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatAdminDate(value: string | null) {
  const date = parseDate(value);
  if (!date) return value ? value : "—";
  return ADMIN_DATE_FORMATTER.format(date);
}

export function formatAdminDateTime(value: string | null) {
  const date = parseDate(value);
  if (!date) return value ? value : "—";
  return `${ADMIN_DATE_TIME_FORMATTER.format(date)} UTC`;
}

export function formatAdminDateRange(from: string, to: string) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return "—";
  return `${ADMIN_DATE_FORMATTER.format(start)} - ${ADMIN_DATE_FORMATTER.format(end)}`;
}
