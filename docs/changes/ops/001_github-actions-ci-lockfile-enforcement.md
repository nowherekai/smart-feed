---
type: ops
number: "001"
date: 2026-03-31
title: GitHub Actions CI 锁定 Bun lockfile
tags: [github-actions, ci, bun]
related: []
---

# ops/001 GitHub Actions CI 锁定 Bun lockfile

## 执行概述
- 时间：2026-03-31
- 执行人：Codex
- 环境：GitHub Actions CI

## 步骤一：调整依赖安装命令
将 CI workflow 中的 `bun install` 改为 `bun install --frozen-lockfile`。

这样在 `package.json` 与 `bun.lock` 不一致时，CI 会直接失败，而不是在流水线里重新解析依赖后继续执行。

## 坑记录
### 问题
普通 `bun install` 会掩盖锁文件未同步提交的问题，导致本地和 CI 实际安装结果可能漂移。

### 解决方案
在 CI 中强制使用 `--frozen-lockfile`，把依赖描述和锁文件的一致性纳入校验范围。

## 后续 TODO
- [ ] 如需更严格的发布流程，可在 GitHub 分支保护规则中把 `CI / validate` 设为必过状态检查
