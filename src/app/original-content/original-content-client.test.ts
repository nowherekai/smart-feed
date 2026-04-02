import { expect, test } from "bun:test";
import { buildOriginalContentUrl, filterOriginalContentSourceOptions } from "./original-content-client";

test("buildOriginalContentUrl omits default query params", () => {
  expect(
    buildOriginalContentUrl({
      page: 1,
      range: "all",
      sourceId: null,
    }),
  ).toBe("/original-content");
});

test("buildOriginalContentUrl writes non-default filters and page", () => {
  expect(
    buildOriginalContentUrl({
      page: 2,
      range: "last-week",
      sourceId: "source-2",
    }),
  ).toBe("/original-content?range=last-week&sourceId=source-2&page=2");
});

test("filterOriginalContentSourceOptions matches title and identifier", () => {
  const techCrunch = {
    id: "source-1",
    title: "TechCrunch",
    identifier: "https://techcrunch.com/feed",
    label: "TechCrunch",
  };
  const example = {
    id: "source-2",
    title: "Example",
    identifier: "https://feeds.example.com/rss",
    label: "Example",
  };
  const options = [techCrunch, example];

  expect(filterOriginalContentSourceOptions(options, "tech")).toEqual([techCrunch]);
  expect(filterOriginalContentSourceOptions(options, "feeds.example")).toEqual([example]);
});
