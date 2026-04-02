# smart-feed UI 设计规格

<meta>
  <document-id>smart-feed-ui-spec</document-id>
  <version>1.1.0</version>
  <project>smart-feed</project>
  <type>UI 现状规格</type>
  <created>2026-03-31</created>
  <updated>2026-04-02</updated>
  <tech-stack>Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, Base UI</tech-stack>
</meta>

## 1. 文档定位

本文件描述当前代码已经实现的 UI 结构与交互约束，**以仓库现有代码为准**，不再保留已经过期的设计设想。

当前规格覆盖的核心页面：
- `/` Dashboard
- `/digest` Daily Digest
- `/original-content` Original Feeds
- `/sources` Sources
- `/settings` Settings

---

## 2. 产品形态

### 2.1 应用类型
- 桌面优先的单栏工作台。
- 使用 App Router 的服务端渲染页面，辅以局部 Client Component 处理交互。
- 重点是内容浏览、来源管理与轻量配置，不包含登录、用户体系或多租户界面。

### 2.2 当前导航结构
- `Dashboard`
- `Daily Digest`
- `Original Feeds`
- `Sources`
- `Settings`

说明：
- `Dashboard` 是当前默认首页。
- 当前代码中**没有** `Archive` 页面，也没有历史日报导航入口。
- `Original Feeds` 是原始抓取内容时间流页面，名称已固定，不再使用 `Original Content`。

### 2.3 页面标题映射
- `/` → `Dashboard`
- `/digest` → `Daily Digest`
- `/original-content` → `Original Feeds`
- `/sources` → `Sources`
- `/settings` → `Settings`

---

## 3. 布局规格

### 3.1 全局壳层
- 左侧固定 Sidebar，宽度 `w-64`。
- 右侧为 Header + 主内容区。
- 主内容区内部统一使用 `ScrollArea` 滚动，而不是整页浏览器滚动。
- Header 固定在顶部，带毛玻璃背景。

### 3.2 Sidebar
- 顶部包含产品标识 `smart-feed` 与图标。
- 中部为主导航列表。
- 底部当前为空占位，不显示 `Demo Mode`、`Mock Mode` 或额外挂件。

### 3.3 Header
- 左侧显示当前路由标题。
- 右侧固定提供 `New Source` 按钮，跳转到 `/sources`。

### 3.4 内容区宽度
- `Dashboard` / `Sources` / `Settings`：主内容容器约 `max-w-5xl`
- `Daily Digest`：主内容容器约 `max-w-4xl`
- `Original Feeds`：主内容容器约 `max-w-6xl`

---

## 4. 文案与信息密度约束

### 4.1 文案规则
- 页面与组件默认只保留必要标题、状态、操作和数据内容。
- **不要默认添加解释性副标题、功能概述或实现说明文案。**
- 例如不要写：
  - “Chronological feed of all synced articles.”
  - “支持按状态筛选、按来源下钻、按时间查看”
  - “该页面展示 AI 处理前的原始内容”

### 4.2 允许保留的文案类型
- 页面标题
- 按钮文字
- 表单 placeholder
- 空状态的最小必要提示
- Toast 成功/失败反馈
- 卡片中的真实业务内容

### 4.3 视觉风格
- 偏克制、偏内容阅读，不做营销式说明。
- 避免用一大段文案解释界面应该怎么用。
- 信息层级通过布局、留白、字号与卡片结构表达，而不是通过功能说明段落表达。

---

## 5. 页面规格

### 5.1 Dashboard (`/`)

用途：
- 展示 `Top Intelligence`，即已经完成 AI 摘要的高价值内容卡片。

结构：
- 顶部标题 `Top Intelligence`
- 右侧轻量状态提示 `Real-time update`
- 下方为 1 列 / 2 列响应式卡片网格

数据来源：
- `getTopIntelligence()`

空状态：
- `No intelligence ready yet. Check back later or add more sources.`

卡片内容：
- 分类 Badge
- 价值分
- 一句话摘要
- 来源名称
- 要点首句
- 证据 tooltip

### 5.2 Daily Digest (`/digest`)

用途：
- 以主题分组形式展示已完成摘要的日报内容。

结构：
- 居中标题 `Daily Intelligence Digest`
- 标题下方显示业务时区日期
- 按分类分组渲染 section

数据来源：
- `getDailyDigestItems()`

分组逻辑：
- 基于 `record.categories`
- 仅展示可转换为 digest record 的内容

空状态：
- `No digest generated yet. Wait for the scheduled task or trigger manually.`

### 5.3 Original Feeds (`/original-content`)

用途：
- 展示所有 source 的原始抓取内容时间流。
- 数据直接来自原始内容表，不依赖 AI 摘要记录。

页面标题：
- `Original Feeds`

顶部筛选区：
- 时间筛选下拉
- 来源筛选下拉

时间筛选：
- `All Time`
- `Today`
- `Last 2 Days`
- `Last Week`

来源筛选：
- 单选
- 支持前端搜索
- 支持 `All Sources`
- 支持清除当前来源筛选

