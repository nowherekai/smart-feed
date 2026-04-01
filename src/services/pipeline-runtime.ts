/**
 * 通用内容流水线运行时模块
 * 负责执行流水线中的单个步骤，并自动处理：
 * 1. 流水线运行记录 (PipelineRun) 的创建与状态更新。
 * 2. 步骤运行记录 (StepRun) 的记录。
 * 3. 结果状态 (Outcome) 的持久化。
 * 4. 链式任务 (Next Step) 的自动入队。
 */

import type { ContentPipelineJobData, PipelineStepExecutionResult, PipelineStepResult } from "../pipeline/types";
import { createQueue, type JobName } from "../queue";
import {
  createPipelineRun,
  createStepRun,
  type NewPipelineRun,
  type NewStepRun,
  updatePipelineRun,
  updateStepRun,
} from "./pipeline-tracking";

/** 内容处理流水线的固化名称与版本 */
const CONTENT_PIPELINE_NAME = "content-processing";
const CONTENT_PIPELINE_VERSION = "v1";

/** 入队任务函数类型 */
type EnqueueJob = (jobName: JobName, data: Record<string, unknown>) => Promise<void>;

/** 运行时依赖项，支持依赖注入以方便测试 */
type ContentPipelineRuntimeDeps = {
  createPipelineRun?: (data: NewPipelineRun) => Promise<{ id: string }>;
  createStepRun?: (data: NewStepRun) => Promise<{ id: string }>;
  enqueueJob?: EnqueueJob;
  now?: () => Date;
  updatePipelineRun?: (id: string, data: Partial<Omit<NewPipelineRun, "id">>) => Promise<void>;
  updateStepRun?: (id: string, data: Partial<Omit<NewStepRun, "id">>) => Promise<void>;
};

/** 执行选项 */
type ExecuteContentPipelineStepOptions<
  TJobData extends ContentPipelineJobData,
  TPayload extends Record<string, unknown>,
> = {
  deps?: ContentPipelineRuntimeDeps;
  jobData: TJobData;
  jobName: JobName;
  /** 具体的业务执行函数 */
  runStep: (jobData: TJobData) => Promise<PipelineStepResult<TPayload>>;
};

/** 序列化辅助函数，用于记录输入输出到数据库 */
function serialize(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

/** 错误消息提取辅助函数 */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown pipeline runtime error.";
}

/** 默认的任务入队实现，直接调用 BullMQ */
async function defaultEnqueueJob(jobName: JobName, data: Record<string, unknown>): Promise<void> {
  const queue = createQueue<Record<string, unknown>>();
  await queue.add(jobName, data);
}

/** 构建并填充默认依赖 */
function buildRuntimeDeps(overrides: ContentPipelineRuntimeDeps = {}): Required<ContentPipelineRuntimeDeps> {
  return {
    createPipelineRun: overrides.createPipelineRun ?? createPipelineRun,
    createStepRun: overrides.createStepRun ?? createStepRun,
    enqueueJob: overrides.enqueueJob ?? defaultEnqueueJob,
    now: overrides.now ?? (() => new Date()),
    updatePipelineRun: overrides.updatePipelineRun ?? updatePipelineRun,
    updateStepRun: overrides.updateStepRun ?? updateStepRun,
  };
}

/** 为下一步的数据注入当前的流水线运行 ID，确保链路追踪 */
function withPipelineRunId<TData extends Record<string, unknown>>(data: TData, pipelineRunId: string): TData {
  return {
    ...data,
    pipelineRunId,
  };
}

/**
 * 执行内容流水线步骤的核心函数
 * 逻辑流：
 * 1. 检查或创建 PipelineRun。
 * 2. 创建并记录 StepRun (状态: running)。
 * 3. 调用传入的 runStep 执行业务逻辑。
 * 4. 处理业务逻辑返回的 PipelineStepResult。
 * 5. 如果有下一步 (nextStep)，将其入队，并透传 pipelineRunId。
 * 6. 更新 StepRun 和 PipelineRun 的最终状态 (completed/failed)。
 */
