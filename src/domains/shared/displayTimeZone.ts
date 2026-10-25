const dayMs = 86_400_000;

/** Read a fresh formatter so an OS timezone change is reflected on the next read. */
export function currentDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    timeZone, calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

function dateWithFormatter(instantMs: number, formatter: Intl.DateTimeFormat): string {
  if (!Number.isSafeInteger(instantMs)) throw new Error("display_instant_invalid");
  const values = new Map(formatter.formatToParts(new Date(instantMs)).map(({ type, value }) => [type, value]));
  return `${values.get("year")!.padStart(4, "0")}-${values.get("month")}-${values.get("day")}`;
}

export function displayLocalDate(instantMs: number, timeZone = currentDeviceTimeZone()): string {
  return dateWithFormatter(instantMs, dateFormatter(timeZone));
}

export function displayLocalDateTime(instantMs: number, timeZone = currentDeviceTimeZone()): string {
  if (!Number.isSafeInteger(instantMs)) throw new Error("display_instant_invalid");
  const parts = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    timeZone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(instantMs));
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  return `${values.get("year")!.padStart(4, "0")}-${values.get("month")}-${values.get("day")} ${values.get("hour")}:${values.get("minute")}`;
}

/** Find civil-day boundaries in the selected zone, including short/long DST days. */
export function displayDateRange(startDate: string, endDateExclusive: string, timeZone: string): { startMs: number; endMs: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(endDateExclusive)
    || startDate >= endDateExclusive) throw new Error("display_date_range_invalid");
  const formatter = dateFormatter(timeZone);
  const boundary = (date: string): number => {
    const utc = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== date) throw new Error("display_date_range_invalid");
    let low = utc - 2 * dayMs; let high = utc + 2 * dayMs;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (dateWithFormatter(middle, formatter) < date) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return { startMs: boundary(startDate), endMs: boundary(endDateExclusive) };
}
