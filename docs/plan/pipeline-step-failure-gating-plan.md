# smart-feed Pipeline 步骤失败阻断与运行治理实施计划

**范围**: 仅后台代码（Worker、Pipeline Handler、服务层、Pipeline Tracking）
**不含**: Next.js 前端页面、API Routes、React 组件、完整 Digest 业务实现
**创建日期**: 2026-03-31
**文档状态**: 已实施（content 链路含 heavy）

---

## 1. 背景与目标

当前项目的后台流水线已经实现了：

- `source.import`
- `source.fetch`
- `content.fetch-html`
- `content.normalize`
- `Task 4` AI 适配层（`disabled | dummy | openrouter`）

但当前流水线控制仍有两个关键问题：

1. **下一步入队逻辑分散在服务层内部**
   - 例如 `runContentFetchHtml()` 内部直接 enqueue `content.normalize`
   - `runContentNormalize()` 内部直接 enqueue `content.analyze.basic`
   - 这导致“是否应该继续下一步”无法统一治理

2. **缺少通用的步骤失败阻断机制**
   - 现在只有局部错误处理
   - AI 未配置只是一个具体例子，本质问题是：**任一步失败后，都应该阻断当前对象的后续步骤**
   - 阻断必须是**局部的**：只影响当前 source/content/digest，不影响其它 source/content/digest

本计划的目标是：**把 pipeline 改造成通用的“单步执行 + 显式结果 + 统一续跑控制 + 可审计 tracking”架构。**

核心结果应当是：

- 任一步骤失败时，不再推进该对象的下一步骤
- 任一步骤成功或“成功降级”时，才允许推进下一步骤
- 单个 source/content/digest 的失败不会影响其它 job
- `pipeline_runs` / `step_runs` 成为统一运行审计来源
- AI disabled / API 调用失败只是统一失败规则的一种具体表现

> 2026-03-31 实施结果：`content.fetch-html`、`content.normalize`、`content.analyze.basic`、`content.analyze.heavy` 均已接入统一 step result + runtime + tracking。`basic` 在高价值内容上继续推进 `heavy`，`heavy` 完成后结束当前 `content-processing` pipeline。

---

## 2. 现状与问题定位

### 2.1 当前 job 链路

当前队列 job 名定义在 `src/queue/config.ts`：

- `source.import`
- `source.fetch`
- `content.fetch-html`
- `content.normalize`
- `content.analyze.basic`
- `content.analyze.heavy`
- `digest.compose`
- `digest.deliver`

### 2.2 当前已存在的 tracking 能力

当前 `src/services/pipeline-tracking.ts` 已有基础 CRUD：

- `createPipelineRun`
- `updatePipelineRun`
- `createStepRun`
- `updateStepRun`

说明数据库和最基础 tracking 服务已经具备，但还没有形成统一执行器。

### 2.3 当前设计缺口

#### 缺口 A: 续跑逻辑散落在服务层

`src/services/content.ts` 当前由服务层内部直接 enqueue 下一步，这会带来：

- 失败治理逻辑无法统一
- fallback 与 hard fail 的语义不清晰
- 将来 `Task 5/6/7` 接入后，链路会继续扩散

#### 缺口 B: handler 没有统一步骤结果协议

目前 handler/service 大多是：

- 成功: 返回摘要对象
- 失败: 抛异常

这种方式不够表达：

- 成功并继续
- 成功但使用 fallback 继续
- 失败并阻断
- 成功但无后续步骤

#### 缺口 C: AI disabled 只存在于 AI client 契约中

`Task 4` 已提供：

- `getAiRuntimeState()`
- `assertAiAvailable()`
- `AiProviderUnavailableError`

但分析 handler 还未消费这套契约，所以“AI 未配置时阻断后续分析链路”还没有真正落到 job 行为。

---

## 3. 设计原则

### 3.1 单个 job 只处理单个对象

继续保持当前粒度：

- `source.fetch` 只处理一个 `sourceId`
- `content.fetch-html` / `content.normalize` / `content.analyze.*` 只处理一个 `contentId`
- `digest.compose` / `digest.deliver` 只处理一个 `digestId`

这样单个 job 的失败天然只影响当前对象，不影响其它对象。

### 3.2 服务层只做当前步骤业务，不负责推进下一步

统一改成：

- **service**: 做当前步骤业务，返回结构化步骤结果
- **handler / pipeline runner**: 记录 tracking，并根据步骤结果决定是否 enqueue 下一步

