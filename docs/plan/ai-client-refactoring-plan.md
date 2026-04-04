# AI Client 重构：模块化拆分与职责分离

## 目标定位

**本次重构的目标是「拆文件、降复杂度、明确职责」，不是「Provider 零改动可扩展」。**

当前 `src/ai/client.ts` 是 965 行的单体文件，混杂了 7 种不同职责。本次重构将其拆分为职责单一的模块，提升可读性、可测试性和可维护性。

> **不做的事：**
> - 不改变 `prompts.ts` 中 `EnabledAiRuntimeState` 和 `getModelStrategy()` 的设计
> - 不改变 `config/env.ts` 中 `AiProvider` 类型的定义
> - 不承诺新增 Provider 时零改动——这需要更大范围的架构调整（涉及 env、prompts、modelStrategy 归属），不属于本次范围
> - 不改变公共 API 类型签名（包括 `AiClientDeps`）

---

## 问题诊断

### P1: 单文件职责过载（SRP 违反）

965 行文件包含 7 种职责：类型定义、错误类、归一化纯函数（200+ 行）、Dummy 启发式逻辑（170+ 行）、OpenRouter SDK 调用、配置解析、客户端工厂。不同职责的代码交织在一起，修改归一化逻辑时需要在 Dummy provider 和 SDK 调用之间跳跃。

### P2: Dummy Provider 逻辑作为内联函数

`buildDummyBasicAnalysis`、`buildDummyHeavySummary` 及 6+ 个 `infer*` 函数全部散落在 client.ts 中间区域（L481-L647），无法独立测试，也缺乏模块边界。

### P3: 数据修复层与 Provider 无关但混在一起

`tryRepairStructuredObjectText` 及 ~15 个辅助纯函数（L113-L437）是与 Provider 完全无关的数据修复逻辑，占 200+ 行。这些纯函数非常适合独立成模块并编写充分的单元测试。

### P4: `defaultGenerateStructuredObject` 中有死代码

```typescript
// client.ts:L451-L467
let repairApplied = false;         // 永远是 false
let repairErrorMessage: string | null = null;  // 永远是 null
if (!repairApplied && repairErrorMessage !== null) {
  // 永远不会执行
}
```

### P5: 模块级单例 + 门面包装冗余

client.ts 底部的 `aiClient` 单例和 5 个门面函数（L918-L943）增加了不必要的间接层。

---

## 设计决策

### D1: 公共 API 100% 向后兼容

`index.ts` 的所有导出名称、类型签名完全不变。特别是 **`AiClientDeps` 类型保持不变**——`generateStructuredObject` 和 `openRouterProviderFactory` 仍然作为 `createAiClient` 的可注入依赖，供测试使用。

具体做法：`createAiClient` 接收 `AiClientDeps`，内部将这些依赖传递给对应的 Provider 构造函数。对外接口不变，对内分发路由。

```typescript
// client.ts 重构后
function createAiClient(deps: AiClientDeps = {}) {
  const env = deps.env ?? getAppEnv();

  // 内部创建 Provider，传递 DI 依赖
  function createProvider(): AiProvider | null {
    const runtimeState = getRuntimeStateFromEnv(env);
    if (runtimeState === "disabled") return null;
    if (runtimeState === "dummy") return new DummyProvider();
    return new OpenRouterProvider({
      env,
      generateStructuredObject: deps.generateStructuredObject,
      openRouterProviderFactory: deps.openRouterProviderFactory,
    });
  }
  // ...
}
```

### D2: 任务配置单一真相源

**`resolveTaskConfig` 是任务配置的唯一真相源**，保留在 `client.ts` 中。Provider 的 `execute()` 方法接收已解析好的配置（包括 `modelId`）作为参数，**不自行解析模型**。

这确保下游 `analysis.ts` 用 `resolveAiTaskConfig()` 获取的 `modelStrategy`/`promptVersion` 与实际执行的模型始终一致。

```typescript
// AiProvider 接口
interface AiProvider {
  readonly name: string;
  execute<TOutput>(options: {
    input: AiPromptInput;
    kind: AiTaskKind;
    modelId: string;                          // 由 client 解析后传入
    promptDefinition: AiPromptDefinition<TOutput>;
  }): Promise<TOutput>;
}
```

```typescript
// client.ts 内部调度
async function runStructuredPrompt<TOutput>(options: { ... }): Promise<TOutput> {
  const taskConfig = resolveTaskConfig(kind, env);  // 唯一真相源
  const provider = getProvider();
  return provider.execute({
    input,
    kind,
    modelId: taskConfig.modelId!,                   // 已解析的 modelId
    promptDefinition,
  });
}
```

