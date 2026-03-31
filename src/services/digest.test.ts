import { expect, test } from "bun:test";

import type { DigestComposeRow } from "./digest";
import { runDigestCompose } from "./digest";

function createRow(overrides: Partial<DigestComposeRow> = {}): DigestComposeRow {
  return {
    analysisCreatedAt: new Date("2026-03-30T02:00:00.000Z"),
    analysisRecordId: "analysis-1",
    categories: ["技术动态"],
    contentEffectiveAt: new Date("2026-03-30T01:00:00.000Z"),
    contentId: "content-1",
    contentTitle: "Article 1",
    contentTraceId: "content-trace-1",
    evidenceSnippet: "Evidence snippet",
    originalUrl: "https://example.com/post-1",
    sourceName: "Example Feed",
    sourceStatus: "active",
    sourceTraceId: "source-trace-1",
    summary: {
      oneline: "One line summary",
      points: ["Point A", "Point B"],
      reason: "Worth reading",
    },
    valueScore: 8,
    ...overrides,
  };
}

function createDigestReport(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-03-31T00:00:00.000Z"),
    digestDate: "2026-03-31",
    emailSubject: "[smart-feed] 日报 2026-03-31",
    id: "digest-1",
    markdownBody: "# [smart-feed] 日报 2026-03-31",
    period: "daily" as const,
    sentAt: null,
    status: "ready" as const,
    updatedAt: new Date("2026-03-31T00:00:00.000Z"),
    windowEnd: new Date("2026-03-31T00:00:00.000Z"),
    windowStart: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides,
  };
}

test("runDigestCompose filters blocked and incomplete rows, deduplicates by content, and persists ranked items", async () => {
  const persistedDigests: Array<Record<string, unknown>> = [];
  const renderedInputs: Array<Record<string, unknown>> = [];

  const result = await runDigestCompose(
    {
      trigger: "scheduler",
    },
    {
      appEnv: {
        digestMaxLookbackHours: 48,
        digestSendHour: 8,
        digestTimeZone: "Asia/Shanghai",
      },
      async collectDigestRows() {
        return [
          createRow({
            analysisCreatedAt: new Date("2026-03-30T02:00:00.000Z"),
            analysisRecordId: "analysis-old",
            contentId: "content-1",
            valueScore: 7,
          }),
          createRow({
            analysisCreatedAt: new Date("2026-03-30T03:00:00.000Z"),
            analysisRecordId: "analysis-new",
            contentId: "content-1",
            valueScore: 8,
          }),
          createRow({
            analysisCreatedAt: new Date("2026-03-30T04:00:00.000Z"),
            analysisRecordId: "analysis-top",
            categories: ["政策观察"],
            contentEffectiveAt: new Date("2026-03-30T05:00:00.000Z"),
            contentId: "content-2",
            contentTitle: "Article 2",
            contentTraceId: "content-trace-2",
            originalUrl: "https://example.com/post-2",
            sourceTraceId: "source-trace-2",
            valueScore: 9,
          }),
          createRow({
            analysisRecordId: "analysis-blocked",
            contentId: "content-3",
            sourceStatus: "blocked",
          }),
          createRow({
            analysisRecordId: "analysis-missing-evidence",
            contentId: "content-4",
            evidenceSnippet: null,
          }),
        ];
      },
      async findDigestReportByDate() {
        return null;
      },
      async findLatestSentDigestReport() {
        return createDigestReport({
          id: "digest-sent-prev",
          sentAt: new Date("2026-03-30T00:00:00.000Z"),
          status: "sent",
        });
      },
      now() {
        return new Date("2026-03-31T00:30:00.000Z");
      },
      async persistDigest(input) {
        persistedDigests.push(input as Record<string, unknown>);
        return "digest-new";
      },
      renderMarkdown(input) {
        renderedInputs.push(input as Record<string, unknown>);
        return "# digest markdown";
      },
    },
  );

  expect(result).toEqual({
    message: "digest.compose prepared 2 items for 2026-03-31",
    nextStep: {
      data: {
        digestId: "digest-new",
        trigger: "digest.compose",
      },
      jobName: "digest.deliver",
    },
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-new",
      emptyDigest: false,
      itemCount: 2,
      reusedExistingDigest: false,
      skippedBecauseAlreadySent: false,
      windowEnd: "2026-03-31T00:00:00.000Z",
      windowStart: "2026-03-30T00:00:00.000Z",
    },
    status: "completed",
  });
  expect(persistedDigests).toHaveLength(1);
  expect(persistedDigests[0]).toMatchObject({
    digestDate: "2026-03-31",
    emailSubject: "[smart-feed] 日报 2026-03-31",
    existingReport: null,
  });
  expect(renderedInputs[0]).toMatchObject({
    digestDate: "2026-03-31",
  });
  expect(renderedInputs[0]?.sections).toMatchObject([
    {
      title: "政策观察",
    },
    {
      title: "技术动态",
    },
  ]);
  expect(persistedDigests[0]?.digestCandidate).toMatchObject({
    items: [
      {
        analysisRecordId: "analysis-top",
        sectionTitle: "政策观察",
      },
      {
        analysisRecordId: "analysis-new",
        sectionTitle: "技术动态",
      },
    ],
  });
});