### 3.3 显式区分 hard fail 与 fallback success

不是所有异常都应该阻断。

例如：

- `content.fetch-html`
  - 页面抓取失败，但 RSS 原始内容可用 -> 允许 fallback，继续 normalize
  - 页面抓取失败，且无任何可用原始内容 -> hard fail，阻断

### 3.4 tracking 是统一审计面，而不是附属日志

每一步都要在 `pipeline_runs` / `step_runs` 中留下：

- 开始时间
- 成功/失败状态
- 输入引用
- 输出引用
- 失败原因

### 3.5 AI 失败不是特例

以下都属于统一失败阻断模型：

- API key 未配置
- AI provider disabled
- OpenRouter 调用失败
- HTML 抓取失败且无 fallback
- Markdown 标准化异常
- Digest 组装失败

---

## 4. 目标架构

### 4.1 新的步骤结果协议

新增统一结果类型，建议放在：

- `src/pipeline/types.ts`
  或
- `src/services/pipeline-runtime.ts`

建议最小协议如下：

```ts
type PipelineStepOutcome = "completed" | "completed_with_fallback" | "failed";

type PipelineStepResult<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  outcome: PipelineStepOutcome;
  status: "completed" | "failed";
  message?: string | null;
  payload?: TPayload;
  nextStep?: {
    jobName: JobName;
    data: Record<string, unknown>;
  } | null;
};
```

语义约定：

- `completed`
  - 当前步成功
  - 若 `nextStep` 存在，则允许入队
- `completed_with_fallback`
  - 当前步有异常，但已降级成功
  - 若 `nextStep` 存在，则允许入队
- `failed`
  - 当前步失败
  - 不允许入队下一步

### 4.2 新的执行边界

新增一个统一执行器，建议文件：

- `src/services/pipeline-runtime.ts`

职责：

1. 创建或更新 `pipeline_run`
2. 创建 `step_run`
3. 执行当前 step handler/service
4. 根据结果更新 `step_run`
5. 当 step 成功时决定是否 enqueue 下一步
6. 若 step 失败，则更新 `pipeline_run = failed`
7. 若无下一步且成功结束，则更新 `pipeline_run = completed`

### 4.3 pipeline_run 粒度约定

建议按业务对象维持以下粒度：

- content 链路：
  - `content-processing`
  - `content_id` 绑定一条 pipeline run
  - 包含：
    - `content.fetch-html`
    - `content.normalize`
    - `content.analyze.basic`
    - `content.analyze.heavy`

- digest 链路：
  - `digest-processing`
  - `digest_id` 绑定一条 pipeline run
  - 包含：
    - `digest.compose`
    - `digest.deliver`

- `source.import` / `source.fetch`
  - 可以先维持当前 job 级独立 run
  - 如需要，可后续扩成 source 维度治理

MVP 不要求一次性把所有 run 贯通成复杂 DAG；重点是先建立**单对象、单链路、单步可阻断**的稳定模型。

---

## 5. 实施范围

## Scope
- In:
  - 新增统一步骤结果协议
  - 新增统一 pipeline runtime / runner
  - 把“下一步 enqueue”从服务层迁移到 handler/runtime
  - 接通 `pipeline_runs` / `step_runs`
  - 实现 `content.analyze.basic` 的最小真实 handler，接通 AI disabled / 配置缺失 / API 失败的通用失败治理
  - 为 `content.fetch-html`、`content.normalize`、`content.analyze.basic` 建立一致的“失败不续跑”机制
  - 补测试与文档
- Out:
  - 完整实现 `content.analyze.heavy`
  - 完整实现 `digest.compose` / `digest.deliver` 业务逻辑
  - 改数据库 schema 或新增 migration
  - 前端展示 pipeline 运行状态

---

## 6. 文件级改造建议

### 6.1 新增

- `src/services/pipeline-runtime.ts`
  - 统一执行器
  - 统一 tracking 写入
  - 统一 next-step enqueue 控制

- `src/pipeline/types.ts`
  - 定义 `PipelineStepResult`
  - 定义 `PipelineStepOutcome`
  - 定义 step handler 统一签名

- `src/pipeline/handlers/content-analyze-basic.ts`
  - 最小真实 handler
  - 调用 `assertAiAvailable()`
  - AI disabled / 配置缺失 / 调用异常 -> 返回 `failed`
  - AI 可用但分析逻辑尚未完全展开时，也要给出清晰的最小实现边界

### 6.2 修改

