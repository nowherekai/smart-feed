/**
 * 流水线类型定义模块
 * 定义流水线各个步骤的输入、输出、状态以及链式触发的结构。
 */

import type { JobName } from "../queue";

/** 步骤执行的详细结果：完成、带降级的完成、失败 */
export type PipelineStepOutcome = "completed" | "completed_with_fallback" | "failed";

/** 步骤运行的最终状态 */
export type PipelineStepStatus = "completed" | "failed";

/** 定义流水线的下一个步骤 */
export type PipelineNextStep<TData extends Record<string, unknown> = Record<string, unknown>> = {
  /** 传递给下一步的数据 */
  data: TData;
  /** 下一步的任务名称 */
  jobName: JobName;
};

/**
 * 流水线单步执行结果
 */
export type PipelineStepResult<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TNextData extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** 结果消息（用于日志和审计） */
  message?: string | null;
  /** 下一步定义（若为 null 则表示流水线在此结束） */
  nextStep?: PipelineNextStep<TNextData> | null;
  /** 执行详细结果 */
  outcome: PipelineStepOutcome;
  /** 当前步骤产出的业务载荷 */
  payload?: TPayload;
  /** 最终状态 */
  status: PipelineStepStatus;
};

/**
 * 流水线执行汇总结果
 * 包含流水线运行 ID 和是否成功入队下一步等运行信息。
 */
export type PipelineStepExecutionResult<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  jobName: JobName;
  message?: string | null;
  nextStepQueued: boolean;
  outcome: PipelineStepOutcome;
  payload?: TPayload;
  pipelineRunId: string;
  status: PipelineStepStatus;
};

/**
 * 内容处理流水线的通用任务数据结构
 */
export type ContentPipelineJobData = {
  /** 关联的内容 ID */
  contentId: string;
  /** 关联的流水线运行记录 ID */
  pipelineRunId?: string;
  /** 触发原因 (如 scheduler, manual) */
  trigger: string;
};

/**
 * 创建成功的步骤结果对象
 */
export function createCompletedStepResult<
  TPayload extends Record<string, unknown>,
  TNextData extends Record<string, unknown> = Record<string, unknown>,
>(input: {
  message?: string | null;
  nextStep?: PipelineNextStep<TNextData> | null;
  outcome?: Extract<PipelineStepOutcome, "completed" | "completed_with_fallback">;
  payload?: TPayload;
}): PipelineStepResult<TPayload, TNextData> {
  return {
    message: input.message ?? null,
    nextStep: input.nextStep ?? null,
    outcome: input.outcome ?? "completed",
    payload: input.payload,
    status: "completed",
  };
}

/**
 * 创建失败的步骤结果对象
 */
export function createFailedStepResult<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TNextData extends Record<string, unknown> = Record<string, unknown>,
>(input: { message: string; payload?: TPayload }): PipelineStepResult<TPayload, TNextData> {
  return {
    message: input.message,
    nextStep: null,
    outcome: "failed",
    payload: input.payload,
    status: "failed",
  };
}