### D3: Dummy Provider 保持类型安全

**不使用 `Record<string, (input) => unknown>` + `as TOutput` 的松散分派**。

改为让 `client.ts` 在调用 `provider.execute()` 时传入类型安全的 `buildDummyOutput` 回调（仅对 DummyProvider 生效），或者让 DummyProvider 内部有明确的方法重载。

方案 A（推荐）：DummyProvider 通过 `promptDefinition.schemaName` 分派，但用类型断言收窄到已知的 schema 枚举：

```typescript
// providers/dummy.ts
const SCHEMA_NAMES = ["basic_analysis", "heavy_summary"] as const;
type SupportedSchemaName = typeof SCHEMA_NAMES[number];

function isSupportedSchema(name: string): name is SupportedSchemaName {
  return (SCHEMA_NAMES as readonly string[]).includes(name);
}

class DummyProvider implements AiProvider {
  async execute<TOutput>(options: { ... }): Promise<TOutput> {
    const { input, promptDefinition } = options;
    if (!isSupportedSchema(promptDefinition.schemaName)) {
      throw new AiConfigurationError(
        `DummyProvider does not support schema "${promptDefinition.schemaName}"`
      );
    }

    const rawOutput = promptDefinition.schemaName === "basic_analysis"
      ? buildDummyBasicAnalysis(input)
      : buildDummyHeavySummary(input);

    // schema.parse 提供运行时类型校验兜底
    return promptDefinition.schema.parse(rawOutput) as TOutput;
  }
}
```

这比 `Record<string, unknown>` 好在：
1. `isSupportedSchema` 类型守卫在 DummyProvider 内部限制了分支，对不支持的 schema 快速失败
2. `schema.parse()` 提供运行时类型校验兜底

> **注意：** 由于当前 `AiPromptDefinition.schemaName` 的类型是 `string`（见 `prompts.ts:L49`），`SupportedSchemaName` 只能提供**运行时守卫**，无法形成编译期穷尽检查。如果未来希望获得编译期保证，需要同步将 `schemaName` 的类型从 `string` 收窄为字面量联合类型——这属于 `prompts.ts` 的改动，不在本次范围内。

### D4: 日志语义保留

当前 AI 路径有以下关键日志点，重构后必须全部保留在对应模块中：

| 日志点 | 当前位置 | 重构后归属 | 级别 |
|--------|---------|-----------|------|
| AI task config resolved | `client.ts:L719,L739,L761` | `client.ts` (resolveTaskConfig) | debug |
| AI provider is unavailable | `client.ts:L793` | `client.ts` (assertAiAvailable) | warn |
| Initializing OpenRouter provider | `client.ts:L802` | `providers/openrouter.ts` | info |
| AI prompt execution started | `client.ts:L826` | `client.ts` (runStructuredPrompt) | info |
| AI prompt execution completed (dummy) | `client.ts:L837` | `providers/dummy.ts` | info |
| Calling structured AI generation | `client.ts:L851` | `providers/openrouter.ts` | info |
| AI prompt execution completed | `client.ts:L869` | `providers/openrouter.ts` | info |
| AI prompt execution failed | `client.ts:L878` | `providers/openrouter.ts` | error |
| runBasicAnalysis 入口 | `client.ts:L897` | `client.ts` | info |

**Logger component 名称不变**：所有模块（包括 `providers/dummy.ts` 和 `providers/openrouter.ts`）统一使用 `createLogger("AiClient")`，保持与现有日志流的 grep/过滤兼容。Provider 的身份信息通过日志 context 字段传递（如 `{ provider: "dummy" }` 或 `{ provider: "openrouter" }`），而非改变 component 名称。

### D5: 扩展性边界的诚实声明

本次重构只解决 `client.ts` 内部的职责分离。要实现真正的 Provider 可扩展（新增 Anthropic/Ollama 零改动），还需要：

1. **`config/env.ts`**: 将 `AiProvider = "dummy" | "openrouter"` 改为可扩展的注册机制
2. **`prompts.ts`**: 将 `EnabledAiRuntimeState` 和 `getModelStrategy()` 解耦（modelStrategy 应由 Provider 自己声明，而非 prompt 定义决定）
3. **modelStrategy 归属**: 当前 modelStrategy 由 `promptDefinition.getModelStrategy(runtimeState)` 生成（如 `"openrouter-basic"`），硬编码了 provider 名称。需要重新设计为 `provider.name + "-" + kind` 或类似动态组合

