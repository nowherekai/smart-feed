import { expect, test } from "bun:test";

import { hashUrl, normalizeUrl } from "./url";

test("normalizeUrl canonicalizes host, ports, paths, hashes, and query order", () => {
  expect(normalizeUrl("HTTPS://Example.com:443/path/?b=2&a=1#fragment")).toBe(
    "https://example.com/path?a=1&b=2",
  );
  expect(normalizeUrl("http://EXAMPLE.com:80")).toBe("http://example.com/");
});

test("hashUrl is stable across equivalent URLs", () => {
  const left = hashUrl("https://example.com/path?b=2&a=1");
  const right = hashUrl("https://EXAMPLE.com:443/path/?a=1&b=2#hash");

  expect(left).toHaveLength(64);
  expect(left).toBe(right);
});
