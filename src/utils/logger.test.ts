import { afterEach, expect, mock, test } from "bun:test";

import { createLogger, logger } from "./logger";

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
    const logLine = String(debugSpy.mock.calls.at(0)?.at(0) ?? "");
    expect(logLine).toContain("[DEBUG] [App] debug message");
    expect(logLine).toContain('"contentId":"content-1"');
  } finally {
    console.debug = originalDebug;
  }
});

test("createLogger writes scoped log lines with serialized context", () => {
  const infoSpy = mock(() => undefined);
  const originalInfo = console.info;
  console.info = infoSpy;

  try {
    createLogger("WorkerMain").info("Worker server started", {
      host: "0.0.0.0",
      port: 3001,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logLine = String(infoSpy.mock.calls.at(0)?.at(0) ?? "");
    expect(logLine).toContain("[INFO] [WorkerMain] Worker server started");
    expect(logLine).toContain('"host":"0.0.0.0"');
    expect(logLine).toContain('"port":3001');
  } finally {
    console.info = originalInfo;
  }
});

test("createLogger omits empty context suffix", () => {
  const infoSpy = mock(() => undefined);
  const originalInfo = console.info;
  console.info = infoSpy;

  try {
    createLogger("WorkerMain").info("Worker server started");

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logLine = String(infoSpy.mock.calls.at(0)?.at(0) ?? "");
    expect(logLine).toContain("[INFO] [WorkerMain] Worker server started");
    expect(logLine).not.toContain("{}");
  } finally {
    console.info = originalInfo;
  }
});
