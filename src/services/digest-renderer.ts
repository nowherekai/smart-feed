import { createLogger } from "../utils";

type DigestRenderableSummary = {
  paragraphSummaries: string[];
  summary: string;
};

type DigestRenderableItem = {
  originalUrl: string;
  sourceName: string;
  summary: DigestRenderableSummary;
  title: string;
};

type DigestRenderSection = {
  items: DigestRenderableItem[];
  title: string;
};

type RenderDigestMarkdownInput = {
  digestDate: string;
  sections: DigestRenderSection[];
};
const logger = createLogger("DigestRenderer");

function sanitizeInlineText(value: string): string {
  return value.replace(/\r?\n+/g, " ").trim();
}

function renderItem(item: DigestRenderableItem): string {
  const lines = [
    `### ${sanitizeInlineText(item.title)}`,
    `> ${sanitizeInlineText(item.summary.summary)}`,
    "",
    ...item.summary.paragraphSummaries.map((point) => `- ${sanitizeInlineText(point)}`),
    "",
    `来源: ${sanitizeInlineText(item.sourceName)}`,
    `原文: [原文链接](<${item.originalUrl}>)`,
  ];

  return lines.join("\n");
}

export function renderDigestMarkdown(input: RenderDigestMarkdownInput): string {
  const header = `# [smart-feed] 日报 ${input.digestDate}`;

  logger.debug("Rendering digest markdown", {
    digestDate: input.digestDate,
    sectionCount: input.sections.length,
    totalItemCount: input.sections.reduce((count, section) => count + section.items.length, 0),
  });

  if (input.sections.length === 0) {
    return [header, "", "本次统计区间内没有符合条件的内容。"].join("\n");
  }

  const body = input.sections.flatMap((section) => {
    const sectionLines = [`## ${sanitizeInlineText(section.title)}`, ""];

    for (const [index, item] of section.items.entries()) {
      sectionLines.push(renderItem(item));

      if (index < section.items.length - 1) {
        sectionLines.push("", "---", "");
      }
    }

    return [...sectionLines, ""];
  });

  return [header, "", ...body].join("\n").trimEnd();
}

export type { DigestRenderableItem, DigestRenderableSummary, DigestRenderSection, RenderDigestMarkdownInput };