列表规则：
- 按 `effectiveAt desc, createdAt desc` 排序
- 当前默认每页 `100` 条
- 分页控件位于**列表底部**

卡片内容：
- 来源 badge
- 作者（无则不显示）
- 标题
- `effectiveAt` 的业务时区格式化时间
- 原始内容预览文本
- `Read Original` 外链按钮

预览规则：
- 优先 `rawExcerpt`
- 否则回退 `rawBody`
- HTML 先去标签并规整空白
- 截断长度 `280`
- 不直接渲染原始 HTML

空状态：
- `No original content found for the current filters.`

### 5.4 Sources (`/sources`)

用途：
- 管理 RSS 来源，支持单条添加与 OPML 导入。

顶部卡片：
- 标题 `Manage Sources`
- 说明文案 `添加单个 RSS，或通过 OPML 批量导入现有订阅清单。`

操作入口：
- Tabs:
  - `单条 RSS`
  - `OPML 导入`

单条 RSS：
- URL 输入框
- `Add Source` 按钮

OPML 导入：
- 文件选择 / 拖拽区域
- `选择文件` / `更换文件`
- `清空`
- `开始导入`

导入完成后：
- 展示本次导入结果摘要
- 展示失败明细（若有）

来源卡片列表：
- status badge
- 删除按钮
- 标题与 identifier
- `Pause Sync` / `Resume Sync`

空状态：
- `No sources configured. Try adding an RSS feed above!`

### 5.5 Settings (`/settings`)

当前状态：
- 仅有基础占位卡片，不是完整设置中心。

已有内容：
- `General Settings`
- `Digest Time`
- 右侧静态 badge `08:00 AM`

说明：
- 当前页面仍包含说明性 `CardDescription`，这是已有实现现状，不代表新页面应继续沿用同样策略。

---

## 6. 组件与交互模式

### 6.1 当前已使用的核心 UI 组件
- `Button`
- `Badge`
- `Card`
- `Input`
- `Tabs`
- `AlertDialog`
- `ScrollArea`
- `Separator`
- `Skeleton`
- `Tooltip`
- `Sonner`

### 6.2 筛选交互
- `Original Feeds` 的筛选器是页面内局部实现，不是通用 combobox 基础设施。
- 通过 `router.replace()` 同步 URL query。
- 改变时间筛选或来源筛选时，分页重置为第一页。

### 6.3 Skeleton 使用方式
- `Dashboard`、`Digest`、`Sources` 均提供 skeleton fallback。
- `Original Feeds` 当前没有单独的 skeleton 视图。

### 6.4 Toast 与乐观反馈
- `Sources` 页面在添加、导入、删除、切换状态时使用 toast 反馈。
- 导入与状态切换包含局部乐观更新或刷新逻辑。

---

## 7. 状态管理现状

### 7.1 当前实际实现
- 当前页面数据主要通过 Server Component + Server Action 直接读取。
- 客户端局部状态仅用于：
  - 表单输入
  - 弹层开关
  - 文件选择
  - 来源搜索
  - 乐观 UI

### 7.2 当前未使用的方案
- 当前代码中**没有**按 UI 主状态管理去落地 `Zustand persist + Mock Store`。
- 当前代码中**没有** `Demo Mode` 指示器。

因此：
- 旧版“默认 Mock 模式”相关设计不再视为当前 UI 规格的一部分。

---

## 8. 响应式与可用性

### 8.1 已有实现倾向
- 当前实现明显偏桌面工作台。
- Sidebar 为固定左栏。
- 多数页面在移动端没有专门的导航抽屉实现。

### 8.2 规格约束
- 不在 spec 中虚构尚未实现的移动端交互。
- 若未来新增移动端导航抽屉、折叠侧栏或底部导航，应在此文档追加，而不是提前写成现状。

---

## 9. 当前已知差异与边界

- `Settings` 仍然偏占位页。
- `Dashboard`、`Sources`、`Settings` 仍保留少量说明性文案，这是历史实现现状。
- 新增页面或后续改版默认应遵守“少解释、少副标题”的规则。
- `Original Feeds` 名称已经替代 `Original Content`，后续文档与 UI 应保持一致。

---

## 10. 验收检查清单

- [ ] Sidebar 是否包含 `Dashboard / Daily Digest / Original Feeds / Sources / Settings`
- [ ] `/original-content` 页标题是否为 `Original Feeds`
- [ ] `/original-content` 页面是否没有额外解释性副标题
- [ ] `Original Feeds` 的时间筛选是否包含 `All Time / Today / Last 2 Days / Last Week`
- [ ] `Original Feeds` 的来源筛选是否为“前端搜索 + 单选 + 可清除”
- [ ] `Original Feeds` 是否按时间倒序展示，且分页位于列表底部
- [ ] `Original Feeds` 是否默认每页 `100` 条
- [ ] `Original Feeds` 卡片是否只展示必要信息，不渲染原始 HTML
- [ ] Sources 页面是否仍支持单条 RSS 与 OPML 导入
- [ ] 文案是否避免功能解释型副标题和实现说明
