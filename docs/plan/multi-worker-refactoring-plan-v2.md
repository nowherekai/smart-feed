# smart-feed 多 Worker / 多队列重构方案 v2

**日期**: 2026-04-01
**状态**: 提案 (Proposal)

---

## 0. 术语约定

为避免与 BullMQ 的 `Job` 概念混淆，本文使用以下术语：

| 术语 | 含义 |
|------|------|
| **BullMQ Job** | BullMQ 框架中在队列里流转的任务对象（`job.name`, `job.data` 等） |
| **任务类型 (Task Type)** | BullMQ Job 的 `name` 字段，如 `"source.fetch"`，在代码中用常量 `smartFeedTaskNames.*` 表示 |
| **处理器 (Handler/Processor)** | TypeScript 函数，处理特定任务类型的 BullMQ Job |
| **Worker** | BullMQ `Worker` 实例，监听某个队列并分发给对应处理器 |

---

## 1. 重构背景与目标

当前系统使用单一队列 `"smart-feed"` + 单一 Worker（`concurrency: 4`）处理全部 9 种任务类型。随着订阅源增加和 AI 处理链路增长，面临以下技术瓶颈：

- **队头阻塞 (HOLB)**: 海量 RSS 同步任务会占满并发槽，准时性要求高的摘要生成任务无法按时触发。
- **AI 限流失控**: 单队列下 AI 任务最多同时运行 4 个，既可能引发 RPM 429，又缺乏降速机制。
- **任务重叠**: 缺乏针对 Source 级别的精准同步控制（SQL 层面无去重过滤）。

**重构目标**: 按照职能将任务分配至 5 个独立队列，各自配置最优的 Worker 并发与调度策略。

---

## 2. 架构设计：五级职能队列

### 2.1 队列与任务类型映射

```
source-dispatch-queue ─── scheduler.sources.sync

ingestion-queue       ─── source.fetch

content-queue         ─── content.fetch-html
                      ─── content.normalize

ai-queue              ─── content.analyze.basic
                      ─── content.analyze.heavy

digest-queue          ─── digest.compose
                      ─── digest.deliver
```

> `source.import`（OPML/手动导入，从前端发起）暂不归入以上 5 个职能队列。
> 本次先保留现有兼容消费路径，避免阻塞当前导入功能；
> 后续在前端导入链路重构阶段，再补独立 import queue / worker / 入队路由，并删除兼容代码。

### 2.2 各队列职能与参数

| 队列 | 职能 | Worker 并发 | 说明 |
|------|------|-------------|------|
| `source-dispatch-queue` | 每小时扫描 DB，扇出 `source.fetch` 任务 | 1 | 纯调度，禁止并发以防重复下发 |
| `ingestion-queue` | 单个 source 的 RSS 抓取 + 解析 + 入库 | 2 | I/O 为主，初始保守，后续可调 |
| `content-queue` | HTML 抓取 + 正文提取转换 | 5 | 网络 I/O，并发受目标站点限制 |
| `ai-queue` | AI 分析（基础评分 + 深度摘要） | 1 | 严格串行，防止触发 RPM 限制 |
| `digest-queue` | 摘要编排 + 邮件投递 | 1 | 串行确保幂等，准时性最高 |

**两队列职责对比（`source-dispatch-queue` vs `ingestion-queue`）**：

| | `source-dispatch-queue` | `ingestion-queue` |
|---|---|---|
| 角色 | 调度员：扫描 DB → 下发工作 | 执行员：抓取 → 解析 → 写 DB |
| 外部依赖 | 仅数据库 | 数据库 + 网络 I/O |
| 失败影响面 | 整批 source 本轮未被调度 | 仅影响单个 source |
| 并发设计 | 1（同时只有一个调度员） | 2+（多 source 并行抓取） |

### 2.3 定时调度（Repeatable Jobs）

定时触发直接通过 BullMQ 的 `upsertJobScheduler` 在对应队列上注册，Worker 在各自队列上自然消费：

| 调度 ID | 触发频率 | 目标队列 | 触发任务类型 |
|---------|---------|---------|------------|
| `scheduler.sources.sync.hourly` | 每小时整点 | `source-dispatch-queue` | `scheduler.sources.sync` |
| `scheduler.digest.compose.daily` | 每日配置时间 | `digest-queue` | `digest.compose` |