export async function executeContentPipelineStep<
  TJobData extends ContentPipelineJobData,
  TPayload extends Record<string, unknown>,
>(options: ExecuteContentPipelineStepOptions<TJobData, TPayload>): Promise<PipelineStepExecutionResult<TPayload>> {
  const { jobData, jobName, runStep } = options;
  const deps = buildRuntimeDeps(options.deps);
  const startedAt = deps.now();

  let pipelineRunId = jobData.pipelineRunId;

  // 1. 若没有传入 pipelineRunId，说明是流水线的起点，创建一个新的运行记录
  if (!pipelineRunId) {
    const pipelineRun = await deps.createPipelineRun({
      contentId: jobData.contentId,
      pipelineName: CONTENT_PIPELINE_NAME,
      pipelineVersion: CONTENT_PIPELINE_VERSION,
      startedAt,
      status: "running",
    });

    pipelineRunId = pipelineRun.id;
  } else {
    // 否则更新已有记录状态为运行中
    await deps.updatePipelineRun(pipelineRunId, {
      status: "running",
    });
  }

  // 2. 记录当前步骤的开始
  const stepRun = await deps.createStepRun({
    inputRef: serialize(jobData),
    pipelineRunId,
    startedAt,
    status: "running",
    stepName: jobName,
  });

  try {
    // 3. 执行核心业务逻辑
    const result = await runStep(jobData);
    const outputRef = serialize({
      message: result.message ?? null,
      nextStep: result.nextStep
        ? {
            data: result.nextStep.data,
            jobName: result.nextStep.jobName,
          }
        : null,
      outcome: result.outcome,
      payload: result.payload,
      status: result.status,
    });

    // 4. 处理业务层标记的失败
    if (result.status === "failed") {
      const finishedAt = deps.now();

      await deps.updateStepRun(stepRun.id, {
        errorMessage: result.message ?? "Unknown step failure.",
        finishedAt,
        outputRef,
        status: "failed",
      });
      await deps.updatePipelineRun(pipelineRunId, {
        finishedAt,
        status: "failed",
      });

      return {
        jobName,
        message: result.message ?? null,
        nextStepQueued: false,
        outcome: result.outcome,
        payload: result.payload,
        pipelineRunId,
        status: result.status,
      };
    }

    // 5. 业务逻辑成功，处理下一步任务入队
    let nextStepQueued = false;

    if (result.nextStep) {
      // 注入 pipelineRunId 实现跨 Job 追踪
      await deps.enqueueJob(result.nextStep.jobName, withPipelineRunId(result.nextStep.data, pipelineRunId));
      nextStepQueued = true;
    }

    const finishedAt = deps.now();

    // 6. 更新当前步骤为完成
    await deps.updateStepRun(stepRun.id, {
      errorMessage: null,
      finishedAt,
      outputRef,
      status: "completed",
    });

    // 7. 若没有下一步了，整个流水线标记为完成
    if (!result.nextStep) {
      await deps.updatePipelineRun(pipelineRunId, {
        finishedAt,
        status: "completed",
      });
    }

    return {
      jobName,
      message: result.message ?? null,
      nextStepQueued,
      outcome: result.outcome,
      payload: result.payload,
      pipelineRunId,
      status: result.status,
    };
  } catch (error) {
    // 8. 处理未捕获的运行时异常
    const finishedAt = deps.now();
    const errorMessage = toErrorMessage(error);

    await deps.updateStepRun(stepRun.id, {
      errorMessage,
      finishedAt,
      outputRef: null,
      status: "failed",
    });
    await deps.updatePipelineRun(pipelineRunId, {
      finishedAt,
      status: "failed",
    });

    throw error;
  }
}

export type { ContentPipelineRuntimeDeps };
export { CONTENT_PIPELINE_NAME, CONTENT_PIPELINE_VERSION };
