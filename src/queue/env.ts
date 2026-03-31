type QueueEnv = {
  redisUrl: string;
};

export function loadQueueEnv(): QueueEnv {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    throw new Error("[queue/env] Missing REDIS_URL. Add it to .env.local or .env before starting the worker.");
  }

  return {
    redisUrl,
  };
}
