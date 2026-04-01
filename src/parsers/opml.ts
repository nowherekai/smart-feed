/**
 * OPML 解析器模块
 * 负责解析 OPML 文件格式，用于批量导入订阅源。
 * 包含：递归遍历嵌套的 outline 节点、提取 XML 地址及关联元数据。
 */

import { XMLParser } from "fast-xml-parser";

/** 初始化 XML 解析器，平铺属性以方便访问 */
const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

/** OPML 内部节点结构 */
type OpmlOutlineNode = {
  /** 嵌套子节点 */
  outline?: OpmlOutlineNode | OpmlOutlineNode[];
  text?: string;
  title?: string;
  /** RSS 地址，注意大小写变体 */
  xmlUrl?: string;
  xmlurl?: string;
  /** 站点首页地址 */
  htmlUrl?: string;
  htmlurl?: string;
};

/** 解析后的扁平化订阅源结构 */
export type ParsedOpmlSource = {
  text: string | null;
  title: string | null;
  xmlUrl: string;
  htmlUrl: string | null;
};

/** 辅助函数：确保值为数组 */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 递归收集所有包含 xmlUrl 的 outline 节点
 */
function collectOutlines(node: OpmlOutlineNode, results: ParsedOpmlSource[]) {
  const xmlUrl = normalizeOptionalString(node.xmlUrl ?? node.xmlurl);

  // 如果当前节点包含订阅链接，记录下来
  if (xmlUrl) {
    results.push({
      text: normalizeOptionalString(node.text),
      title: normalizeOptionalString(node.title),
      xmlUrl,
      htmlUrl: normalizeOptionalString(node.htmlUrl ?? node.htmlurl),
    });
  }

  // 递归处理子节点（支持 OPML 中的层级目录）
  for (const child of toArray(node.outline)) {
    collectOutlines(child, results);
  }
}

/**
 * OPML 解析入口函数
 */
export function parseOpml(opmlContent: string): ParsedOpmlSource[] {
  const parsed = parser.parse(opmlContent) as {
    opml?: {
      body?: {
        outline?: OpmlOutlineNode | OpmlOutlineNode[];
      };
    };
  };
  const rootOutlines = toArray(parsed.opml?.body?.outline);

  if (rootOutlines.length === 0) {
    throw new Error("[parsers/opml] Invalid OPML: no outline nodes found.");
  }

  const results: ParsedOpmlSource[] = [];

  // 从根节点开始递归收集
  for (const outline of rootOutlines) {
    collectOutlines(outline, results);
  }

  return results;
}