- `src/services/content.ts`
  - `runContentFetchHtml()` 不再内部 enqueue normalize
  - `runContentNormalize()` 不再内部 enqueue analyze.basic
  - 两个函数改为返回统一 step result
  - 明确 fallback success 与 hard fail

- `src/pipeline/handlers/content-fetch-html.ts`
  - 改为通过 pipeline runtime 执行
  - 仅在 step result 允许时 enqueue `content.normalize`

- `src/pipeline/handlers/content-normalize.ts`
  - 改为通过 pipeline runtime 执行
  - 仅在 step result 允许时 enqueue `content.analyze.basic`

- `src/pipeline/handlers/index.ts`
  - 接入新的真实 `content.analyze.basic`
  - 逐步为后续 handler 使用统一执行器留好接口

- `src/services/pipeline-tracking.ts`
  - 如有必要，补少量查询/辅助方法
  - 但优先保持现有 CRUD，不做无必要扩展

### 6.3 可选修改

- `src/workers/index.ts`
  - 当前 worker 只负责执行 handler，理论上可不动
  - 仅在需要统一 worker 级失败日志格式时再动

---

## 7. 关键行为约定

### 7.1 HTML 抓取步骤

`content.fetch-html` 输出规则：

- 抓取成功：
  - `outcome = completed`
  - `nextStep = content.normalize`

- 抓取失败，但存在 RSS 原始内容可回退：
  - `outcome = completed_with_fallback`
  - 记录 `processingError`
  - `nextStep = content.normalize`

- 抓取失败，且没有任何可用原始内容：
  - `outcome = failed`
  - `content_items.status = failed`
  - 不 enqueue `content.normalize`

### 7.2 标准化步骤

`content.normalize` 输出规则：

- 标准化成功：
  - `outcome = completed`
  - 更新 `cleaned_md`
  - `content_items.status = normalized`
  - `nextStep = content.analyze.basic`

- 标准化失败：
  - `outcome = failed`
  - `content_items.status = failed`
  - 不 enqueue `content.analyze.basic`

### 7.3 基础分析步骤

`content.analyze.basic` 输出规则：

- AI provider disabled：
  - `outcome = failed`
  - 错误原因写入 `processingError` 或 step error
  - 不 enqueue heavy

- OpenRouter 配置缺失：
  - `outcome = failed`
  - 不 enqueue heavy

- OpenRouter API 调用失败：
  - `outcome = failed`
  - 不 enqueue heavy

- 基础分析成功：
  - `outcome = completed`
  - 写入 `analysis_records`（basic 记录）
  - `value_score > threshold` 时 enqueue `content.analyze.heavy`
  - `value_score <= threshold` 时更新 `content_items.status = analyzed` 并结束 pipeline

- 基础分析命中缓存：
  - 仍沿用同一阈值规则决定是否推进 `content.analyze.heavy`

- 深度分析成功：
  - `outcome = completed`
  - 写入 `analysis_records.status = full | rejected`
  - 更新 `content_items.status = analyzed`
  - 不再 enqueue 后续步骤

注意：

- 这里的“成功”不要求一次性完整实现 `Task 5`
- 但至少要把 AI 可用性与统一失败阻断机制接到真实 handler

### 7.4 局部失败隔离

失败隔离依赖三个事实：

1. BullMQ job 本身是单对象执行
2. 当前对象失败时，不再 enqueue 下一步
3. 其它 source/content/digest 的 job 不会共享失败状态

因此不需要额外引入“全局暂停”机制。

---

## 8. 测试与验收

## Action items
[x] 新增 `src/pipeline/types.ts` 或等价模块，定义统一步骤结果协议与类型约束。
[x] 新增 `src/services/pipeline-runtime.ts`，封装 `pipeline_run` / `step_run` 生命周期、错误归一化和下一步入队控制。
[x] 重构 `src/services/content.ts`，移除内部 enqueue，把 `content.fetch-html` / `content.normalize` 改成返回统一步骤结果。
[x] 重构 `src/pipeline/handlers/content-fetch-html.ts` 与 `src/pipeline/handlers/content-normalize.ts`，通过 runtime 执行并在成功时推进下一步。
[x] 新增 `src/pipeline/handlers/content-analyze-basic.ts`，最小接通 AI 适配层和统一失败阻断逻辑。
[x] 修改 `src/pipeline/handlers/index.ts`，用真实 `content.analyze.basic` handler 替换 placeholder。
[x] 为 `pipeline runtime`、`content-fetch-html`、`content-normalize`、`content-analyze-basic` 增加单测，覆盖 success / fallback / failed 三类结果。
[x] 验证“当前 content 失败不推进下一步，但其它 content/source job 不受影响”的行为（通过单对象 job 粒度 + runtime 不续跑保证）。
[ ] 运行 `bun run check`、`bun test`、`bun run build`，确保现有 Task 1-5 不回归。
[x] 更新 `docs/plan/backend-implementation-plan.md` 与新的 change doc，明确失败阻断模型已成为通用规则而非 AI 特例。

