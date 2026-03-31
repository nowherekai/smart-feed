import { existsSync, readFileSync } from "node:fs";

import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { getDb, pipelineRuns, stepRuns } from "../db";
import {
  createPipelineRun,
  createStepRun,
  updatePipelineRun,
  updateStepRun,
} from "./pipeline-tracking";

function loadEnvValueFromFiles(name: string): string | null {
  for (const filePath of [".env.local", ".env"]) {
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      if (!line.startsWith(`${name}=`)) {
        continue;
      }

      const value = line.slice(name.length + 1).trim();
      return value || null;
    }
  }

  return null;
}

test("pipeline tracking CRUD persists pipeline runs and step runs", async () => {
  // Bun test 在当前项目里不会稳定自动注入 .env.local，因此测试侧做一次兜底读取。
  const databaseUrl = process.env.DATABASE_URL ?? loadEnvValueFromFiles("DATABASE_URL");

  if (!databaseUrl) {
    console.warn("[test] Skipping pipeline tracking integration test because DATABASE_URL is missing.");
    return;
  }

  process.env.DATABASE_URL = databaseUrl;

  const db = getDb();
  const pipelineName = `task0-test-${crypto.randomUUID()}`;
  const stepName = `step-${crypto.randomUUID()}`;
  const startedAt = new Date("2026-03-31T09:00:00.000Z");
  const finishedAt = new Date("2026-03-31T09:05:00.000Z");

  const pipelineRun = await createPipelineRun({
    pipelineName,
    pipelineVersion: "v1",
    status: "pending",
  });

  try {
    const stepRun = await createStepRun({
      pipelineRunId: pipelineRun.id,
      stepName,
      status: "pending",
    });

    try {
      await updatePipelineRun(pipelineRun.id, {
        status: "completed",
        startedAt,
        finishedAt,
      });
      await updateStepRun(stepRun.id, {
        status: "failed",
        startedAt,
        finishedAt,
        errorMessage: "boom",
      });

      const [storedPipelineRun] = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.id, pipelineRun.id));
      const [storedStepRun] = await db
        .select()
        .from(stepRuns)
        .where(eq(stepRuns.id, stepRun.id));

      expect(storedPipelineRun).toBeDefined();
      expect(storedStepRun).toBeDefined();

      if (!storedPipelineRun || !storedStepRun) {
        throw new Error("Expected stored pipeline and step runs to exist.");
      }

      expect(storedPipelineRun.status).toBe("completed");
      expect(storedPipelineRun.startedAt?.toISOString()).toBe(startedAt.toISOString());
      expect(storedPipelineRun.finishedAt?.toISOString()).toBe(finishedAt.toISOString());
      expect(storedStepRun.status).toBe("failed");
      expect(storedStepRun.errorMessage).toBe("boom");
      expect(storedStepRun.startedAt?.toISOString()).toBe(startedAt.toISOString());
      expect(storedStepRun.finishedAt?.toISOString()).toBe(finishedAt.toISOString());
    } finally {
      await db.delete(stepRuns).where(eq(stepRuns.id, stepRun.id));
    }
  } finally {
    await db.delete(pipelineRuns).where(eq(pipelineRuns.id, pipelineRun.id));
  }
});