---

## 3. 核心处理流程

```
[source-dispatch-queue]
scheduler.sources.sync（每小时触发，concurrency: 1）
  │  SQL 预过滤：WHERE status='active'
  │              AND (
  │                last_successful_sync_at IS NULL
  │                OR last_successful_sync_at < NOW() - INTERVAL '1h'
  │              )
  │  扇出：为每个符合条件的 source 入队一个 source.fetch（jobId 去重）
  ▼
[ingestion-queue]
source.fetch（concurrency: 2）──────────────────────►  DB 写入（哨兵记录 + RSS 摘要）
  │ 若有新内容且在时间窗口内
  ▼
[content-queue]
content.fetch-html ──► content.normalize（concurrency: 5）
  │ 完成后（或抓取失败自动回退至 RSS 摘要）
  ▼
[ai-queue]
content.analyze.basic（基础评分，concurrency: 1）
  │ score >= threshold（可配置，默认 6）
  ▼
content.analyze.heavy（深度摘要）── DB: content.status = "analyzed"

[digest-queue]
digest.compose（每日触发，扫描 analyzed 内容编排简报，concurrency: 1）
  │
  ▼
digest.deliver（邮件投递）
```

---

## 4. 实施路线图

### Phase 1：Queue 基础设施重构（`src/queue/`）

**1.1 修改 `src/queue/config.ts`**

- 主链路不再使用 `queueName`（单队列常量）、`workerConcurrency`（单值常量）
- 将项目内任务常量从 `jobNames` 重命名为 `smartFeedTaskNames`
- 将项目内任务类型从 `JobName` 重命名为 `SmartFeedTaskName`
- 新增 `queueNames` 对象（5 个队列名称）
- 新增 `taskToQueueMap`：将所有任务类型映射到对应队列（`source.import` 不在其中）
- 新增 `workerConcurrencyMap`：每队列对应的并发数
- 保留 `defaultJobOptions`、`buildSourceFetchDeduplicationId` 不变
- 若 `source.import` 兼容链路仍需单队列常量，则改名为 legacy import 专用配置，避免与主链路混用

```typescript
// src/queue/config.ts

export const queueNames = {
  sourceDispatch: "source-dispatch-queue",
  ingestion:      "ingestion-queue",
  content:        "content-queue",
  ai:             "ai-queue",
  digest:         "digest-queue",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

/** 项目内任务名称映射表 */
export const smartFeedTaskNames = {
  schedulerSourcesSync: "scheduler.sources.sync",
  sourceImport: "source.import",
  sourceFetch: "source.fetch",
  contentFetchHtml: "content.fetch-html",
  contentNormalize: "content.normalize",
  contentAnalyzeBasic: "content.analyze.basic",
  contentAnalyzeHeavy: "content.analyze.heavy",
  digestCompose: "digest.compose",
  digestDeliver: "digest.deliver",
} as const;

export type SmartFeedTaskName = (typeof smartFeedTaskNames)[keyof typeof smartFeedTaskNames];

/** 任务类型 → 目标队列的完整映射 */
export const taskToQueueMap: Record<
  Exclude<SmartFeedTaskName, "source.import">, // source.import 走独立 Worker，不在此映射
  QueueName
> = {
  "scheduler.sources.sync": queueNames.sourceDispatch,
  "source.fetch":           queueNames.ingestion,
  "content.fetch-html":     queueNames.content,
  "content.normalize":      queueNames.content,
  "content.analyze.basic":  queueNames.ai,
  "content.analyze.heavy":  queueNames.ai,
  "digest.compose":         queueNames.digest,
  "digest.deliver":         queueNames.digest,
};

/** 各队列初始并发数（保守值，后续根据监控调整） */
export const workerConcurrencyMap: Record<QueueName, number> = {
  [queueNames.sourceDispatch]: 1,
  [queueNames.ingestion]:      2,
  [queueNames.content]:        5,
  [queueNames.ai]:             1,
  [queueNames.digest]:         1,
};
```

**1.2 修改 `src/queue/connection.ts`**

