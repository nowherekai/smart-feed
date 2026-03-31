type DigestRenderableSummary = {
  oneline: string;
  points: string[];
  reason: string;
};

type DigestRenderableItem = {
  contentTraceId: string;
  evidenceSnippet: string;
  originalUrl: string;
  sourceName: string;
  sourceTraceId: string;
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

function sanitizeInlineText(value: string): string {
  return value.replace(/\r?\n+/g, " ").trim();
}

function sanitizeBlockText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function renderItem(item: DigestRenderableItem): string {
  const lines = [
    `### ${sanitizeInlineText(item.title)}`,
    `> ${sanitizeInlineText(item.summary.oneline)}`,
    "",
    "**关键要点**:",
    ...item.summary.points.map((point) => `- ${sanitizeInlineText(point)}`),
    "",
    `**关注理由**: ${sanitizeInlineText(item.summary.reason)}`,
    "",
    `来源: ${sanitizeInlineText(item.sourceName)} (\`${sanitizeInlineText(item.sourceTraceId)}\`)`,
    `内容追踪: \`${sanitizeInlineText(item.contentTraceId)}\``,
    `原文: [原文链接](<${item.originalUrl}>)`,
    `证据: ${sanitizeBlockText(item.evidenceSnippet)}`,
  ];

  return lines.join("\n");
}

export function renderDigestMarkdown(input: RenderDigestMarkdownInput): string {
  const header = `# [smart-feed] 日报 ${input.digestDate}`;

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
