/** Date helpers. All dates are calendar days in UTC, formatted YYYY-MM-DD. */
const DAY_MS = 86_400_000;

export function toDay(at: string): string {
  return at.slice(0, 10);
}

function ms(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  return new Date(ms(toDay(day)) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((ms(toDay(b)) - ms(toDay(a))) / DAY_MS);
}

export function isDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(ms(s)) && new Date(ms(s)).toISOString().startsWith(s);
}

/** "2026Q4" -> { from: "2026-10-01", to: "2026-12-31" } (inclusive). */
export function quarterRange(quarter: string): { from: string; to: string } {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  if (!m) throw new RangeError(`quarter must look like 2026Q4, got "${quarter}"`);
  const year = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3 + 1;
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const nextFrom = q === 4 ? `${year + 1}-01-01` : `${year}-${String(startMonth + 3).padStart(2, '0')}-01`;
  return { from, to: addDays(nextFrom, -1) };
}

export function inRange(at: string, from: string, to: string): boolean {
  const d = toDay(at);
  return d >= from && d <= to;
}