- 新增 `QueueRegistry` 类型
- 新增 `getQueueRegistry()`：懒加载单例，持有全部 5 个 Queue 实例（共享同一 Redis 连接）
- 新增 `getQueueForTask(jobName)`：根据 `taskToQueueMap` 返回对应 Queue 实例
- 修改 `createWorker(queueName, processor, options?)`：接受队列名称和可选覆盖参数
- 新增 `closeAllQueues()`：关闭全部 5 个 Queue 实例
- 保留 `getRedisConnection()`、`closeRedisConnection()` 不变
- 非 `source.import` 主链路不再直接依赖旧的单队列 `createQueue()`
- `source.import` 兼容链路保留 legacy queue helper，待后续前端导入重构后再删除

```typescript
// src/queue/connection.ts（核心变更示意）

export type QueueRegistry = {
  [K in QueueName]: Queue<Record<string, unknown>, unknown, string>;
};

let queueRegistry: QueueRegistry | null = null;

export function getQueueRegistry(): QueueRegistry {
  if (queueRegistry) return queueRegistry;
  const conn = getRedisConnection();
  queueRegistry = Object.fromEntries(
    Object.values(queueNames).map((name) => [
      name,
      new Queue(name, { connection: conn, defaultJobOptions }),
    ]),
  ) as QueueRegistry;
  return queueRegistry;
}

export function getQueueForTask(
  taskName: Exclude<SmartFeedTaskName, "source.import">,
): Queue<Record<string, unknown>, unknown, string> {
  const targetQueueName = taskToQueueMap[taskName];
  return getQueueRegistry()[targetQueueName];
}

export function createWorker<TData, TResult, TName extends string>(
  queueName: QueueName,
  processor: Processor<TData, TResult, TName>,
  options?: Partial<WorkerOptions>,
) {
  return new Worker<TData, TResult, TName>(queueName, processor, {
    connection: getRedisConnection(),
    concurrency: workerConcurrencyMap[queueName],
    ...options,
  });
}

export async function closeAllQueues() {
  if (!queueRegistry) return;
  await Promise.all(Object.values(queueRegistry).map((q) => q.close()));
  queueRegistry = null;
}
```

> 注：上面的核心代码仅描述 5 个职能队列。
> 为控制本次范围，`source.import` 仍保留 legacy queue 兼容层；该兼容层不属于本次多队列目标模型，待后续 TODO 完成后再清理。

---

### Phase 2：所有生产者的跨队列入队重构（`src/services/` + `src/pipeline/handlers/`）

这是本次改动量最大的部分。除了两个 pipeline runtime，还要补齐所有直接 `queue.add(...)` 的生产路径，避免单队列残留。

**2.1 修改 `src/services/pipeline-runtime.ts` 与 `src/services/digest-pipeline-runtime.ts`**

两个文件中的 `defaultEnqueueJob` 实现从调用 `createQueue()` 改为调用 `getQueueForTask(taskName)`。同时将项目内类型命名从 `JobName` 统一改为 `SmartFeedTaskName`。`EnqueueJob` 类型签名语义**不变**，测试中注入自定义 `enqueueJob` 的测试用例**无需改动**。

```typescript
// 修改前（pipeline-runtime.ts 和 digest-pipeline-runtime.ts 均相同）
async function defaultEnqueueJob(taskName: SmartFeedTaskName, data: Record<string, unknown>): Promise<void> {
  const queue = createQueue<Record<string, unknown>>();
  await queue.add(taskName, data);
}

// 修改后
async function defaultEnqueueJob(taskName: SmartFeedTaskName, data: Record<string, unknown>): Promise<void> {
  const queue = getQueueForTask(taskName); // 根据 taskToQueueMap 路由到正确队列
  await queue.add(taskName, data);
}
```

同时，两个文件顶部的 import 从 `createQueue` 改为 `getQueueForTask`：

```typescript
// 修改前
import { createQueue, type SmartFeedTaskName } from "../queue";

// 修改后
import { getQueueForTask, type SmartFeedTaskName } from "../queue";
```

**2.2 修改 `src/pipeline/handlers/scheduler-sources-sync.ts`**

- 处理器注入依赖从“通用 `createQueue`”收敛为“`source.fetch` 专用入队队列”
- 默认实现改为 `getQueueForTask(smartFeedTaskNames.sourceFetch)`
- 处理器本身不直接拼接单队列实例，避免后续继续误入 `smart-feed`

