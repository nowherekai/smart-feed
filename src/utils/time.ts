/**
 * 时间工具模块
 * 专门处理业务时区（如 Asia/Shanghai）相关的日期转换、窗口计算。
 * 核心逻辑：基于 Intl.DateTimeFormat 提取各时区下的墙上时间（Wall Clock），
 * 避免因 Node.js 环境默认时区导致的偏移错误。
 */

const MS_PER_HOUR = 60 * 60 * 1000;

/** 各时区拆解后的日期组件 */
export type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type ZonedDatePartKey = keyof ZonedDateParts;

/**
 * 校验时区标识符是否合法
 */
function assertValidTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new Error(`[utils/time] Invalid timezone "${timeZone}".`);
  }
}

/**
 * 获取指定日期在目标时区下的各组件值
 */
export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23", // 强制 24 小时制
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

/**
 * 按日历天进行平移（处理月份和跨年溢出）
 */
export function shiftCalendarDay(parts: ZonedDateParts, deltaDays: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * 计算目标时区相对于 UTC 的偏移毫秒数
 */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  return asUtc - date.getTime();
}

/**
 * 将指定时区的日历时间反推回 UTC Date 对象
 */
export function zonedDateTimeToUtc(parts: ZonedDateParts, timeZone: string): Date {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  // 对 Asia/Shanghai 这类无 DST 的业务时区，offset 在当天是稳定的
  const offset = getTimeZoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

function shiftCalendarDateTime(parts: ZonedDateParts, delta: number, unit: "hour" | "day" | "month"): ZonedDateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));

  if (unit === "hour") {
    shifted.setUTCHours(shifted.getUTCHours() + delta);
  } else if (unit === "day") {
    shifted.setUTCDate(shifted.getUTCDate() + delta);
  } else {
    shifted.setUTCMonth(shifted.getUTCMonth() + delta);
  }

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/**
 * 获取目标时区自然日的起点。
 */
export function getStartOfZonedDay(date: Date, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  const parts = getZonedDateParts(date, timeZone);

  return zonedDateTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

/**
 * 获取目标时区自然周的起点。默认按 ISO 周一作为一周开始。
 */
export function getStartOfZonedWeek(date: Date, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  const parts = getZonedDateParts(date, timeZone);
  const calendarDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = calendarDate.getUTCDay();
  const deltaDays = weekday === 0 ? -6 : 1 - weekday;
  const startDate = shiftCalendarDay(parts, deltaDays);

  return zonedDateTimeToUtc(
    {
      year: startDate.year,
      month: startDate.month,
      day: startDate.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

/**
 * 获取目标时区自然月的起点。
 */
export function getStartOfZonedMonth(date: Date, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  const parts = getZonedDateParts(date, timeZone);

  return zonedDateTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

/**
 * 按目标时区的自然时间平移小时。
 */
export function addZonedHours(date: Date, hours: number, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  assertNonNegativeNumber("hours", Math.abs(hours));

  return zonedDateTimeToUtc(shiftCalendarDateTime(getZonedDateParts(date, timeZone), hours, "hour"), timeZone);
}

/**
 * 按目标时区的自然时间平移天。
 */
export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  assertNonNegativeNumber("days", Math.abs(days));

  return zonedDateTimeToUtc(shiftCalendarDateTime(getZonedDateParts(date, timeZone), days, "day"), timeZone);
}

/**
 * 按目标时区的自然时间平移月。
 */
export function addZonedMonths(date: Date, months: number, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  assertNonNegativeNumber("months", Math.abs(months));

  return zonedDateTimeToUtc(shiftCalendarDateTime(getZonedDateParts(date, timeZone), months, "month"), timeZone);
}

function assertNonNegativeNumber(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`[utils/time] ${name} must be a non-negative number.`);
  }
}

/**
 * 获取本地“墙上时钟”的虚拟毫秒数
 */
function getLocalWallClockMs(date: Date, timeZone: string): number {
  return date.getTime() + getTimeZoneOffsetMs(date, timeZone);
}

/**
 * 获取内容的有效生效时间
 * 优先使用发布时间，若无则使用抓取时间。
 */
export function getEffectiveTime(publishedAt?: Date | null, fetchedAt?: Date | null): Date | null {
  return publishedAt ?? fetchedAt ?? null;
}

/**
 * 判断日期是否在最近的 N 小时窗口内
 * 窗口计算基于目标时区的本地时间。
 */
export function isInTimeWindow(effectiveTime: Date, windowHours: number, timeZone: string, now = new Date()): boolean {
  assertValidTimeZone(timeZone);
  assertNonNegativeNumber("windowHours", windowHours);

  const threshold = getLocalWallClockMs(now, timeZone) - windowHours * MS_PER_HOUR;
  return getLocalWallClockMs(effectiveTime, timeZone) >= threshold;
}

/**
 * 计算摘要统计窗口 (Task 6)
 * 逻辑：
 * 1. 确定 windowEnd：若当前小时已过 sendHour (如8点)，则 windowEnd 为今日 sendHour；否则为昨日 sendHour。
 * 2. 确定 windowStart：
 *    - 若有上次成功发送记录，取上次记录。
 *    - 否则从 windowEnd 向前推 maxLookbackHours。
 *    - 且 windowStart 不能早于 maxLookbackHours 限制。
 */
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
  // 锚定基准日：如果还没到发送时间，则基准是昨天
  const anchorDate = nowParts.hour < sendHour ? shiftCalendarDay(nowParts, -1) : nowParts;

  // 窗口结束：基准日的 sendHour 整点
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

  // 窗口开始：最大回溯起点 vs 上次成功时间
  const lookbackStart = new Date(windowEnd.getTime() - maxLookbackHours * MS_PER_HOUR);
  const windowStart =
    lastSuccessDigestAt && lastSuccessDigestAt.getTime() > lookbackStart.getTime()
      ? lastSuccessDigestAt
      : lookbackStart;

  return { windowStart, windowEnd };
}
