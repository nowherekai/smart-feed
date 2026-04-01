/**
 * 摘要投递服务模块
 * 负责执行摘要报告的邮件发送逻辑。
 * 包含：报告状态检查、邮件配置校验、调用邮件服务发送、以及更新报告投递状态。
 */

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

/** 摘要投递业务载荷 */
export type DigestDeliverPayload = {
  /** 报告日期 */
  digestDate: string | null;
  /** 报告 ID */
  digestId: string;
  /** 邮件主题 */
  emailSubject: string | null;
  /** 收件人地址 */
  recipient: string | null;
  /** 发送时间 (ISO) */
  sentAt: string | null;
  /** 是否因已发送而跳过 */
  skippedAlreadySent: boolean;
  /** 是否因功能关闭而跳过 */
  skippedDeliveryDisabled: boolean;
};

/** 投递依赖项 */
export type DigestDeliverDeps = {
  getAppEnv?: () => Readonly<EmailDeliveryEnv>;
  getDigestReportById?: (digestId: string) => Promise<DigestReportRecord | null>;
  now?: () => Date;
  sendDigestEmail?: typeof sendDigestEmail;
  updateDigestReport?: (digestId: string, data: DigestReportUpdate) => Promise<void>;
};

// --- 辅助函数 ---

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

/** 提取并校验 SMTP 传输配置 */
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

// --- 数据库操作 ---

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

/**
 * 投递任务核心逻辑 (Task 7)
 * 1. 查找报告：根据 digestId 获取报告元数据。
 * 2. 状态预检：若报告已发送，则幂等跳过。
 * 3. 环境校验：若环境变量未开启邮件发送，则记录状态并跳过。
 * 4. 内容校验：确保 Markdown 正文非空。
 * 5. 执行发送：调用底层 SMTP 服务发送邮件。
 * 6. 更新状态：成功后更新 sent_at 和 status="sent"。
 */
export async function runDigestDeliver(
  jobData: DigestDeliverJobData,
  overrides: DigestDeliverDeps = {},
): Promise<PipelineStepResult<DigestDeliverPayload>> {
  const deps = buildDeps(overrides);
  const report = await deps.getDigestReportById(jobData.digestId);

  // 1. 基础校验
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

  // 2. 幂等检查
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

  // 3. 配置加载与开关判定
  try {
    appEnv = deps.getAppEnv();
  } catch (error) {
    const message = toErrorMessage(error);
    await deps.updateDigestReport(report.id, { sentAt: null, status: "failed" });
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

  // 4. 内容完整性校验
  if (!report.markdownBody?.trim()) {
    const error = new Error(`[services/digest-delivery] Digest "${report.id}" has empty markdown body.`);
    await deps.updateDigestReport(report.id, { sentAt: null, status: "failed" });
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
    await deps.updateDigestReport(report.id, { sentAt: null, status: "failed" });
    throw error;
  }

  // 5. 执行投递
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

    // 6. 持久化发送成功状态
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

    await deps.updateDigestReport(report.id, { sentAt: null, status: "failed" });
    logger.error("digest delivery send failed", {
      digestId: report.id,
      error: message,
      recipient: transportConfig.to,
      trigger: jobData.trigger,
    });
    throw error;
  }
}

export type { DigestDeliverJobData, DigestReportRecord, DigestReportUpdate, EmailDeliveryEnv };
