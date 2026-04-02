import { afterEach, expect, mock, test } from "bun:test";

import { logger } from "./logger";

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

afterEach(() => {
  setNodeEnv(originalNodeEnv);
});

test("logger.debug does not write in production", () => {
  setNodeEnv("production");
  const debugSpy = mock(() => undefined);
  const originalDebug = console.debug;
  console.debug = debugSpy;

  try {
    logger.debug("debug message", { contentId: "content-1" });
    expect(debugSpy).not.toHaveBeenCalled();
  } finally {
    console.debug = originalDebug;
  }
});

test("logger.debug still writes outside production", () => {
  setNodeEnv("test");
  const debugSpy = mock(() => undefined);
  const originalDebug = console.debug;
  console.debug = debugSpy;

  try {
    logger.debug("debug message", { contentId: "content-1" });
    expect(debugSpy).toHaveBeenCalledTimes(1);
  } finally {
    console.debug = originalDebug;
  }
});
