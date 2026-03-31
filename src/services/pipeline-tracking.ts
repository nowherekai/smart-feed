import { eq } from "drizzle-orm";

import { getDb, pipelineRuns, stepRuns } from "../db";

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

export async function createPipelineRun(data: NewPipelineRun): Promise<PipelineRun> {
  const db = getDb();
  const [pipelineRun] = await db.insert(pipelineRuns).values(data).returning();

  return requireInsertedRow(pipelineRun, "pipeline run");
}

export async function updatePipelineRun(
  id: string,
  data: PipelineRunUpdate,
): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(pipelineRuns).set(data).where(eq(pipelineRuns.id, id));
}

export async function createStepRun(data: NewStepRun): Promise<StepRun> {
  const db = getDb();
  const [stepRun] = await db.insert(stepRuns).values(data).returning();

  return requireInsertedRow(stepRun, "step run");
}

export async function updateStepRun(id: string, data: StepRunUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(stepRuns).set(data).where(eq(stepRuns.id, id));
}

export type {
  NewPipelineRun,
  NewStepRun,
  PipelineRun,
  PipelineRunUpdate,
  StepRun,
  StepRunUpdate,
};
