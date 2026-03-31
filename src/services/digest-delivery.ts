import { eq } from "drizzle-orm";

import { type AppEnv, getAppEnv } from "../config";
import { digestReports, getDb } from "../db";
import { createCompletedStepResult, createFailedStepResult, type PipelineStepResult } from "../pipeline/types";
import { logger } from "../utils";
import { type DigestDeliverJobData, getEmailSubject } from "./digest";
import { type EmailTransportConfig, sendDigestEmail } from "./email";

type DigestReportRecord = typeof digestReports.$inferSelect;
type DigestReportUpdate = Partial<Omit<typeof digestReports.$inferInsert, "id">>;

type EmailDeliveryEnv = Pick<
  AppEnv,
  "emailDeliveryEnabled" | "smtpFrom" | "smtpHost" | "smtpPass" | "smtpPort" | "smtpTo" | "smtpUser"
>;

export type DigestDeliverPayload = {
  digestDate: string | null;
  digestId: string;
  emailSubject: string | null;
  recipient: string | null;
  sentAt: string | null;
  skippedAlreadySent: boolean;
  skippedDeliveryDisabled: boolean;
};

export type DigestDeliverDeps = {
  getAppEnv?: () => Readonly<EmailDeliveryEnv>;
  getDigestReportById?: (digestId: string) => Promise<DigestReportRecord | null>;
  now?: () => Date;
  sendDigestEmail?: typeof sendDigestEmail;
  updateDigestReport?: (digestId: string, data: DigestReportUpdate) => Promise<void>;
};