---

## 9. 测试场景清单

必须覆盖以下用例：

1. `content.fetch-html`
   - 抓取成功 -> enqueue normalize
   - 抓取失败但可 fallback -> 仍 enqueue normalize
   - 抓取失败且无 fallback -> 不 enqueue normalize

2. `content.normalize`
   - 标准化成功 -> enqueue analyze.basic
   - 标准化失败 -> 不 enqueue analyze.basic

3. `content.analyze.basic`
   - provider 未配置 -> 失败，不 enqueue heavy
   - provider=openrouter 但缺 key -> 失败，不 enqueue heavy
   - provider=dummy -> basic 成功后可推进 heavy，heavy 也按同一失败阻断模型执行

4. tracking
   - step 开始时写入 `step_run`
   - step 成功后更新 `completed`
   - step fallback 成功时仍视为完成，但 message 标明 fallback
   - step 失败时更新 `failed + error_message`

5. 隔离性
   - 一个 content job 失败时，不影响另一个 content job 的执行
   - 一个 source 的抓取失败时，不影响其它 source 的抓取

---

## 10. 风险与注意事项

### 10.1 不要把“失败不续跑”写散

如果只在每个 service 内各自 `if/else + enqueue`，很快又会回到今天的分散状态。必须把“是否推进下一步”的最终决定统一收口到 handler/runtime。

### 10.2 不要把 fallback 误当作失败

例如 HTML 抓取失败但 RSS 正文仍可用，这种情况应该继续走后续步骤，否则会无谓损失可处理内容。

### 10.3 不要把这次改造扩成完整编排框架

本次目标是：

- 统一步骤结果
- 统一失败阻断
- 统一 tracking

不是一次性做复杂 DAG、可视化、人工重试控制台。

### 10.4 不要破坏现有 Task 1-4

尤其要注意：

- RSS 内容入库逻辑
- `raw_body` / `raw_excerpt` 的现有规则
- `content.normalize` 的现有截断与状态流转
- Task 4 的 `disabled | dummy | openrouter` 契约

---

## 11. 推荐实施顺序

建议按下面顺序做，避免返工：

1. 先定义统一步骤结果类型
2. 再实现 pipeline runtime
3. 先改 `content.fetch-html`
4. 再改 `content.normalize`
5. 再接 `content.analyze.basic`
6. 最后把 tracking、单测和文档一起收尾

这样可以先把“失败不续跑”的主干规则打稳，再把 AI 接入到统一规则中。

---

## 12. 下个对话建议提供的上下文

如果下一轮对话要直接实施，请把以下背景一并贴给执行 Agent：

- 读取本文件：`docs/plan/pipeline-step-failure-gating-plan.md`
- 背景计划：`docs/plan/backend-implementation-plan.md`
- 当前约束：
  - 只做后台，不做前端
  - 使用 Bun，不用 npm/pnpm/yarn
  - AI 采用 OpenRouter；`dummy` 必须显式配置才启用
  - provider 未配置时，必须阻断 AI 步骤，但不影响前置步骤
  - 更进一步：通用规则是任一步失败，都不执行下一步，但只影响当前 source/content/digest
- 关键现状文件：
  - `src/services/content.ts`
  - `src/pipeline/handlers/content-fetch-html.ts`
  - `src/pipeline/handlers/content-normalize.ts`
  - `src/pipeline/handlers/index.ts`
  - `src/services/pipeline-tracking.ts`
  - `src/ai/client.ts`
  - `src/queue/config.ts`

---

## 13. Open questions

- `pipeline_run` 在 content 链路里采用“整个 content 生命周期一个 run”，通过 `pipelineRunId` 在 `content.fetch-html -> content.normalize -> content.analyze.basic` 间透传。
- `content.analyze.basic` / `content.analyze.heavy` 本轮都已接通真实 runtime 与最小落库实现。
- `source.fetch` 本轮仍保留现有实现；统一 runtime 先收敛在 content 链路。
