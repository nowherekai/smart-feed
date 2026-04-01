/**
 * Worker 侧环境变量配置
 * 负责 bull-board 管理服务的监听地址与端口解析。
 */

export type WorkerEnv = {
  /** bull-board 监听地址，默认仅绑定本机回环 */
  bullBoardHost: string;
  /** bull-board 监听端口 */
  bullBoardPort: number;
};

const DEFAULT_BULL_BOARD_HOST = "127.0.0.1";
const DEFAULT_BULL_BOARD_PORT = 3010;

const WORKER_ENV_KEYS = ["SMART_FEED_BULL_BOARD_HOST", "SMART_FEED_BULL_BOARD_PORT"] as const;

let cachedWorkerEnv: Readonly<WorkerEnv> | null = null;
let cachedWorkerEnvSignature: string | null = null;

function parseOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseIntegerEnv(
  name: string,
  rawValue: string | undefined,
  defaultValue: number,
  range?: { min?: number; max?: number },
): number {
  const normalized = rawValue?.trim();

  if (!normalized) {
    return defaultValue;
  }

  if (!/^[+-]?\d+$/.test(normalized)) {
    throw new Error(`[workers/env] ${name} must be an integer, received "${rawValue}".`);
  }

  const parsed = Number.parseInt(normalized, 10);

  if (range?.min !== undefined && parsed < range.min) {
    throw new Error(`[workers/env] ${name} must be >= ${range.min}.`);
  }

  if (range?.max !== undefined && parsed > range.max) {
    throw new Error(`[workers/env] ${name} must be <= ${range.max}.`);
  }

  return parsed;
}

function getWorkerEnvSignature(): string {
  return WORKER_ENV_KEYS.map((key) => `${key}=${process.env[key] ?? ""}`).join("\n");
}

export function loadWorkerEnv(): WorkerEnv {
  return {
    bullBoardHost: parseOptionalString(process.env.SMART_FEED_BULL_BOARD_HOST) ?? DEFAULT_BULL_BOARD_HOST,
    bullBoardPort: parseIntegerEnv(
      "SMART_FEED_BULL_BOARD_PORT",
      process.env.SMART_FEED_BULL_BOARD_PORT,
      DEFAULT_BULL_BOARD_PORT,
      {
        min: 1,
        max: 65535,
      },
    ),
  };
}

export function getWorkerEnv(): Readonly<WorkerEnv> {
  const signature = getWorkerEnvSignature();

  if (!cachedWorkerEnv || cachedWorkerEnvSignature !== signature) {
    cachedWorkerEnv = Object.freeze(loadWorkerEnv());
    cachedWorkerEnvSignature = signature;
  }

  return cachedWorkerEnv;
}
