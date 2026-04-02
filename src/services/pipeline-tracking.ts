/**
 * 流水线追踪服务模块
 * 提供对 pipeline_runs 和 step_runs 表的增删改查操作。
 * 用于审计和监控系统内所有自动化任务的执行情况。
 */

import { eq } from "drizzle-orm";

import { getDb, pipelineRuns, stepRuns } from "../db";
import { logger } from "../utils";

type PipelineRun = typeof pipelineRuns.$inferSelect;
type NewPipelineRun = typeof pipelineRuns.$inferInsert;
type PipelineRunUpdate = Partial<Omit<NewPipelineRun, "id">>;

type StepRun = typeof stepRuns.$inferSelect;
type NewStepRun = typeof stepRuns.$inferInsert;
type StepRunUpdate = Partial<Omit<NewStepRun, "id">>;

function requireInsertedRow<T>(row: T | undefined, entityName: string): T {
  if (!row) {
    throw new Error(`[services/pipeline-tracking] Failed to insert ${entityName}.`);
  }

  return row;
}

/** 创建流水线运行记录 */
export async function createPipelineRun(data: NewPipelineRun): Promise<PipelineRun> {
  const db = getDb();
  const [pipelineRun] = await db.insert(pipelineRuns).values(data).returning();

  const record = requireInsertedRow(pipelineRun, "pipeline run");
  logger.debug("Database: Pipeline run created", {
    pipelineRunId: record.id,
    pipelineName: record.pipelineName,
  });

  return record;
}

/** 更新流水线运行记录（状态、结束时间等） */
export async function updatePipelineRun(id: string, data: PipelineRunUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(pipelineRuns).set(data).where(eq(pipelineRuns.id, id));
  logger.debug("Database: Pipeline run updated", { pipelineRunId: id, status: data.status });
}

/** 创建步骤运行记录 */
export async function createStepRun(data: NewStepRun): Promise<StepRun> {
  const db = getDb();
  const [stepRun] = await db.insert(stepRuns).values(data).returning();

  const record = requireInsertedRow(stepRun, "step run");
  logger.debug("Database: Step run created", {
    stepRunId: record.id,
    stepName: record.stepName,
  });

  return record;
}

/** 更新步骤运行记录（结果引用、错误消息等） */
export async function updateStepRun(id: string, data: StepRunUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(stepRuns).set(data).where(eq(stepRuns.id, id));
  logger.debug("Database: Step run updated", { stepRunId: id, status: data.status });
}

export type { NewPipelineRun, NewStepRun, PipelineRun, PipelineRunUpdate, StepRun, StepRunUpdate };
