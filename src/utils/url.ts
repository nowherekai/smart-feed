/**
 * URL 处理工具模块
 * 负责 URL 的规范化（Normalization）和哈希计算。
 * 核心目标：确保指向同一内容的逻辑 URL 在数据库中具有唯一的规范表示，从而实现精准去重。
 */

import { createHash } from "node:crypto";

/** 规范化路径：移除末尾多余斜杠 */
function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

/**
 * 核心规范化逻辑
 * 执行以下操作以确保一致性：
 * 1. 协议和域名转小写。
 * 2. 移除 URL 锚点（#hash）。
 * 3. 移除默认端口号（80/443）。
 * 4. 移除路径末尾斜杠。
 * 5. 对查询参数（Search Params）进行按键名排序。
 */
export function normalizeUrl(url: string): string {
  const normalizedUrl = new URL(url);
  const protocol = normalizedUrl.protocol.toLowerCase();

  normalizedUrl.protocol = protocol;
  normalizedUrl.hostname = normalizedUrl.hostname.toLowerCase();

  // 锚点对内容唯一性没有影响，统一移除
  normalizedUrl.hash = "";

  // 移除标准端口
  if (
    (protocol === "http:" && normalizedUrl.port === "80") ||
    (protocol === "https:" && normalizedUrl.port === "443")
  ) {
    normalizedUrl.port = "";
  }

  // 路径规范化
  normalizedUrl.pathname = normalizePathname(normalizedUrl.pathname);

  // 参数排序：确保 ?a=1&b=2 和 ?b=2&a=1 结果一致
  const sortedParams = [...normalizedUrl.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }

      return leftKey.localeCompare(rightKey);
    },
  );

  normalizedUrl.search = "";

  for (const [key, value] of sortedParams) {
    normalizedUrl.searchParams.append(key, value);
  }

  return normalizedUrl.toString();
}

/**
 * 计算规范化 URL 的 SHA256 哈希值
 * 用于数据库中的唯一索引，提高去重查询效率。
 */
export function hashUrl(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

/**
 * 将 URL 收敛为适合日志输出的形式：
 * 保留协议、主机和路径，移除 query/hash，避免敏感参数泄露到日志。
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch {
    return url;
  }
}
