# Original Feeds 内容详情页实施计划

**范围**: 新增 `/original-content/[contentId]` 详情页（前端 + Server Actions），不涉及 Worker / Pipeline Handler / Schema 变更
**创建日期**: 2026-04-02
**文档状态**: 待实施

---

## 1. 背景与目标

当前 `/original-content` 列表页已实现内容时间流浏览和来源/时间筛选。但排查问题（如"为什么没进日报"、"AI 分析失败了吗"）仍需直接查数据库。

本需求新增一个**面向调试**的内容详情页，目标：

1. **看数据** — 展示单条 content 的全链路信息（meta → raw → cleaned → analysis → pipeline → digest），不再查数据库。
2. **做操作** — 手动触发 AI 分析任务，方便早起测试和调试。

### 不做的事

- 不做内容消费/阅读体验优化（页面面向调试，信息密度优先）
- 不做 `rawPayload` 展示（用不到）
- 不做 `cleanedMd` 的 rendered markdown 预览（v1 只看源码）
- 不做 fetch / normalize 重跑操作（状态机复杂，留后续版本）
- 不做操作后的自动轮询刷新（手动刷新即可）

---

## 2. 路由与导航

### 2.1 路由

```
/original-content/[contentId]
```

对应文件：`src/app/original-content/[contentId]/page.tsx`

### 2.2 列表页 → 详情页导航

修改 `src/components/features/original-content-card.tsx`：

- **不要**让整个 `Card` 外层变成 `<Link>`，避免和卡片底部的 `Read Original` 外链形成嵌套交互元素
- 保持 `Card` 根节点为普通容器
- 将 `CardHeader + CardContent` 作为一个独立的 `<Link>` 区域，跳转到 `/original-content/{id}`
- `CardFooter` 中的 `Read Original` 外链保持为 sibling，不需要依赖 `stopPropagation`
- 该 Link 区域应保留清晰的 hover / focus-visible 样式，确保键盘可达

### 2.3 详情页 → 列表页返回

页面顶部放一个返回按钮，使用 `router.back()` 或直接链接到 `/original-content`。

---

## 3. 数据查询层

### 3.1 新增查询文件

**文件**: `src/app/original-content/[contentId]/query.ts`

需要一个主查询函数 `loadContentDetail(contentId: string)` 并行查询以下数据：

#### 查询 A: 内容 Meta + Source + Raw

```
content_items LEFT JOIN content_item_raws ON contentId
              INNER JOIN sources ON sourceId
WHERE content_items.id = contentId
```

返回字段：
- **content_items**: `id`, `sourceId`, `kind`, `status`, `externalId`, `title`, `author`, `originalUrl`, `effectiveAt`, `publishedAt`, `fetchedAt`, `cleanedMd`, `processingError`, `createdAt`, `updatedAt`
- **sources**: `id`, `type`, `identifier`, `title`, `status`, `weight`
- **content_item_raws**: `format`, `rawBody`, `rawExcerpt`, `createdAt`

注意：`rawPayload` 不查询。

#### 查询 B: Analysis Records

```
SELECT * FROM analysis_records
WHERE contentId = contentId
ORDER BY createdAt DESC
```

返回全部字段。`summary` 是 JSON 对象 `{ oneline, points[], reason }`，需要在前端拆开展示。

#### 查询 C: Pipeline Runs + Step Runs

```
SELECT * FROM pipeline_runs
WHERE contentId = contentId
ORDER BY createdAt DESC
```

```
SELECT * FROM step_runs
WHERE pipelineRunId IN (上面的 pipeline run ids)
ORDER BY createdAt ASC
```

按 pipeline run 分组，run 内的 step 按创建时间正序排列。

#### 查询 D: Digest 关联

```
SELECT di.*, dr.period, dr.digestDate, dr.status AS digestStatus
FROM digest_items di
INNER JOIN digest_reports dr ON di.digestId = dr.id
INNER JOIN analysis_records ar ON di.analysisRecordId = ar.id
WHERE ar.contentId = contentId
ORDER BY dr.digestDate DESC
```

### 3.2 并行执行

查询 A 是基础，查询 B/C/D 可以并行。考虑到 `contentId` 可能无效，建议：

```typescript
// 先执行查询 A，不存在则直接 notFound()
const base = await loadContentBase(contentId);
if (!base) notFound();

// 再并行执行 B/C/D
const [analysisRecords, pipelineData, digestData] = await Promise.all([
  loadAnalysisRecords(contentId),
  loadPipelineRuns(contentId),
  loadDigestRelations(contentId),
]);
```

### 3.3 Action 边界

统一为：

