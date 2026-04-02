/**
 * 邮件发送服务模块
 * 负责摘要报告的 HTML 渲染及通过 SMTP 协议进行投递。
 * 包含：Markdown 转 HTML、内联 CSS 模板包裹、SMTP 客户端初始化及邮件发送。
 */

import { marked } from "marked";
import nodemailer from "nodemailer";
import { createLogger } from "../utils";

type EmailTransportConfig = {
  from: string;
  host: string;
  pass: string;
  port: number;
  to: string;
  user: string;
};

type EmailContent = {
  html: string;
  text: string;
};

type SendEmailInput = EmailTransportConfig & {
  html: string;
  subject: string;
  text: string;
};

type SendEmailDeps = {
  createTransport?: typeof nodemailer.createTransport;
};

type SendDigestEmailInput = EmailTransportConfig & {
  markdownBody: string;
  subject: string;
};
const logger = createLogger("EmailService");

/**
 * 基础 HTML 邮件包装模板
 * 使用内联样式确保在不同邮件客户端中的显示效果。
 */
function wrapEmailHtml(contentHtml: string): string {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>smart-feed Digest</title>",
    "</head>",
    "<body style=\"margin:0;padding:24px;background:#f7f7f5;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;\">",
    '<div style="max-width:720px;margin:0 auto;padding:32px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">',
    contentHtml,
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

/**
 * 渲染摘要邮件内容
 * 将 Markdown 渲染为带样式的 HTML，同时保留纯文本版本作为备选。
 */
export async function renderDigestEmail(markdownBody: string): Promise<EmailContent> {
  const normalizedMarkdown = markdownBody.trim();
  const parsedHtml = await marked.parse(normalizedMarkdown);

  return {
    html: wrapEmailHtml(parsedHtml),
    text: normalizedMarkdown,
  };
}

/**
 * 底层邮件发送函数
 */
export async function sendEmail(input: SendEmailInput, overrides: SendEmailDeps = {}): Promise<{ messageId?: string }> {
  const createTransport = overrides.createTransport ?? nodemailer.createTransport;
  const transport = createTransport({
    auth: {
      pass: input.pass,
      user: input.user,
    },
    host: input.host,
    port: input.port,
    secure: input.port === 465, // 465 端口默认启用 SSL
  });

  logger.info("Attempting to send email via SMTP", {
    host: input.host,
    port: input.port,
    recipient: input.to,
    subject: input.subject,
  });

  try {
    const info = await transport.sendMail({
      from: input.from,
      html: input.html,
      subject: input.subject,
      text: input.text,
      to: input.to,
    });

    logger.info("Email sent successfully", {
      messageId: info.messageId,
      recipient: input.to,
      subject: input.subject,
    });

    return {
      messageId: info.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown SMTP error";
    logger.error("Email sending failed", {
      error: errorMessage,
      host: input.host,
      recipient: input.to,
      subject: input.subject,
    });
    throw error;
  }
}

/**
 * 高层摘要邮件发送入口
 * 接收 Markdown 正文，自动渲染并发送。
 */
export async function sendDigestEmail(
  input: SendDigestEmailInput,
  overrides: SendEmailDeps = {},
): Promise<{ messageId?: string }> {
  logger.info("Starting digest email preparation and delivery", {
    recipient: input.to,
    subject: input.subject,
  });

  const content = await renderDigestEmail(input.markdownBody);

  return sendEmail(
    {
      ...content,
      from: input.from,
      host: input.host,
      pass: input.pass,
      port: input.port,
      subject: input.subject,
      to: input.to,
      user: input.user,
    },
    overrides,
  );
}

export type { EmailContent, EmailTransportConfig, SendDigestEmailInput, SendEmailDeps, SendEmailInput };
