import { expect, test } from "bun:test";

import type { DigestDeliverJobData } from "./digest";
import { runDigestDeliver } from "./digest-delivery";

function createDigestReport(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-03-31T00:00:00.000Z"),
    digestDate: "2026-03-31",
    emailSubject: "[smart-feed] 日报 2026-03-31",
    id: "digest-1",
    markdownBody: "# [smart-feed] 日报 2026-03-31\n\n内容",
    period: "daily" as const,
    sentAt: null,
    status: "ready" as const,
    updatedAt: new Date("2026-03-31T00:00:00.000Z"),
    windowEnd: new Date("2026-03-31T00:00:00.000Z"),
    windowStart: new Date("2026-03-30T00:00:00.000Z"),
    ...overrides,
  };
}

function createJobData(overrides: Partial<DigestDeliverJobData> = {}): DigestDeliverJobData {
  return {
    digestId: "digest-1",
    trigger: "digest.compose",
    ...overrides,
  };
}

test("runDigestDeliver skips already sent digest reports", async () => {
  const result = await runDigestDeliver(createJobData(), {
    async getDigestReportById() {
      return createDigestReport({
        sentAt: new Date("2026-03-31T08:00:00.000Z"),
        status: "sent",
      }) as never;
    },
  });

  expect(result).toEqual({
    message: "digest.deliver skipped because digest-1 is already sent",
    nextStep: null,
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-1",
      emailSubject: "[smart-feed] 日报 2026-03-31",
      recipient: null,
      sentAt: "2026-03-31T08:00:00.000Z",
      skippedAlreadySent: true,
      skippedDeliveryDisabled: false,
    },
    status: "completed",
  });
});

test("runDigestDeliver skips sending when email delivery is disabled", async () => {
  const digestUpdates: Array<Record<string, unknown>> = [];

  const result = await runDigestDeliver(createJobData(), {
    getAppEnv() {
      return {
        emailDeliveryEnabled: false,
        smtpFrom: null,
        smtpHost: null,
        smtpPass: null,
        smtpPort: null,
        smtpTo: null,
        smtpUser: null,
      };
    },
    async getDigestReportById() {
      return createDigestReport() as never;
    },
    async sendDigestEmail() {
      throw new Error("should not send when delivery is disabled");
    },
    async updateDigestReport(_digestId, data) {
      digestUpdates.push(data as Record<string, unknown>);
    },
  });

  expect(result).toEqual({
    message: "digest.deliver skipped because email delivery is disabled for digest-1",
    nextStep: null,
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-1",
      emailSubject: "[smart-feed] 日报 2026-03-31",
      recipient: null,
      sentAt: null,
      skippedAlreadySent: false,
      skippedDeliveryDisabled: true,
    },
    status: "completed",
  });
  expect(digestUpdates).toEqual([]);
});

test("runDigestDeliver sends digest email and marks report as sent", async () => {
  const digestUpdates: Array<Record<string, unknown>> = [];

  const result = await runDigestDeliver(createJobData(), {
    getAppEnv() {
      return {
        emailDeliveryEnabled: true,
        smtpFrom: "from@example.com",
        smtpHost: "smtp.example.com",
        smtpPass: "pass",
        smtpPort: 587,
        smtpTo: "to@example.com",
        smtpUser: "user",
      };
    },
    async getDigestReportById() {
      return createDigestReport() as never;
    },
    now() {
      return new Date("2026-03-31T08:00:00.000Z");
    },
    async sendDigestEmail(input) {
      expect(input).toMatchObject({
        from: "from@example.com",
        host: "smtp.example.com",
        markdownBody: "# [smart-feed] 日报 2026-03-31\n\n内容",
        subject: "[smart-feed] 日报 2026-03-31",
        to: "to@example.com",
      });

      return {
        messageId: "message-1",
      };
    },
    async updateDigestReport(_digestId, data) {
      digestUpdates.push(data as Record<string, unknown>);
    },
  });

  expect(result).toEqual({
    message: "digest.deliver sent digest-1 to to@example.com",
    nextStep: null,
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-1",
      emailSubject: "[smart-feed] 日报 2026-03-31",
      recipient: "to@example.com",
      sentAt: "2026-03-31T08:00:00.000Z",
      skippedAlreadySent: false,
      skippedDeliveryDisabled: false,
    },
    status: "completed",
  });
  expect(digestUpdates).toEqual([
    {
      sentAt: new Date("2026-03-31T08:00:00.000Z"),
      status: "sent",
    },
  ]);
});

test("runDigestDeliver marks report failed and rethrows when email configuration is invalid", async () => {
  const digestUpdates: Array<Record<string, unknown>> = [];

  await expect(
    runDigestDeliver(createJobData(), {
      getAppEnv() {
        throw new Error("SMTP_HOST is required when SMART_FEED_EMAIL_DELIVERY_ENABLED is true.");
      },
      async getDigestReportById() {
        return createDigestReport() as never;
      },
      async updateDigestReport(_digestId, data) {
        digestUpdates.push(data as Record<string, unknown>);
      },
    }),
  ).rejects.toThrow("SMTP_HOST is required when SMART_FEED_EMAIL_DELIVERY_ENABLED is true.");

  expect(digestUpdates).toEqual([
    {
      sentAt: null,
      status: "failed",
    },
  ]);
});

test("runDigestDeliver marks report failed and rethrows when SMTP send fails", async () => {
  const digestUpdates: Array<Record<string, unknown>> = [];

  await expect(
    runDigestDeliver(createJobData(), {
      getAppEnv() {
        return {
          emailDeliveryEnabled: true,
          smtpFrom: "from@example.com",
          smtpHost: "smtp.example.com",
          smtpPass: "pass",
          smtpPort: 587,
          smtpTo: "to@example.com",
          smtpUser: "user",
        };
      },
      async getDigestReportById() {
        return createDigestReport() as never;
      },
      async sendDigestEmail() {
        throw new Error("SMTP refused connection");
      },
      async updateDigestReport(_digestId, data) {
        digestUpdates.push(data as Record<string, unknown>);
      },
    }),
  ).rejects.toThrow("SMTP refused connection");

  expect(digestUpdates).toEqual([
    {
      sentAt: null,
      status: "failed",
    },
  ]);
});