- **读操作** 放在 `src/app/actions/original-content-actions.ts`
  - `getOriginalContentFeed(...)`
  - `getOriginalContentSources()`
  - `getContentDetail(contentId: string)`
- **写操作 / 调试入队操作** 放在 `src/app/actions/content-debug-actions.ts`
  - `enqueueBasicAnalysis(contentId: string)`
  - `enqueueHeavyAnalysis(contentId: string)`
  - `enqueueFullAiFlow(contentId: string)`

这样边界和现有文件职责一致：`original-content-actions.ts` 负责 original-content 页面读模型，`content-debug-actions.ts` 负责会产生副作用的调试操作。

---

## 4. 页面结构与 UI 区块

### 4.1 文件组织

```
src/app/original-content/[contentId]/
├── page.tsx                         # Server Component 入口，负责加载数据
├── content-detail-actions.tsx       # Client Component，只负责按钮交互/refresh/toast
├── raw-content-panel.tsx            # Server Component，渲染 Raw Content 区块
├── cleaned-markdown-panel.tsx       # Server Component，渲染 Cleaned Markdown 区块
├── query.ts                         # 数据查询
└── types.ts                         # 类型定义
```

说明：

- 页面主体以 **Server Component** 为主，避免把大字段序列化到客户端
- 只有操作按钮区块使用 Client Component
- 长文本区块（`rawBody`, `rawExcerpt`, `cleanedMd`）由 Server Component 直接渲染

### 4.2 页面布局

