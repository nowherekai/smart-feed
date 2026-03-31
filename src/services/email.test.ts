import { expect, test } from "bun:test";

import { renderDigestEmail, type SendEmailDeps, sendEmail } from "./email";

test("renderDigestEmail converts markdown into wrapped HTML and plain text", async () => {
  const result = await renderDigestEmail("# 标题\n\n- 要点 A\n- 要点 B\n\n[原文](https://example.com)");

  expect(result.text).toContain("# 标题");
  expect(result.html).toContain("<h1>标题</h1>");
  expect(result.html).toContain("<li>要点 A</li>");
  expect(result.html).toContain('href="https://example.com"');
  expect(result.html).toContain("<!doctype html>");
});

test("sendEmail creates SMTP transport and sends html/text payload", async () => {
  const sentMessages: Array<Record<string, unknown>> = [];
  const transportConfigs: Array<Record<string, unknown>> = [];
  const createTransport = (config: unknown) => {
    transportConfigs.push(config as Record<string, unknown>);

    return {
      async sendMail(message: { from: string; html: string; subject: string; text: string; to: string }) {
        sentMessages.push(message as Record<string, unknown>);

        return {
          messageId: "message-1",
        };
      },
    } as never;
  };

  const result = await sendEmail(
    {
      from: "from@example.com",
      host: "smtp.example.com",
      html: "<p>Hello</p>",
      pass: "pass",
      port: 587,
      subject: "Subject",
      text: "Hello",
      to: "to@example.com",
      user: "user",
    },
    {
      createTransport: createTransport as NonNullable<SendEmailDeps["createTransport"]>,
    },
  );

  expect(result).toEqual({
    messageId: "message-1",
  });
  expect(transportConfigs).toEqual([
    {
      auth: {
        pass: "pass",
        user: "user",
      },
      host: "smtp.example.com",
      port: 587,
      secure: false,
    },
  ]);
  expect(sentMessages).toEqual([
    {
      from: "from@example.com",
      html: "<p>Hello</p>",
      subject: "Subject",
      text: "Hello",
      to: "to@example.com",
    },
  ]);
});
