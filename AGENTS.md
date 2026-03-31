# smartfeed

中文沟通，Mac + Bun。

### 技术栈

- TypeScript（strict）
- Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui + Zustand
- Drizzle ORM + PostgreSQL
- BullMQ + Redis + Express（worker）
- Zod v4

## 开发规范

1. 你的改动应当可被其他 Agent 审查，因此实现、注释和日志都要足够清晰。
2. TypeScript 中尽量不要使用 `any`；优先使用具体类型、泛型、联合类型或 `unknown`。
3.  数据库 migration 必须通过 `drizzle-kit generate` 或仓库封装命令生成，不要手写 SQL migration，也不要手动改动 `packages/db/drizzle/meta` 下的数据，它们都应该是命令生成的。
4. 一旦某个 migration 文件已经提交，或有可能已被任何环境执行过，就禁止再修改该 migration 的 SQL、文件名、序号、snapshot 与 `_journal.json` 对应记录；后续 schema 变更只能追加新的 migration。
5. 即使只是 review feedback 导致的小幅 schema 调整（如索引、约束、表名、列默认值），也必须新增 forward-only migration，禁止通过重生成、覆盖或改名旧 migration 来“整理历史”。
9. UI 组件默认不要展示面向用户的实现性说明文案，例如“支持按账户、交易所、状态、币种和时间范围筛选，并可下钻到对应账户详情”这类功能解释；界面应尽量简洁，只保留必要的信息层级与操作提示。
10. 数据库中默认是UTC时间（或unix时间戳）, 前端显示和业务（比如按天统计）都用配置的时区


### Git 工作流
- 托管在 **github**，使用github mcp或者 `gh` CLI。
- 重要变更后在 `docs/changes/` 创建变更文档

### 提交前检查

先运行 `bun run check && bun run typecheck`，全部通过后再 commit