```
┌──────────────────────────────────────────────────────┐
│ ← Back to Original Feeds              [Refresh]      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ Content Meta ──────────────────────────────────┐ │
│  │ Status: [normalized]  Kind: [article]           │ │
│  │ Title: xxx                                      │ │
│  │ Author: xxx    Source: [badge] xxx              │ │
│  │ URL: xxx (link)                                 │ │
│  │ Published: xxx  Fetched: xxx  Effective: xxx    │ │
│  │ Processing Error: (if any, red)                 │ │
│  │ CleanedMd: ✓ (12,345 bytes) / ✗ empty          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Actions ───────────────────────────────────────┐ │
│  │ [Run Basic Analysis] [Run Heavy Analysis]       │ │
│  │ [Run Full AI Flow]                              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Raw Content ─────────── (collapsed by default) ┐ │
│  │ Format: html                                    │ │
│  │ ▸ Raw Body (click to expand)                    │ │
│  │ ▸ Raw Excerpt (click to expand)                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Cleaned Markdown ──────(collapsed by default)  ┐ │
│  │ Length: 12,345 bytes                            │ │
│  │ ▸ Markdown Source (click to expand)             │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Analysis Records (2) ──────────────────────────┐ │
│  │ ┌─ #1 full ─ 2026-04-02 09:15 ───────────────┐ │ │
│  │ │ Model: gpt-4o-mini  Prompt: heavy-v1        │ │ │
│  │ │ Score: 8  Categories: [AI] [Tech]           │ │ │
│  │ │ Keywords: [LLM, inference, ...]             │ │ │
│  │ │ Entities: [OpenAI, ...]                     │ │ │
│  │ │ Summary.oneline: xxx                        │ │ │
│  │ │ Summary.points: - xxx  - xxx                │ │ │
│  │ │ Summary.reason: xxx                         │ │ │
│  │ │ Evidence: "..."                             │ │ │
│  │ └────────────────────────────────────────────┘ │ │
│  │ ┌─ #2 basic ─ 2026-04-02 09:10 ──────────────┐ │ │
│  │ │ ...                                         │ │ │
│  │ └────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Pipeline Runs (1) ────────────────────────────┐ │
│  │ ┌─ Run #abc ─ content-processing v1 ──────────┐ │ │
│  │ │ Status: completed                           │ │ │
│  │ │ Started: 09:05  Finished: 09:16             │ │ │
│  │ │                                             │ │ │
│  │ │  Step 1: content.fetch-html  ✓ completed    │ │ │
│  │ │    09:05 → 09:08                            │ │ │
│  │ │  Step 2: content.normalize   ✓ completed    │ │ │
│  │ │    09:08 → 09:10                            │ │ │
│  │ │  Step 3: content.analyze.basic ✓ completed  │ │ │
│  │ │    09:10 → 09:12                            │ │ │
│  │ │  Step 4: content.analyze.heavy ✓ completed  │ │ │
│  │ │    09:12 → 09:16                            │ │ │
│  │ └────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Digest Relations (1) ─────────────────────────┐ │
│  │ Daily 2026-04-02 — status: sent                │ │
│  │   Section: "AI & ML"  Rank: 2                  │ │
│  │   Via analysis record: #abc123                  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 4.3 各区块细节

#### 区块 1: Content Meta

- `status` 用色彩标签区分：`sentinel`(灰) / `raw`(蓝) / `normalized`(黄) / `analyzed`(绿) / `digested`(紫) / `failed`(红)
- `processingError` 有值时以红色高亮展示
- `cleanedMd` 只显示"有/无"和字节数，不在此区块展开内容
- `originalUrl` 可点击外链

#### 区块 2: Actions

三个按钮，根据前置条件 disable：

| 操作 | 对应任务 | 前置条件 | 禁用提示 |
|------|----------|----------|----------|
| Run Basic Analysis | `content.analyze.basic` | `cleanedMd` 非空（status >= normalized） | "Requires normalized content" |
| Run Heavy Analysis | `content.analyze.heavy` | 至少有一条 `basic` 状态的 analysis_record | "Requires basic analysis first" |
| Run Full AI Flow | `content.analyze.basic` | 同 Basic Analysis | "Requires normalized content" |

- 点击后通过 Server Action 入队 BullMQ
- 入队成功后显示 toast 提示（如 "Basic analysis job queued"）
- 用户手动点击页面顶部 Refresh 按钮刷新查看结果
- 该区块由 `content-detail-actions.tsx` 实现，是页面中唯一的 Client Component

#### 区块 3: Raw Content（默认折叠）

- 显示 `format` 标签
- `rawBody` 和 `rawExcerpt` 各一个折叠块
- 优先使用原生 `<details><summary>` 或纯服务端可渲染的折叠结构，不依赖 `useState`
- 展开后用 `<pre>` 或 monospace 字体展示原文
- 如果 `rawExcerpt` 为 null 则不显示该折叠块
- 整个区块保持 Server Component，避免把大文本作为 client props 传输

#### 区块 4: Cleaned Markdown（默认折叠）

- 显示字节数和更新时间
- 优先使用原生 `<details><summary>` 或纯服务端可渲染的折叠结构，不依赖 `useState`
- 展开后用 monospace 展示 markdown 源码
- 如果 `cleanedMd` 为空显示"Not yet normalized"提示
- 整个区块保持 Server Component，避免把大文本作为 client props 传输

#### 区块 5: Analysis Records

- 按 `createdAt` 倒序展示
- 每条记录作为一个独立卡片
- `status` 标签色彩：`basic`(蓝) / `full`(绿) / `rejected`(红)
- `summary` 字段拆开展示：`oneline` 作为标题，`points[]` 作为列表，`reason` 作为段落
- `categories`, `keywords`, `entities` 用 badge/tag 展示
- 无记录时显示"No analysis records"

#### 区块 6: Pipeline Runs + Step Runs

- 按 pipeline run 分组，run 按 `createdAt` 倒序
- 每个 run 内的 step 按 `createdAt` 正序排列
- run 级别显示：`pipelineName`, `pipelineVersion`, `status`, `startedAt`, `finishedAt`
- step 级别显示：`stepName`, `status`, `startedAt`, `finishedAt`, `errorMessage`
- `errorMessage` 有值时红色高亮展示
- `status` 图标：`pending`(⏳) / `running`(🔄) / `completed`(✓) / `failed`(✗)
- 无记录时显示"No pipeline runs"

#### 区块 7: Digest Relations

- 展示关联的 `digest_reports` 信息：`period`, `digestDate`, `status`
- 展示 `digest_items` 的 `sectionTitle`, `rank`
- 标注关联的 `analysisRecordId`
- 无记录时显示 "Not included in any digest"

---

## 5. Server Actions（操作入队）

### 5.1 新增文件

**文件**: `src/app/actions/content-debug-actions.ts`

```typescript
"use server";

// 三个操作 action：

