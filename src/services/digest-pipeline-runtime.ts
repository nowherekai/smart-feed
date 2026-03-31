/**
 * 摘要流水线运行时模块
 * 专门负责“摘要生成 (digest.compose)”与“摘要投递 (digest.deliver)”流水线的执行与状态追踪。
 * 与内容流水线运行时类似，但增加了对 digestId 的解析与关联。
 */

import type { PipelineStepExecutionResult, PipelineStepResult } from "../pipeline/types";
import { createQueue, type JobName } from "../queue";
import {
  createPipelineRun,
  createStepRun,
  type NewPipelineRun,
  type NewStepRun,
  updatePipelineRun,
  updateStepRun,
} from "./pipeline-tracking";

/** 摘要流水线的名称与版本 */
const DIGEST_PIPELINE_NAME = "digest-generation";
const DIGEST_PIPELINE_VERSION = "v1";

type EnqueueJob = (jobName: JobName, data: Record<string, unknown>) => Promise<void>;

/** 摘要任务的基础数据结构 */
type DigestPipelineJobData = {
  /** 流水线运行 ID，用于跨 Job 追踪 */
  pipelineRunId?: string;
  /** 触发源 */
  trigger: string;
};

/** 依赖项接口 */
type DigestPipelineRuntimeDeps = {
  createPipelineRun?: (data: NewPipelineRun) => Promise<{ id: string }>;
  createStepRun?: (data: NewStepRun) => Promise<{ id: string }>;
  enqueueJob?: EnqueueJob;
  now?: () => Date;
  updatePipelineRun?: (id: string, data: Partial<Omit<NewPipelineRun, "id">>) => Promise<void>;
  updateStepRun?: (id: string, data: Partial<Omit<NewStepRun, "id">>) => Promise<void>;
};

/** 执行选项，包含 digestId 的解析函数 */
type ExecuteDigestPipelineStepOptions<
  TJobData extends DigestPipelineJobData,
  TPayload extends Record<string, unknown>,
> = {
  deps?: DigestPipelineRuntimeDeps;
  jobData: TJobData;
  jobName: JobName;
  /** 从执行结果或数据中提取 digestId，用于关联记录 */
  resolveDigestId?: (result: PipelineStepResult<TPayload> & { jobData: TJobData }) => string | null;
  runStep: (jobData: TJobData) => Promise<PipelineStepResult<TPayload>>;
};

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

async function defaultEnqueueJob(jobName: JobName, data: Record<string, unknown>): Promise<void> {
  const queue = createQueue<Record<string, unknown>>();
  await queue.add(jobName, data);
}

function buildRuntimeDeps(overrides: DigestPipelineRuntimeDeps = {}): Required<DigestPipelineRuntimeDeps> {
  return {
    createPipelineRun: overrides.createPipelineRun ?? createPipelineRun,
    createStepRun: overrides.createStepRun ?? createStepRun,
    enqueueJob: overrides.enqueueJob ?? defaultEnqueueJob,
    now: overrides.now ?? (() => new Date()),
    updatePipelineRun: overrides.updatePipelineRun ?? updatePipelineRun,
    updateStepRun: overrides.updateStepRun ?? updateStepRun,
  };
}

function withPipelineRunId<TData extends Record<string, unknown>>(data: TData, pipelineRunId: string): TData {
  return {
    ...data,
    pipelineRunId,
  };
}

/** 辅助函数：构建包含 digestId 的更新对象 */
function buildPipelineUpdate(
  digestId: string | null,
  data: Partial<Omit<NewPipelineRun, "id">>,
): Partial<Omit<NewPipelineRun, "id">> {
  if (!digestId) {
    return data;
  }

  return {
    ...data,
    digestId,
  };
}

/**
 * 执行摘要流水线步骤的核心函数
 * 逻辑流：
 * 1. 初始化或更新 PipelineRun。
 * 2. 记录 StepRun。
 * 3. 执行业务步骤并尝试解析 digestId。
 * 4. 如果有下一步则入队。
 * 5. 更新运行记录的最终状态，并关联产生的 digestId。
 */
export async function executeDigestPipelineStep<
  TJobData extends DigestPipelineJobData,
  TPayload extends Record<string, unknown>,
>(options: ExecuteDigestPipelineStepOptions<TJobData, TPayload>): Promise<PipelineStepExecutionResult<TPayload>> {
  const { jobData, jobName, runStep } = options;
  const deps = buildRuntimeDeps(options.deps);
  const startedAt = deps.now();

  let pipelineRunId = jobData.pipelineRunId;

  // 1. 管理 PipelineRun 记录
  if (!pipelineRunId) {
    const pipelineRun = await deps.createPipelineRun({
      pipelineName: DIGEST_PIPELINE_NAME,
      pipelineVersion: DIGEST_PIPELINE_VERSION,
      startedAt,
      status: "running",
    });

    pipelineRunId = pipelineRun.id;
  } else {
    await deps.updatePipelineRun(pipelineRunId, {
      status: "running",
    });
  }

  // 2. 记录步骤开始
  const stepRun = await deps.createStepRun({
    inputRef: serialize(jobData),
    pipelineRunId,
    startedAt,
    status: "running",
    stepName: jobName,
  });

  try {
    // 3. 执行业务步骤
    const result = await runStep(jobData);
    // 摘要流程中，通常在 compose 之后才有 digestId，解析它并关联到流水线
    const digestId = options.resolveDigestId?.({ ...result, jobData }) ?? null;

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

    // 4. 处理失败
    if (result.status === "failed") {
      const finishedAt = deps.now();

      await deps.updateStepRun(stepRun.id, {
        errorMessage: result.message ?? "Unknown step failure.",
        finishedAt,
        outputRef,
        status: "failed",
      });
      await deps.updatePipelineRun(
        pipelineRunId,
        buildPipelineUpdate(digestId, {
          finishedAt,
          status: "failed",
        }),
      );

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

    // 5. 处理下一步入队
    let nextStepQueued = false;

    if (result.nextStep) {
      await deps.enqueueJob(result.nextStep.jobName, withPipelineRunId(result.nextStep.data, pipelineRunId));
      nextStepQueued = true;
    }

    const finishedAt = deps.now();

    // 6. 更新步骤记录
    await deps.updateStepRun(stepRun.id, {
      errorMessage: null,
      finishedAt,
      outputRef,
      status: "completed",
    });

    // 7. 更新流水线运行记录，确保关联了 digestId
    if (result.nextStep) {
      await deps.updatePipelineRun(
        pipelineRunId,
        buildPipelineUpdate(digestId, {
          status: "running",
        }),
      );
    } else {
      await deps.updatePipelineRun(
        pipelineRunId,
        buildPipelineUpdate(digestId, {
          finishedAt,
          status: "completed",
        }),
      );
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
    // 8. 异常捕获与记录
    const finishedAt = deps.now();
    const errorMessage = error instanceof Error && error.message ? error.message : "Unknown pipeline runtime error.";

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

export type { DigestPipelineJobData, DigestPipelineRuntimeDeps };
export { DIGEST_PIPELINE_NAME, DIGEST_PIPELINE_VERSION };