这些属于后续工作，本次不涉及。

---

## 目录结构设计（重构后）

```text
src/ai/
├── index.ts                # [桶文件] 统一 re-export，公共 API 不变
├── client.ts               # [瘦客户端] Provider 路由 + 工厂 + resolveTaskConfig，~150 行
├── types.ts                # [NEW] 共享类型：AiRuntimeState, AiTaskKind, AiClientEnv, ResolvedAiTaskConfig
├── errors.ts               # [NEW] AiProviderUnavailableError, AiConfigurationError
├── provider.ts             # [NEW] AiProvider 接口定义
├── repair/                 # [NEW] 数据修复与归一化
│   ├── index.ts            #   导出 tryRepairStructuredObjectText
│   ├── json-parser.ts      #   extractJsonTextCandidate, parseJsonTextCandidate
│   └── normalizers.ts      #   normalizeLanguage, normalizeSentiment 等纯函数
├── providers/              # [NEW] Provider 实现
│   ├── dummy.ts            #   DummyProvider：启发式规则模拟
│   └── openrouter.ts       #   OpenRouterProvider：Vercel AI SDK 调用
├── prompts.ts              # [不变]
├── schemas.ts              # [不变]
├── smoke.ts                # [微调] import 路径（如有需要）
├── client.test.ts          # [调整] import 路径 + 补充 Provider 测试
└── prompts.test.ts         # [不变]
```

---

## 文件变更清单

### 基础层

#### [NEW] `src/ai/types.ts`

从 `client.ts` 迁移：
- `AiRuntimeState`
- `AiTaskKind`
- `AiClientEnv`
- `ResolvedAiTaskConfig`
- `AiClientDeps`（**保持原签名不变**，包含 `generateStructuredObject` 和 `openRouterProviderFactory`）
- `GenerateStructuredObject`
- `OpenRouterProviderFactory`
- `StructuredPromptDefinition`（内部类型）

#### [NEW] `src/ai/errors.ts`

从 `client.ts` 迁移：
- `AiProviderUnavailableError`
- `AiConfigurationError`

#### [NEW] `src/ai/provider.ts`

定义 `AiProvider` 接口。`execute()` 接收已解析的 `modelId`，不自行做配置解析。

---

### Repair 模块

#### [NEW] `src/ai/repair/normalizers.ts`

从 `client.ts` 迁移全部归一化纯函数（~150 行）：
- `isJsonRecord`, `getFirstDefinedValue`, `normalizeString`, `normalizeStringArray`, `normalizePoints`
- `normalizeLanguage`, `normalizeSentiment`, `normalizeValueScore`, `normalizeValueScoreNumber`
- `normalizeBasicAnalysisCandidate`, `normalizeHeavySummaryCandidate`
- `buildRepairedObject`

#### [NEW] `src/ai/repair/json-parser.ts`

从 `client.ts` 迁移（~30 行）：
- `extractJsonTextCandidate`
- `parseJsonTextCandidate`

#### [NEW] `src/ai/repair/index.ts`

组合导出 `tryRepairStructuredObjectText`，内部调用 `json-parser` 和 `normalizers`。

---

### Provider 实现

#### [NEW] `src/ai/providers/dummy.ts`

从 `client.ts` 迁移 ~170 行启发式逻辑，实现 `AiProvider` 接口：
- `collectCandidatePhrases`, `truncateText`
- `inferLanguage`, `inferCategories`, `inferKeywords`, `inferEntities`, `inferSentiment`, `inferValueScore`
- `buildDummyBasicAnalysis`, `buildDummyHeavySummary`
- 使用 `createLogger("AiClient")`，日志 context 中附加 `{ provider: "dummy" }`

#### [NEW] `src/ai/providers/openrouter.ts`

从 `client.ts` 迁移 SDK 调用逻辑，实现 `AiProvider` 接口：
- `defaultGenerateStructuredObject`（**清理死代码**：移除 `repairApplied`/`repairErrorMessage`）
- `defaultOpenRouterProviderFactory`
- Provider 实例缓存（惰性初始化）
- `resolveOpenRouterApiKey`（仅做校验，`modelId` 由外部传入）
- 构造函数接收 `generateStructuredObject?` 和 `openRouterProviderFactory?`（来自 `AiClientDeps` 透传）
- 使用 `createLogger("AiClient")`，日志 context 中附加 `{ provider: "openrouter" }`

---

