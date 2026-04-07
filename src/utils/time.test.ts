import { expect, test } from "bun:test";

import {
  addZonedDays,
  addZonedHours,
  addZonedMonths,
  getDigestWindow,
  getEffectiveTime,
  getStartOfZonedDay,
  getStartOfZonedMonth,
  getStartOfZonedWeek,
  isInTimeWindow,
} from "./time";

test("getEffectiveTime prefers publishedAt and falls back to fetchedAt", () => {
  const publishedAt = new Date("2026-03-31T00:00:00.000Z");
  const fetchedAt = new Date("2026-03-31T08:00:00.000Z");

  expect(getEffectiveTime(publishedAt, fetchedAt)).toBe(publishedAt);
  expect(getEffectiveTime(undefined, fetchedAt)).toBe(fetchedAt);
  expect(getEffectiveTime(undefined, undefined)).toBeNull();
});

test("isInTimeWindow respects inclusive threshold", () => {
  const now = new Date("2026-03-31T04:00:00.000Z");
  const boundary = new Date("2026-03-28T04:00:00.000Z");
  const tooOld = new Date("2026-03-28T03:59:59.999Z");

  expect(isInTimeWindow(boundary, 72, "Asia/Shanghai", now)).toBe(true);
  expect(isInTimeWindow(tooOld, 72, "Asia/Shanghai", now)).toBe(false);
});

test("getDigestWindow uses current local send hour when already passed", () => {
  const now = new Date("2026-03-31T03:00:00.000Z");
  const window = getDigestWindow(null, 8, "Asia/Shanghai", 48, now);

  expect(window.windowEnd.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  expect(window.windowStart.toISOString()).toBe("2026-03-29T00:00:00.000Z");
});

test("getDigestWindow uses previous local day when before send hour", () => {
  const now = new Date("2026-03-30T23:00:00.000Z");
  const window = getDigestWindow(null, 8, "Asia/Shanghai", 48, now);

  expect(window.windowEnd.toISOString()).toBe("2026-03-30T00:00:00.000Z");
  expect(window.windowStart.toISOString()).toBe("2026-03-28T00:00:00.000Z");
});

test("getDigestWindow clamps start with last successful digest time", () => {
  const now = new Date("2026-03-31T03:00:00.000Z");
  const lastSuccessDigestAt = new Date("2026-03-30T06:00:00.000Z");
  const window = getDigestWindow(lastSuccessDigestAt, 8, "Asia/Shanghai", 48, now);

  expect(window.windowEnd.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  expect(window.windowStart.toISOString()).toBe("2026-03-30T06:00:00.000Z");
});

test("zoned period helpers compute Asia/Shanghai natural day week and month starts", () => {
  const now = new Date("2026-04-07T04:30:00.000Z");

  expect(getStartOfZonedDay(now, "Asia/Shanghai").toISOString()).toBe("2026-04-06T16:00:00.000Z");
  expect(getStartOfZonedWeek(now, "Asia/Shanghai").toISOString()).toBe("2026-04-05T16:00:00.000Z");
  expect(getStartOfZonedMonth(now, "Asia/Shanghai").toISOString()).toBe("2026-03-31T16:00:00.000Z");
});

test("zoned shift helpers advance wall clock across hour day and month", () => {
  const start = new Date("2026-03-31T16:00:00.000Z");

  expect(addZonedHours(start, 1, "Asia/Shanghai").toISOString()).toBe("2026-03-31T17:00:00.000Z");
  expect(addZonedDays(start, 1, "Asia/Shanghai").toISOString()).toBe("2026-04-01T16:00:00.000Z");
  expect(addZonedMonths(start, 1, "Asia/Shanghai").toISOString()).toBe("2026-04-30T16:00:00.000Z");
});
