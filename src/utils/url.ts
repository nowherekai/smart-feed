import { createHash } from "node:crypto";

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function normalizeUrl(url: string): string {
  const normalizedUrl = new URL(url);
  const protocol = normalizedUrl.protocol.toLowerCase();

  normalizedUrl.protocol = protocol;
  normalizedUrl.hostname = normalizedUrl.hostname.toLowerCase();
  normalizedUrl.hash = "";

  if (
    (protocol === "http:" && normalizedUrl.port === "80") ||
    (protocol === "https:" && normalizedUrl.port === "443")
  ) {
    normalizedUrl.port = "";
  }

  normalizedUrl.pathname = normalizePathname(normalizedUrl.pathname);

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

export function hashUrl(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}