function buildPayload(input: {
  digestDate: string | null;
  digestId: string;
  emailSubject: string | null;
  recipient: string | null;
  sentAt: Date | null;
  skippedAlreadySent: boolean;
  skippedDeliveryDisabled: boolean;
}): DigestDeliverPayload {
  return {
    digestDate: input.digestDate,
    digestId: input.digestId,
    emailSubject: input.emailSubject,
    recipient: input.recipient,
    sentAt: input.sentAt?.toISOString() ?? null,
    skippedAlreadySent: input.skippedAlreadySent,
    skippedDeliveryDisabled: input.skippedDeliveryDisabled,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown digest delivery error.";
}

function getRequiredEmailTransportConfig(appEnv: Readonly<EmailDeliveryEnv>): EmailTransportConfig {
  if (
    !appEnv.smtpFrom ||
    !appEnv.smtpHost ||
    !appEnv.smtpPass ||
    appEnv.smtpPort === null ||
    !appEnv.smtpTo ||
    !appEnv.smtpUser
  ) {
    throw new Error("[services/digest-delivery] SMTP configuration is incomplete while email delivery is enabled.");
  }

  return {
    from: appEnv.smtpFrom,
    host: appEnv.smtpHost,
    pass: appEnv.smtpPass,
    port: appEnv.smtpPort,
    to: appEnv.smtpTo,
    user: appEnv.smtpUser,
  };
}

async function getDigestReportById(digestId: string): Promise<DigestReportRecord | null> {
  const db = getDb();
  const [report] = await db.select().from(digestReports).where(eq(digestReports.id, digestId));

  return report ?? null;
}

async function updateDigestReport(digestId: string, data: DigestReportUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(digestReports).set(data).where(eq(digestReports.id, digestId));
}

function buildDeps(overrides: DigestDeliverDeps): Required<DigestDeliverDeps> {
  return {
    getAppEnv: overrides.getAppEnv ?? getAppEnv,
    getDigestReportById: overrides.getDigestReportById ?? getDigestReportById,
    now: overrides.now ?? (() => new Date()),
    sendDigestEmail: overrides.sendDigestEmail ?? sendDigestEmail,
    updateDigestReport: overrides.updateDigestReport ?? updateDigestReport,
  };
}

export async function runDigestDeliver(
  jobData: DigestDeliverJobData,
  overrides: DigestDeliverDeps = {},
): Promise<PipelineStepResult<DigestDeliverPayload>> {
  const deps = buildDeps(overrides);
  const report = await deps.getDigestReportById(jobData.digestId);

  if (!report) {
    return createFailedStepResult({
      message: `[services/digest-delivery] Digest "${jobData.digestId}" not found.`,
      payload: buildPayload({
        digestDate: null,
        digestId: jobData.digestId,
        emailSubject: null,
        recipient: null,
        sentAt: null,
        skippedAlreadySent: false,
        skippedDeliveryDisabled: false,
      }),
    });
  }

  const emailSubject = report.emailSubject?.trim() ? report.emailSubject : getEmailSubject(report.digestDate);

  if (report.status === "sent" || report.sentAt) {
    return createCompletedStepResult({
      message: `digest.deliver skipped because ${report.id} is already sent`,
      payload: buildPayload({
        digestDate: report.digestDate,
        digestId: report.id,
        emailSubject,
        recipient: null,
        sentAt: report.sentAt ?? null,
        skippedAlreadySent: true,
        skippedDeliveryDisabled: false,
      }),
    });
  }

  let appEnv: Readonly<EmailDeliveryEnv>;

  try {
    appEnv = deps.getAppEnv();
  } catch (error) {
    const message = toErrorMessage(error);

    await deps.updateDigestReport(report.id, {
      sentAt: null,
      status: "failed",
    });
    logger.error("digest delivery failed to load email configuration", {
      digestId: report.id,
      error: message,
      trigger: jobData.trigger,
    });
    throw error;
  }

  if (!appEnv.emailDeliveryEnabled) {
    logger.info("digest delivery skipped because email delivery is disabled", {
      digestId: report.id,
      trigger: jobData.trigger,
    });

    return createCompletedStepResult({
      message: `digest.deliver skipped because email delivery is disabled for ${report.id}`,
      payload: buildPayload({
        digestDate: report.digestDate,
        digestId: report.id,
        emailSubject,
        recipient: null,
        sentAt: null,
        skippedAlreadySent: false,
        skippedDeliveryDisabled: true,
      }),
    });
  }

  if (!report.markdownBody?.trim()) {
    const error = new Error(`[services/digest-delivery] Digest "${report.id}" has empty markdown body.`);

    await deps.updateDigestReport(report.id, {
      sentAt: null,
      status: "failed",
    });
    logger.error("digest delivery failed because markdown body is empty", {
      digestId: report.id,
      trigger: jobData.trigger,
    });
    throw error;
  }

  let transportConfig: EmailTransportConfig;

  try {
    transportConfig = getRequiredEmailTransportConfig(appEnv);
  } catch (error) {
    await deps.updateDigestReport(report.id, {
      sentAt: null,
      status: "failed",
    });
    throw error;
  }

  try {
    await deps.sendDigestEmail({
      from: transportConfig.from,
      host: transportConfig.host,
      markdownBody: report.markdownBody,
      pass: transportConfig.pass,
      port: transportConfig.port,
      subject: emailSubject,
      to: transportConfig.to,
      user: transportConfig.user,
    });

    const sentAt = deps.now();

    await deps.updateDigestReport(report.id, {
      sentAt,
      status: "sent",
    });

    return createCompletedStepResult({
      message: `digest.deliver sent ${report.id} to ${transportConfig.to}`,
      payload: buildPayload({
        digestDate: report.digestDate,
        digestId: report.id,
        emailSubject,
        recipient: transportConfig.to,
        sentAt,
        skippedAlreadySent: false,
        skippedDeliveryDisabled: false,
      }),
    });
  } catch (error) {
    const message = toErrorMessage(error);

    await deps.updateDigestReport(report.id, {
      sentAt: null,
      status: "failed",
    });
    logger.error("digest delivery send failed", {
      digestId: report.id,
      error: message,
      recipient: transportConfig.to,
      trigger: jobData.trigger,
    });
    throw error;
  }
}

export type { DigestReportRecord, DigestReportUpdate, EmailDeliveryEnv };
