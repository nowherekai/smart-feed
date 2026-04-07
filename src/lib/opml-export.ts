type ExportableSource = {
  identifier: string;
  title: string | null;
  siteUrl: string | null;
};

const XML_ESCAPE_MAP: Record<string, string> = {
  '"': "&quot;",
  "&": "&amp;",
  "'": "&apos;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeXml(value: string): string {
  return value.replaceAll(/["&'<>]/g, (char) => XML_ESCAPE_MAP[char] ?? char);
}

function buildOutline(source: ExportableSource): string {
  const label = source.title?.trim() || source.identifier;
  const attributes = [
    'type="rss"',
    `text="${escapeXml(label)}"`,
    `title="${escapeXml(label)}"`,
    `xmlUrl="${escapeXml(source.identifier)}"`,
  ];

  if (source.siteUrl?.trim()) {
    attributes.push(`htmlUrl="${escapeXml(source.siteUrl)}"`);
  }

  return `    <outline ${attributes.join(" ")} />`;
}

export function buildSourcesOpml(sources: readonly ExportableSource[]): string {
  const outlines = sources.map(buildOutline);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    "    <title>smart-feed Sources</title>",
    "  </head>",
    "  <body>",
    ...outlines,
    "  </body>",
    "</opml>",
    "",
  ].join("\n");
}

export type { ExportableSource };
