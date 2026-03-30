# smart-feed

smart-feed 是一个 Bun 驱动的 single TypeScript repo，当前已补齐共享 Drizzle 数据库层与 Drizzle Kit 配置，供未来的 Next.js Web 与后台 worker 复用。

## 安装依赖

以下命令需要你手动执行，我没有替你运行：

```bash
bun install
```

## 数据库配置

在 `.env` 中至少配置：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/smart_feed
DATABASE_SSL=false
```

其余业务时区配置可参考 `.env.example`。

## Drizzle 命令

在你手动安装依赖后，可使用：

```bash
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
```

`src/db/schema.ts` 是唯一 schema 源；`src/db/client.ts` 导出共享 `db` 与 `sqlClient`，供未来的 Next.js Web 和 worker 直接复用。

## 本地运行

```bash
bun run dev
```

This project was created using `bun init` in bun v1.3.10. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