### 瘦客户端

#### [MODIFY] `src/ai/client.ts`

从 965 行重写为 ~150 行：
- 删除所有已迁移的代码
- 保留 `resolveTaskConfig`（唯一的任务配置真相源）
- 保留 `createAiClient` 工厂（内部创建 Provider、透传 DI 依赖）
- 保留 `summarizeAiInput` 辅助函数
- 保留模块级门面函数和单例导出
- `runStructuredPrompt` 瘦身为：调用 `resolveTaskConfig` → 调用 `provider.execute()` → 返回

---

### 桶文件

#### [MODIFY] `src/ai/index.ts`

调整 re-export 来源路径（部分 type 从 `./types`，错误从 `./errors`）。`tryRepairStructuredObjectText` 当前不在 `index.ts` 的公共导出中（它仅由 `client.ts` 内部 export），重构后继续保持非公共导出——`client.ts` 从 `./repair` 导入它供内部使用，不经 `index.ts` re-export。**对外导出的名称、签名和数量完全不变，不新增也不移除任何公共导出。**

---

### 测试和 Smoke

#### [MODIFY] `src/ai/client.test.ts`

- 调整 import 路径（从 `./client` → `./index` 或细粒度导入）
- **不改变测试逻辑和断言**：由于 `AiClientDeps` 签名不变，现有的 mock 方式继续有效
- 补充 `repair/normalizers.ts` 的纯函数测试（可新建 `repair/normalizers.test.ts`）

#### [MODIFY] `src/ai/smoke.ts`

- 微调 import 路径（如有需要）
- 功能逻辑不变

---

## 实施步骤

| 步骤 | 内容 | 风险 | 验证 |
|------|------|------|------|
| 1 | 创建 `types.ts` + `errors.ts`，从 client.ts 提取类型和错误定义 | 低 | typecheck |
| 2 | 创建 `provider.ts`，定义 `AiProvider` 接口 | 低 | typecheck |
| 3 | 创建 `repair/` 目录，迁移归一化和 JSON 解析逻辑 | 低 | 现有 repair 测试通过 |
| 4 | 创建 `providers/dummy.ts`，迁移启发式、实现 `AiProvider`、保留日志 | 中 | dummy 模式测试通过 |
| 5 | 创建 `providers/openrouter.ts`，迁移 SDK 调用、清理死代码、实现 `AiProvider`、保留日志 | 中 | openrouter mock 测试通过 |
| 6 | 重写 `client.ts` 为瘦客户端（路由 + resolveTaskConfig + 门面） | 高 | 全量测试通过 |
| 7 | 更新 `index.ts` re-export 路径 | 低 | typecheck |
| 8 | 调整 `client.test.ts`、`smoke.ts` 的 import 路径 | 低 | 全量测试通过 |
| 9 | 全量验证 | — | 见验证计划 |

---

## 验证计划

### 自动化测试

```bash
# 1. 类型检查
bun run typecheck

# 2. Lint 检查
bun run check

# 3. AI 模块单元测试（包含 repair、dummy、openrouter mock）
bun test src/ai/

# 4. 下游消费者测试
bun test src/services/
```

### 手动验证

- `SMART_FEED_AI_PROVIDER=dummy bun src/ai/smoke.ts` — 验证 dummy 模式
- 如有 openrouter key：`SMART_FEED_AI_PROVIDER=openrouter bun src/ai/smoke.ts` — 验证真实调用
- 检查日志输出：确认 component 仍为 `[AiClient]`，且 context 中包含 `provider: "dummy"` 或 `provider: "openrouter"` 字段

### 回归核查清单

- [ ] `index.ts` 导出签名与重构前完全一致（`diff` 验证）
- [ ] `AiClientDeps` 类型签名不变
- [ ] `client.test.ts` 所有现有测试用例 pass（不改断言逻辑）
- [ ] `analysis.ts` 的 `resolveAiTaskConfig()` 仍返回相同结构
- [ ] 日志表中列出的所有日志点均有输出

---

## 不在范围内的后续工作

如果未来需要真正的 Provider 可扩展性（新增 Anthropic/Ollama 零改动），需要独立的后续 PR 处理以下问题：

1. **`config/env.ts`**: `AiProvider = "dummy" | "openrouter"` → 可扩展注册机制
2. **`prompts.ts`**: `EnabledAiRuntimeState` 解耦、`getModelStrategy()` 归属重设计
3. **modelStrategy 动态组合**: 由 Provider 自行声明，而非 prompt 定义硬编码
