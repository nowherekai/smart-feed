# AGENTS.md

本项目是 Bun 驱动的 single TypeScript repo。

## Commands

```bash
bun install
bun run dev
bun run check
bun test
bun run build
```

## Conventions

- 统一使用 Bun，不使用 npm、pnpm、yarn、vite。
- 入口文件为 `src/index.ts`。
- Bun 会自动加载 `.env`，不要再引入 `dotenv`。
- 优先使用 Bun 原生能力；只有确实缺失时再引入额外框架或运行时替代品。

## Before Commit

```bash
bun run check
bun test
bun run build
```