test("runDigestCompose skips when the current digest date has already been sent", async () => {
  const result = await runDigestCompose(
    {
      trigger: "manual",
    },
    {
      appEnv: {
        digestMaxLookbackHours: 48,
        digestSendHour: 8,
        digestTimeZone: "Asia/Shanghai",
      },
      async collectDigestRows() {
        throw new Error("should not collect digest rows");
      },
      async findDigestReportByDate() {
        return createDigestReport({
          id: "digest-sent-current",
          sentAt: new Date("2026-03-31T00:05:00.000Z"),
          status: "sent",
        });
      },
      async findLatestSentDigestReport() {
        return createDigestReport({
          id: "digest-sent-prev",
          sentAt: new Date("2026-03-30T00:00:00.000Z"),
          status: "sent",
        });
      },
      now() {
        return new Date("2026-03-31T00:30:00.000Z");
      },
    },
  );

  expect(result).toEqual({
    message: "digest.compose skipped because 2026-03-31 has already been sent",
    nextStep: null,
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-sent-current",
      emptyDigest: false,
      itemCount: 0,
      reusedExistingDigest: false,
      skippedBecauseAlreadySent: true,
      windowEnd: "2026-03-31T00:00:00.000Z",
      windowStart: "2026-03-30T00:00:00.000Z",
    },
    status: "completed",
  });
});

test("runDigestCompose reuses existing unsent digest report and keeps delivery on empty digest", async () => {
  const persistedDigests: Array<Record<string, unknown>> = [];

  const result = await runDigestCompose(
    {
      trigger: "manual",
    },
    {
      appEnv: {
        digestMaxLookbackHours: 48,
        digestSendHour: 8,
        digestTimeZone: "Asia/Shanghai",
      },
      async collectDigestRows() {
        return [];
      },
      async findDigestReportByDate() {
        return createDigestReport({
          id: "digest-ready",
          status: "failed",
        });
      },
      async findLatestSentDigestReport() {
        return createDigestReport({
          id: "digest-sent-prev",
          sentAt: new Date("2026-03-30T00:00:00.000Z"),
          status: "sent",
        });
      },
      now() {
        return new Date("2026-03-31T00:30:00.000Z");
      },
      async persistDigest(input) {
        persistedDigests.push(input as Record<string, unknown>);
        return "digest-ready";
      },
      renderMarkdown() {
        return "# empty digest";
      },
    },
  );

  expect(result).toEqual({
    message: "digest.compose prepared empty digest for 2026-03-31",
    nextStep: {
      data: {
        digestId: "digest-ready",
        trigger: "digest.compose",
      },
      jobName: "digest.deliver",
    },
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-ready",
      emptyDigest: true,
      itemCount: 0,
      reusedExistingDigest: true,
      skippedBecauseAlreadySent: false,
      windowEnd: "2026-03-31T00:00:00.000Z",
      windowStart: "2026-03-30T00:00:00.000Z",
    },
    status: "completed",
  });
  expect(persistedDigests).toHaveLength(1);
  expect(persistedDigests[0]).toMatchObject({
    emailSubject: "[smart-feed] 日报 2026-03-31",
    markdownBody: "# empty digest",
    existingReport: {
      id: "digest-ready",
      status: "failed",
    },
  });
});
