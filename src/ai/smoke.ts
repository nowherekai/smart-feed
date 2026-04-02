/**
 * AI smoke test 脚本
 * 用于通过 Bun 直接验证 src/ai/client.ts 的真实初始化与调用链路。
 *
 * 用法:
 *   bun src/ai/smoke.ts
 *   bun src/ai/smoke.ts basic
 *   bun run ai:smoke -- heavy
 */

import { getAppEnv } from "../config";
import { createLogger } from "../utils";
import { type AiTaskKind, createAiClient } from "./client";
import type { AiPromptInput } from "./prompts";

type SmokeMode = AiTaskKind | "all";

const logger = createLogger("AiSmoke");

const defaultInput: AiPromptInput = {
  cleanedMd: [
    "smart-feed 正在接入 AI 分析能力，用于对文章做基础分类和深度摘要。",
    "这次 smoke test 会验证运行时配置、模型初始化，以及结构化输出链路是否可用。",
    "如果环境变量指向真实模型，脚本会直接调用 provider；如果指向 dummy，则会走本地假数据路径。",
  ].join("\n\n"),
  originalUrl: "https://example.com/smoke-test",
  sourceName: "AI Smoke Test",
  title: "验证 src/ai/client.ts 是否可正常运行",
};

function parseSmokeMode(rawMode: string | undefined): SmokeMode {
  if (rawMode === undefined) {
    return "all";
  }

  if (rawMode === "basic" || rawMode === "heavy" || rawMode === "all") {
    return rawMode;
  }

  throw new Error(`[ai/smoke] Unsupported mode "${rawMode}". Expected one of: basic, heavy, all.`);
}

async function runTask(client: ReturnType<typeof createAiClient>, kind: AiTaskKind): Promise<void> {
  logger.info("Running AI smoke task", {
    kind,
    resolvedConfig: client.resolveAiTaskConfig(kind),
  });

  const result =
    kind === "basic" ? await client.runBasicAnalysis(defaultInput) : await client.runHeavySummary(defaultInput);

  console.log(
    JSON.stringify(
      {
        kind,
        result,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = parseSmokeMode(process.argv[2]);
  const env = getAppEnv();
  const client = createAiClient({ env });

  logger.info("AI smoke test started", {
    apiKeyConfigured: env.openRouterApiKey !== null,
    basicModel: env.aiBasicModel,
    heavyModel: env.aiHeavyModel,
    mode,
    runtimeState: client.getAiRuntimeState(),
  });

  if (mode === "all") {
    await runTask(client, "basic");
    await runTask(client, "heavy");
  } else {
    await runTask(client, mode);
  }

  logger.info("AI smoke test completed", { mode });
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error("AI smoke test failed", {
    error: message,
    stack,
  });
  process.exitCode = 1;
});
