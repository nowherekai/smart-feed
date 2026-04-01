/**
 * 定时任务定义模块
 * 负责定义并注册系统中的周期性任务（Repeatable Jobs），如每小时的源同步和每日的摘要生成。
 */

import type { JobsOptions, RepeatOptions } from "bullmq";

import { type AppEnv, getAppEnv } from "../config";
import type { SchedulerSourcesSyncJobData } from "../pipeline/handlers/scheduler-sources-sync";
import { type QueueName, type QueueRegistry, queueNames, smartFeedTaskNames } from "../queue";
import type { DigestComposeJobData } from "../services/digest";

/** 调度任务模板类型 */
type SchedulerJobTemplate<TData extends Record<string, unknown>> = {
  data: TData;
  name: string;
  opts?: JobsOptions;
};

/** 调度任务定义类型 */
type SchedulerJobDefinition<TData extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  queueName: QueueName;
  repeat: RepeatOptions;
  template: SchedulerJobTemplate<TData>;
};

/** 调度所需的配置子集 */
type SchedulerAppEnv = Pick<AppEnv, "digestSendHour" | "digestTimeZone" | "timeZone">;

/** 系统内置的调度任务 ID */
export const schedulerJobIds = {
  /** 每日摘要编排 */
  digestComposeDaily: "scheduler.digest.compose.daily",
  /** 每小时来源同步 */
  sourcesSyncHourly: "scheduler.sources.sync.hourly",
} as const;

/**
 * 构建每小时来源同步任务的定义
 * 触发频率: 每小时整点
 */
function buildHourlySourcesSyncJob(appEnv: SchedulerAppEnv): SchedulerJobDefinition<SchedulerSourcesSyncJobData> {
  return {
    id: schedulerJobIds.sourcesSyncHourly,
    queueName: queueNames.sourceDispatch,
    repeat: {
      pattern: "0 * * * *",
      tz: appEnv.timeZone,
    },
    template: {
      data: {
        trigger: "scheduler",
      },
      name: smartFeedTaskNames.schedulerSourcesSync,
    },
  };
}

/**
 * 构建每日摘要编排任务的定义
 * 触发频率: 每日配置的发送小时
 */
function buildDailyDigestComposeJob(appEnv: SchedulerAppEnv): SchedulerJobDefinition<DigestComposeJobData> {
  return {
    id: schedulerJobIds.digestComposeDaily,
    queueName: queueNames.digest,
    repeat: {
      pattern: `0 ${appEnv.digestSendHour} * * *`,
      tz: appEnv.digestTimeZone,
    },
    template: {
      data: {
        trigger: "scheduler",
      },
      name: smartFeedTaskNames.digestCompose,
    },
  };
}

/**
 * 获取所有调度任务定义列表
 */
export function buildSchedulerJobDefinitions(appEnv: SchedulerAppEnv): SchedulerJobDefinition[] {
  return [buildHourlySourcesSyncJob(appEnv), buildDailyDigestComposeJob(appEnv)];
}

/**
 * 在 BullMQ 中注册所有定时调度任务
 * 使用 upsertJobScheduler 确保任务存在且配置最新
 */
export async function registerSchedulerJobs(
  registry: QueueRegistry,
  appEnv: SchedulerAppEnv = getAppEnv(),
): Promise<void> {
  for (const definition of buildSchedulerJobDefinitions(appEnv)) {
    await registry[definition.queueName].upsertJobScheduler(definition.id, definition.repeat, definition.template);
  }
}

/**
 * 移除所有已注册的调度任务（用于清理或优雅停机）
 */
export async function removeSchedulerJobs(registry: QueueRegistry): Promise<void> {
  const definitions = buildSchedulerJobDefinitions(getAppEnv());

  await Promise.all(
    definitions.map((definition) => registry[definition.queueName].removeJobScheduler(definition.id)),
  );
}
