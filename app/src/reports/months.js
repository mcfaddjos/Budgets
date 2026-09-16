const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-01".."YYYY-current" for the given year (defaults to this year). */
export function monthsOfYearSoFar(year = new Date().getFullYear()) {
  const now = new Date();
  const lastMonthIndex = year === now.getFullYear() ? now.getMonth() : 11;
  return Array.from({ length: lastMonthIndex + 1 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/** The last n months ending this month, oldest first. */
export function lastNMonths(n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function monthLabel(monthStr) {
  const [, m] = monthStr.split("-");
  return MONTH_NAMES[parseInt(m, 10) - 1];
}
