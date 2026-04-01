# Pipeline 全流程集成测试教程 (Dummy AI 模式)

本教程旨在指导开发者如何在本地环境中测试从“前端导入 RSS 源”到“后端自动处理并生成摘要”的全流程。为了节省成本并加快测试速度，我们将使用 **Dummy AI Provider**（基于规则的模拟 AI）。

---

## 1. 环境准备

### 1.1 依赖项检查
确保您的本地环境已启动以下服务：
- **Redis**: 用于 BullMQ 任务队列。
- **PostgreSQL**: 用于数据持久化。

### 1.2 环境变量配置
在项目根目录的 `.env` 文件中，确保设置以下关键变量：

```bash
# 数据库与 Redis 配置
DATABASE_URL=postgres://user:password@localhost:5432/smart_feed
REDIS_URL=redis://localhost:6379

# 启用 Dummy AI 模式 (关键)
SMART_FEED_AI_PROVIDER=dummy

# 邮件发送配置 (测试阶段可使用 Ethereal 或本地 SMTP 模拟器)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_pass
SMART_FEED_EMAIL_FROM=test@smartfeed.dev

# 业务时区配置
SMART_FEED_TIMEZONE=Asia/Shanghai
```

---

## 2. 启动服务

打开两个终端窗口，分别启动 Web 前端和 Worker 后端。

### 终端 1: Web 前端
```bash
bun run dev:web
```
访问地址: [http://localhost:3000](http://localhost:3000)

### 终端 2: Worker 后端
```bash
bun run dev:worker
```
Worker 将监听任务队列并处理 Pipeline。

---

## 3. 测试步骤

### 步骤 1: 导入 RSS 源
1. 在浏览器中打开 `http://localhost:3000/sources`（或点击导航栏的“来源管理”）。
2. 在输入框中输入一个有效的 RSS 地址，例如：
   - `https://v2ex.com/index.xml`
   - `https://blog.langchain.dev/rss/`
3. 点击 **"添加来源"**。

### 步骤 2: 触发手动同步 (可选)
系统默认每小时自动扫描一次。为了立即看到效果，您可以：
- **方案 A**: 等待 Worker 启动后的首次调度。
- **方案 B**: 在数据库中直接将该 Source 的 `last_successful_sync_at` 设为 `NULL` 或很早的时间，然后重启 Worker。

### 步骤 3: 观察处理流程
在 **终端 2 (Worker)** 中，您应该能看到类似以下的日志输出：

1. `[worker] Processing "source.fetch" for ...` (获取 RSS)
2. `[worker] Processing "content.fetch-html" ...` (抓取原文)
3. `[worker] Processing "content.normalize" ...` (转换为 Markdown)
4. `[worker] Processing "content.analyze.basic" ...` (Dummy AI 评分)
5. `[worker] Processing "content.analyze.heavy" ...` (Dummy AI 摘要)

### 步骤 4: 验证结果

#### 1. 查看队列监控 (bull-board)
访问 `http://127.0.0.1:3010/admin/queues`（需确保 worker 进程已启动）。
您可以查看 `ingestion`, `content`, `ai` 等队列的任务执行情况和失败重试记录。

#### 2. 检查数据库数据
使用 `bunx drizzle-kit studio` 或您的 SQL 客户端查看：
- `sources`: 确认 `last_successful_sync_at` 已更新。
- `content_items`: 确认已生成 Markdown 正文 (`cleaned_md`)。
- `analysis_records`: 确认已生成由 Dummy Provider 生成的模拟评分和摘要。

#### 3. 查看前端摘要
访问 `http://localhost:3000/digest`，查看是否已生成当天的智能简报。

---

## 4. 常见问题排查

- **任务卡在 active 状态**: 检查 Redis 连接是否正常，或者 Worker 是否意外崩溃。
- **AI 步骤被跳过**: 检查 `SMART_FEED_AI_PROVIDER` 是否确实设为 `dummy`。如果设为 `disabled`，Pipeline 将在标准化后终止。
- **抓取失败**: 部分网站可能有反爬机制，检查 `content_items` 表中的 `status` 是否为 `failed`。

---

## 5. 进阶：如何调整 Dummy AI 的行为
Dummy Provider 的模拟逻辑位于 `src/ai/client.ts` 中的 `buildDummyBasicAnalysis` 和 `buildDummyHeavySummary` 函数。您可以根据需要修改其中的启发式算法（例如调整价值分推断逻辑）来测试不同的 Pipeline 分支。