**2.3 修改 `src/services/content.ts`**

- `enqueueContentFetchHtml()` 从 `createQueue()` 改为 `getQueueForTask(smartFeedTaskNames.contentFetchHtml)`
- 该函数是 `source.fetch -> content.fetch-html` 的真实生产者，必须和 runtime 一起迁移

**2.4 修改 `src/services/source-import.ts`**

- 当前 `source.import` 暂不做队列拆分，但其内部首次抓取生产者 `enqueueSourceFetch()` 仍要显式说明兼容策略
- 若本轮先保留 `source.import` 兼容链路，则此处继续使用 legacy helper 或专门的兼容封装，不与 5 个职能队列迁移步骤混写
- 后续前端导入重构完成后，再把这里切到新的 import / ingestion 路由并删除兼容逻辑

---

### Phase 3：Scheduler 多队列适配（`src/scheduler/`）

调度器当前通过 `startScheduler` 只持有一个 Queue 实例。两个 Repeatable Job 分别归属不同队列，需要重构为多队列持有。

**3.1 修改 `src/scheduler/jobs.ts`**

`registerSchedulerJobs` 和 `removeSchedulerJobs` 从接收单一 `queue` 参数改为接收 `QueueRegistry`：

```typescript
// 修改后：各 Repeatable Job 路由到各自所属队列
export async function registerSchedulerJobs(
  registry: QueueRegistry,
  appEnv: SchedulerAppEnv,
): Promise<void> {
  // 每小时源同步 → source-dispatch-queue
  await registry[queueNames.sourceDispatch].upsertJobScheduler(
    schedulerJobIds.sourcesSyncHourly,
    { pattern: "0 * * * *", tz: appEnv.timeZone },
    { name: smartFeedTaskNames.schedulerSourcesSync, data: { trigger: "scheduler" } },
  );

  // 每日摘要 → digest-queue
  await registry[queueNames.digest].upsertJobScheduler(
    schedulerJobIds.digestComposeDaily,
    { pattern: `0 ${appEnv.digestSendHour} * * *`, tz: appEnv.digestTimeZone },
    { name: smartFeedTaskNames.digestCompose, data: { trigger: "scheduler" } },
  );
}

export async function removeSchedulerJobs(registry: QueueRegistry): Promise<void> {
  await registry[queueNames.sourceDispatch].removeJobScheduler(schedulerJobIds.sourcesSyncHourly);
  await registry[queueNames.digest].removeJobScheduler(schedulerJobIds.digestComposeDaily);
}
```

**3.2 修改 `src/scheduler/index.ts`**

- `SchedulerDeps.createQueue` 改为 `SchedulerDeps.getQueueRegistry`
- `schedulerQueue` 改为 `schedulerRegistry`，持有 `QueueRegistry`
- `stopScheduler` 中的 `closeQueue()` 改为 `closeAllQueues()`（关闭全部队列）

---

### Phase 4：Worker 实例隔离（`src/workers/`）

**4.1 修改 `src/workers/index.ts`**

启动 5 个职能 Worker，各自监听不同队列，只处理属于该队列的任务类型。
`source.import` 不纳入这 5 个 Worker 的职责拆分，本次继续保留现有兼容消费路径，待后续前端导入重构时再拆出独立 import worker。