async function enqueueBasicAnalysis(contentId: string): Promise<{ success: boolean; message: string }>
async function enqueueHeavyAnalysis(contentId: string): Promise<{ success: boolean; message: string }>
async function enqueueFullAiFlow(contentId: string): Promise<{ success: boolean; message: string }>
```

### 5.2 实现要点

#### enqueueBasicAnalysis

1. 查询 `content_items`，校验 `cleanedMd` 非空
2. 通过 `getQueueForTask(smartFeedTaskNames.contentAnalyzeBasic)` 获取 ai-queue
3. 入队数据：`{ contentId, trigger: "content.normalize" }`（复用现有 `ContentAnalyzeBasicJobData` 类型）
4. 返回成功/失败消息

注意：`trigger` 字段用 `"content.normalize"` 是因为 `ContentAnalyzeBasicJobData` 类型定义要求 `trigger: "content.normalize"`。这里复用现有类型定义和 pipeline 链路，不创建新的 trigger 值。

#### enqueueHeavyAnalysis

1. 查询 `analysis_records`，校验存在 `status = 'basic'` 的记录
2. 通过 `getQueueForTask(smartFeedTaskNames.contentAnalyzeHeavy)` 获取 ai-queue
3. 入队数据：`{ contentId, trigger: "content.analyze.basic" }`
4. 返回成功/失败消息

#### enqueueFullAiFlow

1. 校验同 basic（`cleanedMd` 非空）
2. 入队 `content.analyze.basic`（basic handler 内部会根据 valueScore 自动决定是否续接 heavy）
3. 返回成功/失败消息

### 5.3 入队与 Pipeline Run

当前 `pipeline-runtime.ts` 的 `executeContentPipelineStep` 在没有传入 `pipelineRunId` 时会自动创建新的 pipeline run。因此从 Server Action 入队时**不需要手动创建 pipeline run**，handler 执行时会自动处理。

### 5.4 并发与重复点击约束

- UI 点击后应立刻进入 pending 状态，并临时 disable 当前按钮，避免用户连续触发
- 这里的 disable 主要是为了减少误操作和无意义排队，不应把它描述为“不会产生脏数据”的强保证
- 现有 `analysis_records` 的唯一约束是 `(contentId, modelStrategy, promptVersion)`，如果并发请求同时穿过缓存检查，仍可能命中数据库唯一约束并让某个任务失败
- 因此 v1 的方案应明确：**前端负责降低重复触发概率，后端只保证数据完整性，不保证重复点击一定无报错**
- Server Action 返回消息时应对这类已存在/重复触发场景给出可读错误文案，方便调试

---

## 6. 类型定义

### 6.1 新增类型文件

**文件**: `src/app/original-content/[contentId]/types.ts`

```typescript
/** 详情页 - 内容基础信息 */
type ContentDetailBase = {
  // content_items 字段
  id: string;
  sourceId: string;
  kind: string;
  status: string;
  externalId: string | null;
  title: string | null;
  author: string | null;
  originalUrl: string;
  effectiveAt: Date;
  publishedAt: Date | null;
  fetchedAt: Date;
  cleanedMd: string | null;
  processingError: string | null;
  createdAt: Date;
  updatedAt: Date;
  // source 字段
  source: {
    id: string;
    type: string;
    identifier: string;
    title: string | null;
    status: string;
    weight: number;
  };
  // raw 字段 (nullable, sentinel 可能没有)
  raw: {
    format: string;
    rawBody: string;
    rawExcerpt: string | null;
    createdAt: Date;
  } | null;
};

/** 详情页 - 分析记录 */
type ContentDetailAnalysisRecord = {
  id: string;
  status: string;
  modelStrategy: string;
  promptVersion: string;
  categories: string[];
  keywords: string[];
  entities: string[];
  language: string | null;
  sentiment: string | null;
  valueScore: number;
  summary: { oneline: string; points: string[]; reason: string } | null;
  evidenceSnippet: string | null;
  createdAt: Date;
};

