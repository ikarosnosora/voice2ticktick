export const DEFAULT_TIMEZONE = "Asia/Singapore";

export function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(timezone: string): string {
  return isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
}
