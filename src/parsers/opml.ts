import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type OpmlOutlineNode = {
  outline?: OpmlOutlineNode | OpmlOutlineNode[];
  text?: string;
  title?: string;
  xmlUrl?: string;
  xmlurl?: string;
  htmlUrl?: string;
  htmlurl?: string;
};

export type ParsedOpmlSource = {
  text: string | null;
  title: string | null;
  xmlUrl: string;
  htmlUrl: string | null;
};

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

function collectOutlines(node: OpmlOutlineNode, results: ParsedOpmlSource[]) {
  const xmlUrl = normalizeOptionalString(node.xmlUrl ?? node.xmlurl);

  if (xmlUrl) {
    results.push({
      text: normalizeOptionalString(node.text),
      title: normalizeOptionalString(node.title),
      xmlUrl,
      htmlUrl: normalizeOptionalString(node.htmlUrl ?? node.htmlurl),
    });
  }

  for (const child of toArray(node.outline)) {
    collectOutlines(child, results);
  }
}

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

  for (const outline of rootOutlines) {
    collectOutlines(outline, results);
  }

  return results;
}