```typescript
// 各队列对应的任务类型集合
const sourceDispatchTaskNames = new Set<SmartFeedTaskName>([smartFeedTaskNames.schedulerSourcesSync]);
const ingestionTaskNames      = new Set<SmartFeedTaskName>([smartFeedTaskNames.sourceFetch]);
const contentTaskNames        = new Set<SmartFeedTaskName>([
  smartFeedTaskNames.contentFetchHtml,
  smartFeedTaskNames.contentNormalize,
]);
const aiTaskNames             = new Set<SmartFeedTaskName>([
  smartFeedTaskNames.contentAnalyzeBasic,
  smartFeedTaskNames.contentAnalyzeHeavy,
]);
const digestTaskNames         = new Set<SmartFeedTaskName>([
  smartFeedTaskNames.digestCompose,
  smartFeedTaskNames.digestDeliver,
]);

// 安全路由：若任务类型不属于当前 Worker 管辖，则抛出明确错误
function makeProcessor(allowedNames: Set<SmartFeedTaskName>) {
  return async (
    job: Job<PipelineJobData, PipelineJobResult, SmartFeedTaskName>,
  ): Promise<PipelineJobResult> => {
    if (!allowedNames.has(job.name as SmartFeedTaskName)) {
      throw new Error(`[worker] Task "${job.name}" is not handled by this worker.`);
    }
    const handler = getHandler(job.name);
    return handler(job);
  };
}

export async function startWorkerApp(deps: WorkerAppDeps = {}): Promise<WorkerApp> {
  const workers = [
    createWorker(queueNames.sourceDispatch, makeProcessor(sourceDispatchTaskNames)),
    createWorker(queueNames.ingestion,      makeProcessor(ingestionTaskNames)),
    createWorker(queueNames.content,        makeProcessor(contentTaskNames)),
    createWorker(queueNames.ai,             makeProcessor(aiTaskNames)),
    createWorker(queueNames.digest,         makeProcessor(digestTaskNames)),
  ];

  await startScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`[worker] Received ${signal}, shutting down...`);
    await Promise.all(workers.map((w) => w.close()));
    await stopScheduler();
    await closeRedisConnection();
    exit(0);
  };

  // ...SIGINT/SIGTERM 监听
}
```

**4.2 `WorkerAppDeps` 接口更新**

`createWorker` 注入类型从单一工厂调整为接受队列名称的工厂：

```typescript
type WorkerFactory = (
  queueName: QueueName,
  processor: Processor<...>,
) => AppWorker;
```

---

### Phase 5：调度预过滤修复（`src/services/source.ts` + `src/pipeline/handlers/scheduler-sources-sync.ts`）

当前 `lastPolledAt` 在抓取开始前就会被更新，因此**不能**直接作为“1 小时内是否允许再次调度”的唯一依据。
本次修复方案改为：

- `lastPolledAt` 继续保留，语义明确为“最近一次尝试开始时间”，仅用于观测和排障
- 调度层 SQL 预过滤改为基于 `lastSuccessfulSyncAt`
- 失败任务不因一次失败而额外跳过下一轮小时调度
- `scheduler-sources-sync` 处理器不再直接写 SQL 条件，而是调用 `src/services/source.ts` 中新的“待同步 source 查询”函数

建议将 `listActiveSourceIds()` 拆分为：

- `listActiveSourceIds()`：保留原始语义，供其他调用方继续使用
- `listSourceIdsDueForSync()`：专供 `scheduler.sources.sync` 使用，封装调度 SQL

```typescript
// src/services/source.ts

// 修改前：查所有 active sources
const sources = await db.query.sources.findMany({
  where: eq(sources.status, "active"),
});

// 修改后：只过滤 1 小时内“成功同步过”的源
const sources = await db.query.sources.findMany({
  where: and(
    eq(sources.status, "active"),
    or(
      isNull(sources.lastSuccessfulSyncAt),
      lt(sources.lastSuccessfulSyncAt, sql`NOW() - INTERVAL '1 hour'`),
    ),
  ),
});
```

这样做的结果是：

- 成功或 304 同步过的 source，1 小时内不会被重复调度
- 刚开始抓取就失败的 source，不会因为 `lastPolledAt` 被额外延后一轮
- 现有 `buildSourceFetchDeduplicationId` 仍保留，继续负责“同一时刻不要并发跑两个相同 source.fetch”

因此这里与 BullMQ 的去重是双重保险：
- SQL 过滤在调度层减少不必要的 BullMQ Job 创建
- BullMQ 去重防止短时间内同一 sourceId 出现重复 Job

---

### Phase 6：bull-board 多队列接入

bull-board 尚未在当前代码库中实现。在前 5 个 Phase 全部完成后添加：

- 位置：在 Next.js 的 API Route 或独立 Express 路由中挂载
- 注册全部 5 个 Queue 实例（从 `getQueueRegistry()` 获取）
- 按 spec 要求通过 `/bull-board` 路径访问

```typescript
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

const serverAdapter = new ExpressAdapter();
const registry = getQueueRegistry();

createBullBoard({
  queues: Object.values(registry).map((q) => new BullMQAdapter(q)),
  serverAdapter,
});
```

---

