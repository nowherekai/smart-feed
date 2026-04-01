/**
 * 消息队列环境变量配置模块
 * 专门处理 Redis 连接相关的环境变量。
 */

type QueueEnv = {
  /** Redis 连接字符串 (如: redis://localhost:6379) */
  redisUrl: string;
};

/**
 * 加载队列配置并校验
 */
export function loadQueueEnv(): QueueEnv {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    throw new Error("[queue/env] Missing REDIS_URL. Add it to .env.local or .env before starting the worker.");
  }

  return {
    redisUrl,
  };
}
