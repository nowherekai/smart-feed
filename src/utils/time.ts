const MS_PER_HOUR = 60 * 60 * 1000;

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type ZonedDatePartKey = keyof ZonedDateParts;

// Task 0 只需要支撑当前 MVP 的业务时区计算。
// 本项目默认且主要使用 Asia/Shanghai，这里明确按“无夏令时”时区处理，
// 不额外处理 DST 切换日的歧义或跳时场景。

function assertValidTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new Error(`[utils/time] Invalid timezone "${timeZone}".`);
  }
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values: Partial<Record<ZonedDatePartKey, number>> = {};

  for (const part of formatter.formatToParts(date)) {
    if (part.type === "literal") {
      continue;
    }

    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number.parseInt(part.value, 10);
    }
  }

  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function shiftCalendarDay(parts: ZonedDateParts, deltaDays: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  parts: ZonedDateParts,
  timeZone: string,
): Date {
  const guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  // 这里用一次 offset 反推 UTC 即可。
  // 对 Asia/Shanghai 这类无 DST 的业务时区，offset 在当天是稳定的，
  // 不需要再做二次校正。
  const offset = getTimeZoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

function assertNonNegativeNumber(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`[utils/time] ${name} must be a non-negative number.`);
  }
}

function getLocalWallClockMs(date: Date, timeZone: string): number {
  return date.getTime() + getTimeZoneOffsetMs(date, timeZone);
}

export function getEffectiveTime(
  publishedAt?: Date | null,
  fetchedAt?: Date | null,
): Date | null {
  return publishedAt ?? fetchedAt ?? null;
}

export function isInTimeWindow(
  effectiveTime: Date,
  windowHours: number,
  timeZone: string,
  now = new Date(),
): boolean {
  assertValidTimeZone(timeZone);
  assertNonNegativeNumber("windowHours", windowHours);

  // 按业务时区本地时钟做滚动窗口比较。
  // 在 Asia/Shanghai 这类无 DST 时区里，这个比较与绝对时间差等价，
  // 但这里保留显式时区参与，避免接口语义与实现脱节。
  const threshold = getLocalWallClockMs(now, timeZone) - windowHours * MS_PER_HOUR;
  return getLocalWallClockMs(effectiveTime, timeZone) >= threshold;
}

export function getDigestWindow(
  lastSuccessDigestAt: Date | null,
  sendHour: number,
  timeZone: string,
  maxLookbackHours: number,
  now = new Date(),
): { windowStart: Date; windowEnd: Date } {
  assertValidTimeZone(timeZone);

  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) {
    throw new Error("[utils/time] sendHour must be an integer between 0 and 23.");
  }

  if (!Number.isFinite(maxLookbackHours) || maxLookbackHours <= 0) {
    throw new Error("[utils/time] maxLookbackHours must be greater than 0.");
  }

  const nowParts = getZonedDateParts(now, timeZone);
  const anchorDate =
    nowParts.hour < sendHour ? shiftCalendarDay(nowParts, -1) : nowParts;
  const windowEnd = zonedDateTimeToUtc(
    {
      year: anchorDate.year,
      month: anchorDate.month,
      day: anchorDate.day,
      hour: sendHour,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
  const lookbackStart = new Date(windowEnd.getTime() - maxLookbackHours * MS_PER_HOUR);
  const windowStart =
    lastSuccessDigestAt && lastSuccessDigestAt.getTime() > lookbackStart.getTime()
      ? lastSuccessDigestAt
      : lookbackStart;

  return { windowStart, windowEnd };
}
