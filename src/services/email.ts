import { marked } from "marked";
import nodemailer from "nodemailer";

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

export async function renderDigestEmail(markdownBody: string): Promise<EmailContent> {
  const normalizedMarkdown = markdownBody.trim();
  const parsedHtml = await marked.parse(normalizedMarkdown);

  return {
    html: wrapEmailHtml(parsedHtml),
    text: normalizedMarkdown,
  };
}

export async function sendEmail(input: SendEmailInput, overrides: SendEmailDeps = {}): Promise<{ messageId?: string }> {
  const createTransport = overrides.createTransport ?? nodemailer.createTransport;
  const transport = createTransport({
    auth: {
      pass: input.pass,
      user: input.user,
    },
    host: input.host,
    port: input.port,
    secure: input.port === 465,
  });
  const info = await transport.sendMail({
    from: input.from,
    html: input.html,
    subject: input.subject,
    text: input.text,
    to: input.to,
  });

  return {
    messageId: info.messageId,
  };
}

export async function sendDigestEmail(
  input: SendDigestEmailInput,
  overrides: SendEmailDeps = {},
): Promise<{ messageId?: string }> {
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