## 5. 受影响文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/queue/config.ts` | 修改 | 新增 `queueNames`（5 个）、`smartFeedTaskNames`、`SmartFeedTaskName`、`taskToQueueMap`、`workerConcurrencyMap`；主链路移除 `queueName`、`workerConcurrency`，如需兼容 `source.import` 则改为 legacy import 专用配置 |
| `src/queue/connection.ts` | 修改 | 新增 `QueueRegistry`、`getQueueRegistry`、`getQueueForTask`，重写 `createWorker`，新增 `closeAllQueues` |
| `src/queue/index.ts` | 修改 | 更新导出列表 |
| `src/services/pipeline-runtime.ts` | 修改 | `defaultEnqueueJob` 改用 `getQueueForTask` |
| `src/services/digest-pipeline-runtime.ts` | 修改 | 同上 |
| `src/services/content.ts` | 修改 | `enqueueContentFetchHtml()` 改为显式路由到 `content-queue` |
| `src/services/source-import.ts` | 修改 | 补充 `source.import -> source.fetch` 的兼容策略说明，避免与主链路迁移混淆 |
| `src/services/source.ts` | 修改 | 新增“待同步 source 查询”函数，封装基于 `lastSuccessfulSyncAt` 的 SQL 预过滤 |
| `src/scheduler/jobs.ts` | 修改 | `registerSchedulerJobs` / `removeSchedulerJobs` 接收 `QueueRegistry`，各 Repeatable Job 注册到对应队列 |
| `src/scheduler/index.ts` | 修改 | `startScheduler` / `stopScheduler` 适配多队列 |
| `src/workers/index.ts` | 修改 | 启动 5 个 Worker，各自绑定对应队列和任务类型集合 |
| `src/pipeline/handlers/scheduler-sources-sync.ts` | 修改 | 改为调用“待同步 source 查询”服务，并切换到新的 source.fetch 入队方式 |
| `src/scheduler/jobs.test.ts` | 修改 | 调整为断言两个 scheduler 被注册到各自队列 |
| `src/scheduler/index.test.ts` | 修改 | 调整为多队列 registry 生命周期测试 |
| `src/workers/index.test.ts` | 修改 | 调整为多 Worker 启停顺序测试 |
| `src/pipeline/handlers/scheduler-sources-sync.test.ts` | 修改 | 调整注入依赖与“待同步 source”查询语义 |
| `src/smoke.test.ts` | 修改 | 单队列导出断言需要改成多队列配置断言 |

---

## 6. 不在本次范围内

| 项目 | 原因 |
|------|------|
| 迁移策略 | 系统仍在开发阶段，本地无在途数据，直接切换即可 |
| 跨队列 chaining 失败处理 | 后续通过前端展示给用户决定是否重试 |
| AI 限流降速（`limiter`） | Phase 4 先以 `concurrency: 1` 替代，后续按需加 `limiter` 配置 |
| `source.import` 正式拆分 | 当前先保留兼容消费路径，后续在前端导入链路重构阶段，一并完成独立 import queue / worker / 入队路由 |

### TODO：前端导入链路阶段再做

1. 为 `source.import` 设计专属队列和独立 Worker，不再复用当前兼容路径。
2. 将前端导入入口改为投递到新的 import queue，而不是依赖现有 legacy 队列链路。
3. 在 import 新链路稳定后，删除遗留的单队列 helper、兼容 consumer 与相关测试分支。

---

## 7. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| **任务丢失**: 跨队列 chaining 时 enqueue 失败 | `PipelineRun` 会停留在中间状态（`status: running`），后续通过 UI 支持手动重试 |
| **Redis 连接数**: 5 个队列 + 5 个 Worker 共用同一 IORedis 实例 | 所有 Queue 和 Worker 共享单一 `getRedisConnection()` 单例，连接数不增加 |
| **乐观锁缺失**: 多 Worker 并发更新同一 content 行 | 当前各 Worker 并发均≤5，数据库连接池足够；如遇冲突，使用 `UPDATE ... WHERE version = ?` 乐观锁而非 `FOR UPDATE`（避免死锁风险） |
| **调度器注册到错误队列**: Repeatable Job 落在无对应 Worker 监听的队列 | Phase 3 完成后通过 bull-board（Phase 6）验证两个 Repeatable Job 已分别出现在 `source-dispatch-queue` 和 `digest-queue` |
