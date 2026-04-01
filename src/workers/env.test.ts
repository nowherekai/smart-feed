import { expect, test } from "bun:test";

import { getWorkerEnv, loadWorkerEnv } from "./env";

const WORKER_ENV_KEYS = ["SMART_FEED_BULL_BOARD_HOST", "SMART_FEED_BULL_BOARD_PORT"] as const;

function withEnv(overrides: Partial<Record<(typeof WORKER_ENV_KEYS)[number], string | undefined>>, run: () => void) {
  const previousValues = new Map<string, string | undefined>();

  for (const key of WORKER_ENV_KEYS) {
    previousValues.set(key, process.env[key]);
    const nextValue = overrides[key];

    if (nextValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextValue;
    }
  }

  try {
    run();
  } finally {
    for (const key of WORKER_ENV_KEYS) {
      const previousValue = previousValues.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

test("loadWorkerEnv applies bull-board defaults", () => {
  withEnv({}, () => {
    const env = loadWorkerEnv();

    expect(env.bullBoardHost).toBe("127.0.0.1");
    expect(env.bullBoardPort).toBe(3010);
  });
});

test("loadWorkerEnv reads explicit bull-board overrides", () => {
  withEnv(
    {
      SMART_FEED_BULL_BOARD_HOST: "0.0.0.0",
      SMART_FEED_BULL_BOARD_PORT: "4010",
    },
    () => {
      const env = loadWorkerEnv();

      expect(env.bullBoardHost).toBe("0.0.0.0");
      expect(env.bullBoardPort).toBe(4010);
    },
  );
});

test("getWorkerEnv caches by env signature and refreshes after env changes", () => {
  withEnv(
    {
      SMART_FEED_BULL_BOARD_HOST: "127.0.0.1",
      SMART_FEED_BULL_BOARD_PORT: "3010",
    },
    () => {
      const first = getWorkerEnv();
      const second = getWorkerEnv();

      expect(first).toBe(second);
    },
  );

  withEnv(
    {
      SMART_FEED_BULL_BOARD_HOST: "0.0.0.0",
      SMART_FEED_BULL_BOARD_PORT: "4010",
    },
    () => {
      const refreshed = getWorkerEnv();

      expect(refreshed.bullBoardHost).toBe("0.0.0.0");
      expect(refreshed.bullBoardPort).toBe(4010);
    },
  );
});

test("loadWorkerEnv rejects invalid bull-board port", () => {
  withEnv(
    {
      SMART_FEED_BULL_BOARD_PORT: "70000",
    },
    () => {
      expect(() => loadWorkerEnv()).toThrow("SMART_FEED_BULL_BOARD_PORT must be <= 65535");
    },
  );
});
