# smart-feed UI 设计规格

<meta>
  <document-id>smart-feed-ui-spec</document-id>
  <version>1.0.0</version>
  <project>smart-feed</project>
  <type>UI 设计规格</type>
  <created>2026-03-31</created>
  <tech-stack>Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, Zustand v4</tech-stack>
</meta>

## 1. 智能分析结论

### 1.1 应用类型
**结论**: 基于 SPA (单页应用) 体验的智能面板 (Dashboard)
**理由**: smart-feed 作为一个个人情报处理系统，需要提供流畅的信息流阅读体验（Digest 阅读）以及便捷的来源管理。用户在阅读日报、过滤信息和调整权重/反馈时属于连贯的探索和控制交互，SPA 模式能够减少页面切换的重绘，提供接近原生应用的流畅体验。

### 1.2 导航结构
**类型**: 侧边栏结构 (Side Nav)
**主导航**: 
- **今日日报 (Daily Digest)**: 默认首页，按主题流式展现今日 AI 摘要与原文回链。
- **信息源管理 (Sources)**: 来源列表、添加源、OPML 导入与系统来源状态维护。
- **历史归档 (Archive)**: 查看历史日期的 Digest 报告。
- **系统设置与调度设置 (Settings)**: 查看系统抓取/生成状态，调整偏好配置（如时间窗口、时区等）。

### 1.3 配色方案
**主色相**: 220° (Slate Blue / 沉稳蓝) 
**OKLCH 配置**:
```css
@theme inline {
  --color-primary: oklch(0.55 0.15 240);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-muted: oklch(0.92 0.02 240);
  --color-border: oklch(0.85 0.02 240);
}
```
**理由**: 偏冷色调的蓝色传达出人工智能、专业化处理和可信赖的质感，适合帮助知识工作者冷静思考，减少高频信息流带来的焦虑与过载。

---

## 2. 设计系统

### 2.1 设计令牌 (Tailwind CSS v4)
基于 Tailwind v4 inline theme 机制设定标准间距和圆角体系：
```css
@theme inline {
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-4: 1rem;
  --spacing-6: 1.5rem;
  --spacing-8: 2rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
}
```

### 2.2 字体配置
```css
--font-sans: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
```
**重要约束**: 不使用 Google Fonts！仅使用系统自带无衬线字体栈，确保应用在国内加载畅通无阻且无额外的隐私审查负担。

---

## 3. 页面布局

**响应式断点:**
| Name | Width | Layout |
|------|-------|--------|
| Mobile | <640px | 单列结构，顶部标题栏 + 侧边滑动抽屉 (Sheet) 提供导航。重点适配单手滑动阅读 Digest。 |
| Tablet | 640-1024px | 窄边折叠侧边栏 (Collapsed Sidebar) + 主内容区。 |
| Desktop | >1024px | 固定左侧边栏 (Full Sidebar, 240px) + 中心阅读区（最宽限制于 800px 居中以确保行长适合阅读）。 |

---

## 4. 组件规格

采用 `shadcn/ui` 库作为核心体系并做针对性扩展：
- **Base**: `Button`, `Badge` (标记 source 状态或 AI 归类的标签), `Card` (单独封装 Digest 条目卡片), `Avatar` (展示源站点 favicon)。
- **Form**: `Input`, `Textarea`, `Form` (结合 React Hook Form + Zod v4), `Switch` (源配置的启停开关)。
- **Layout**: `Dialog` (用于 OPML 文件系统导入和新增源入口), `ScrollArea`, `Separator`。
- **Navigation**: `Tabs` (今日/分类 切换视图), `Tooltip` (对简写的操作图标提供说明)。
- **Feedback**: `Skeleton` (新闻流和 AI 加载过程中的结构骨架), `Sonner` (用于全局非阻塞提示：抓取触发成功、通知发送等)。
- **定制化排版 UI**: 在 Digest 卡片内对 `evidence_snippet` 提供定制化的 Quote 块级样式标记。

---

## 5. 状态管理

采用 `Zustand` 搭配 `persist` 中间件，支持本地优先 Mock 机制，为 UI 组件层和 API 联调构建缓冲：

```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { MOCK_SOURCES } from '@/data/mock'

interface AppState {
  useMockMode: boolean
  setMockMode: (mock: boolean) => void
  sources: any[]
  addSource: (url: string) => void
  toggleSourceStatus: (id: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      useMockMode: true,  // 默认开启，确保持续可用
      sources: MOCK_SOURCES, // 提供初始富数据
      setMockMode: (mock) => set({ useMockMode: mock }),
      addSource: (url) => set((s) => ({
        sources: [...s.sources, { id: crypto.randomUUID(), identifier: url, status: 'active', weight: 1 }]
      })),
      toggleSourceStatus: (id) => set((s) => ({
        sources: s.sources.map(source => source.id === id ? 
          { ...source, status: source.status === 'active' ? 'paused' : 'active' } : source)
      }))
    }),
    { name: 'smart-feed-storage', storage: createJSONStorage(() => localStorage) }
  )
)
```

---

## 6. 功能独立原则

为了在全链路 API 建设完成前依然保持界面高可用，严格遵循以下特性独立策略：