/** 详情页 - Step Run */
type ContentDetailStepRun = {
  id: string;
  stepName: string;
  status: string;
  inputRef: string | null;
  outputRef: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

/** 详情页 - Pipeline Run (含 steps) */
type ContentDetailPipelineRun = {
  id: string;
  pipelineName: string;
  pipelineVersion: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  steps: ContentDetailStepRun[];
};

/** 详情页 - Digest 关联 */
type ContentDetailDigestRelation = {
  digestItemId: string;
  sectionTitle: string;
  rank: number;
  digestId: string;
  digestDate: string;
  period: string;
  digestStatus: string;
  analysisRecordId: string;
};

/** 详情页完整数据 */
type ContentDetailData = {
  base: ContentDetailBase;
  analysisRecords: ContentDetailAnalysisRecord[];
  pipelineRuns: ContentDetailPipelineRun[];
  digestRelations: ContentDetailDigestRelation[];
  timeZone: string;
};
```

---

## 7. 实施步骤

按顺序执行，每步完成后可独立验证。

### Step 1: 类型定义

- 创建 `src/app/original-content/[contentId]/types.ts`
- 定义上述所有类型

### Step 2: 数据查询层

- 创建 `src/app/original-content/[contentId]/query.ts`
- 实现 `loadContentDetail(contentId)` 及各子查询
- 使用 Drizzle ORM，查询模式参考现有 `src/app/original-content/query.ts`

### Step 3: Server Actions（数据读取）

- 在 `src/app/actions/original-content-actions.ts` 中追加 `getContentDetail(contentId: string)`
- 调用 query 层，返回 `ContentDetailData | null`

### Step 4: Server Actions（操作入队）

- 创建 `src/app/actions/content-debug-actions.ts`
- 实现 `enqueueBasicAnalysis`, `enqueueHeavyAnalysis`, `enqueueFullAiFlow`
- 入队逻辑参考 `src/services/source-import.ts` 中的 `enqueueSourceFetch` 模式

### Step 5: 详情页 Server Component

- 创建 `src/app/original-content/[contentId]/page.tsx`
- `force-dynamic`，调用 `getContentDetail`，不存在时 `notFound()`
- 渲染以 Server Component 为主的详情页主体
- 引入 `content-detail-actions.tsx` 负责按钮交互
- `Raw Content` / `Cleaned Markdown` 长文本区块保持在服务端渲染路径中，不作为 client props 传递

### Step 6: 详情页交互组件与长文本区块

- 创建 `src/app/original-content/[contentId]/content-detail-actions.tsx`
- 只实现 `Actions` 区块和顶部 `Refresh` 交互
- 操作按钮调用 Server Action，用项目现有的 `sonner` 展示入队结果
- 使用 `useTransition` + `router.refresh()` 处理提交态和刷新
- `Raw Content` / `Cleaned Markdown` 使用 Server Component + 原生折叠结构实现
- 其他信息展示区块优先保持 Server Component，减少不必要的 client bundle

### Step 7: 修改列表页卡片

- 修改 `src/components/features/original-content-card.tsx`
- 保持 `Card` 根节点不是链接
- 仅将 `CardHeader + CardContent` 组成一个 `<Link href={/original-content/${record.id}}>`
- `Read Original` 外链作为独立 sibling 保留，不使用 `stopPropagation`

### Step 8: 提交前检查

- `bun run check && bun run typecheck` 通过
- 补充自动化测试：
  - `query.ts`：详情查询分组、空数据、时间字段和 digest 关联映射
  - `content-debug-actions.ts`：三种入队 action 的前置条件和错误返回
  - `original-content-card.tsx`：卡片详情链接与外链共存行为
- 手动验证：列表页点击卡片 → 进入详情页 → 各区块数据正确 → 操作按钮正常入队

---

## 8. UI 组件复用

优先使用项目中已有的 shadcn/ui 组件：

| 用途 | 组件 |
|------|------|
| 状态标签 | `Badge` |
| 折叠/展开 | `Collapsible` (若已安装) 或自行用 `useState` + `div` |
| 按钮 | `Button` |
| 卡片容器 | `Card`, `CardHeader`, `CardContent` |
| 滚动区域 | `ScrollArea` |
| 分隔线 | `Separator` (若需要) |
| Toast 提示 | 项目现有的 toast 方案 |

如果 `Collapsible` 组件未安装，**优先不要为此新增依赖**。本页长文本区块优先使用原生 `<details>` / `<summary>` 实现，以保持服务端渲染路径简单。

---

## 9. 注意事项

1. **时间展示统一使用配置的时区** — 详情页所有时间字段都要用 `getAppEnv().timeZone` 转换后展示，与列表页保持一致。

2. **长文本传输与渲染** — `rawBody`, `cleanedMd` 可能很长。不要把它们通过大型 client props 传给浏览器；应保持在 Server Component 中渲染。展开后仍要设置 `max-height` + 内部滚动，避免页面一次性绘制超长文本。

3. **inputRef / outputRef 是序列化的 JSON 字符串** — `step_runs.inputRef` 和 `outputRef` 存的是 `JSON.stringify(...)` 的结果（参见 `pipeline-runtime.ts` 的 `serialize` 函数）。在详情页中可以默认不展示这两个字段，因为它们的信息已经被其他区块覆盖。如果需要展示用于深度调试，应做 JSON 格式化再展示。

4. **trigger 字段类型** — 现有 `ContentAnalyzeBasicJobData` 的 `trigger` 类型是字面量 `"content.normalize"`。Server Action 入队时需要复用这个字面量值。如果后续希望区分"手动触发"和"自动触发"，可以在未来扩展 trigger 类型联合体，但 v1 不做。

5. **并发安全** — 多次点击操作按钮会入队多个任务。`analysis_records` 的唯一约束可以防止最终写出重复记录，但不能保证并发任务都优雅成功；在缓存检查与插入之间仍可能出现竞争并导致某个任务失败。v1 应通过按钮 pending 态、可读错误提示和手动 refresh 方案来控制调试体验，而不是假设重复点击一定被平滑复用。

6. **不新增 DB migration** — 本需求只读取现有表，不需要新增表或字段。
