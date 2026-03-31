import { expect, test } from "bun:test";

import { getPromptDefinition } from "./prompts";

test("prompt registry exposes basic and heavy prompt definitions", () => {
  const basic = getPromptDefinition("basic-analysis-v1");
  const heavy = getPromptDefinition("heavy-summary-v1");

  expect(basic.promptVersion).toBe("basic-analysis-v1");
  expect(basic.kind).toBe("basic");
  expect(basic.getModelStrategy("dummy")).toBe("dummy-basic");
  expect(basic.getModelStrategy("openrouter")).toBe("openrouter-basic");

  expect(heavy.promptVersion).toBe("heavy-summary-v1");
  expect(heavy.kind).toBe("heavy");
  expect(heavy.getModelStrategy("dummy")).toBe("dummy-heavy");
  expect(heavy.getModelStrategy("openrouter")).toBe("openrouter-heavy");
});

test("prompt builder includes title, source and url context", () => {
  const prompt = getPromptDefinition("basic-analysis-v1").buildMessages({
    cleanedMd: "这是一段用于测试的正文。",
    originalUrl: "https://example.com/post",
    sourceName: "Example Feed",
    title: "测试标题",
  });

  expect(prompt.system).toContain("smart-feed");
  expect(prompt.prompt).toContain("测试标题");
  expect(prompt.prompt).toContain("Example Feed");
  expect(prompt.prompt).toContain("https://example.com/post");
});