1. **无阻塞依赖设定**: 本系统为单用户情报工具，无注册登录机制阻塞。若尚未配置真实数据库连接，默认启用 Zustand 中 `useMockMode=true`，保证在没有后台服务的情况下也可进行交互评测和样式微调。
2. **Mock by Default, Real When Ready**: 在 `features` 包装逻辑组件中：
   ```tsx
   if (useMockMode) return <MockDigestFeed />;
   return <RealDigestFeed />;
   ```
3. **视觉指示器警告**: 在左侧导航底部必须始终存在一个 `🎭 Demo Mode` 的提醒挂件 (仅在 Mock=true 时显示)，引导用户前往部署联调真实环境。

---

## 7. Mock 数据

必须在应用初始化阶段附带 `@/data/mock.ts` 中至少包含的数据（Rich Mock Data）：

**7.1 MOCK_SOURCES (8-10 个记录)**
- 类型：技术、经济、管理、独立博客。
- 状态组合包含 `status: 'active'`, `status: 'paused'`, `status: 'blocked'`。

**7.2 MOCK_DIGEST (2份完整的编排报告)**
- 日期：包含 `daily:2026-03-30` 和 `daily:2026-03-31`。
- 层级结构：具备 Category (如 "技术前沿") > Articles。
- 卡片包含：`oneline` 短语，3 句 `points`，以及最核心的要求：必须存在真实的 `evidence_snippet` 和可点击的 `original_url`。

---

## 8. 核心功能实现 (P0 UI)

### 8.1 来源管理模块 (`/sources`)
- **列表视图**: 表格级展示。列：源 Logo、规范化 URL(`source_trace_id`)、源状态（Switch 控件：活跃/暂停）。
- **增加/导入操作**: Header 设统一触发点 "Add RSS"。提供 Tabs: [单个引入] / [OPML 文件拖拽引入]。
- **空状态**: 无数据时渲染巨幅虚线框加上 Lucide 图标的引导层 "Drop your OPML file here..."。

### 8.2 今日日报区 (`/digest`)
- **主题分组排版 (Grouped Feed)**: 依照 AI 分类标签 (`category`) 渲染 Section Title (如：`## 宏观经济`)。
- **可追溯性卡片 (Traceable Card Design)**:
  - **头部**: 原文标题 (不可点击) + `Avatar` 来源显示 + 右上角放置外链跳转按钮 (`original_url`)。
  - **躯干**: 第一句为 `oneline` 强调；随后 `List` 排版展示 `points`；再给出一句话 `reason` 的强调底色。
  - **底部追溯**: 块引用 (Blockquote) 样式专属渲染 `evidence_snippet`。这是确立用户信任度的绝对关键点！
  - **交互占位**: 在每张卡片右下方布局出轻拟物的 "👍 有用的 / 👎 没用的 / 🚫 减少此源推送" 的反馈入口组（前期可仅展示或挂接 Mock 气泡反馈）。

---

## 9. 交互模式

- **骨架屏呈现模型 (Skeleton Loading)**: 数据拉取期间，Digest Feed 直接生成 3 篇卡片宽度的渐变闪动占位框，而不是全局 Loading Spinner。
- **空状态呈现 (Empty States)**: 用户新注册无 Feed 阶段或今日还没 Digest 生成时，需要配文说明："仍在为您从 10 个信息源中过滤信息，去泡杯咖啡吧~" 甚至可以提供 `强行生成 Digest` 的占位按钮。
- **用户反馈模式**: 当发生来源停用或点击"没用"进行 Feedback 时，应使用 `Sonner` 发送 "已记录偏好，下一轮报告将生效" 以构建良好的行为闭环。不需要阻塞 UI，允许乐观更新。

---

## 10. 无障碍性 (Accessibility)

- [ ] 表单提交入口与 Feed 内重要按钮都支持 `tabIndex` 焦点访问机制。
- [ ] UI Badge 的背景与字色必须对比度测试达标 ( WCAG AA，>4.5:1 )，特别是不可读色的浅灰被淘汰，深蓝、墨等为主导。
- [ ] 仅靠颜色辨别的内容必须增加对应文案的 `aria-label` 与 Tooltip，对于"活跃"/"暂停" 按钮，必须提供 "Active" 文本字样辅助，而不只有绿灯黄灯展示。

---

## 11. 扩展点 (Extension Points)

- **Database API 迁移**: Zustand 状态中包含的动作 `addSource`, `toggleStatus` 后期通过 SWR 或 React Server Actions 极速对接到对应的 API (`/api/sources`) 路由而不重制大片逻辑。
- **反馈 API 集成 (US-5.1 ~ US-5.4)**: `useful`, `useless` 行为现阶段只是操作 Zustand 中单条记录的状态并弹出 Toast；后期它对应的就是调用 `POST /api/feedback { target_type: 'content', signal: 'useful' }`，具备良好的前置铺垫。

---

## 12. 验收检查清单

- [ ] 项目中 Tailwind CSS v4 的 OKLCH 配色变量完整导入？
- [ ] 本地不用配环境，运行直接能够借助 Mock Store 看见包含图文架构的源列表、含 "evidence snippet" 的日报界面？
- [ ] 界面排版是否体现了重文字、轻装饰的严肃“阅读板”风格，UI 尽量克制不解释规则（如不写“支持按状态筛选”废话，直接显示操作层结构）？
- [ ] 顶部或侧边固定状态下是否清晰提供了 "Demo Mode" 指示器便于后期区分真实链路？
- [ ] 卡片中的摘要内容及引用证据之间具备明显的层级差别以明确展现【AI论点】 VS 【原文论据】？
