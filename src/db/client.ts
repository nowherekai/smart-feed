/**
 * 数据库客户端模块
 * 负责初始化 postgres.js 客户端和 Drizzle ORM 实例，并提供延迟初始化（Lazy Loading）支持。
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseEnv } from "./env";
import * as schema from "./schema";

/**
 * 创建底层的 postgres.js 查询客户端
 */
function createSqlClient() {
  const databaseEnv = getDatabaseEnv();

  return postgres(databaseEnv.databaseUrl, {
    ssl: databaseEnv.databaseSsl ? "require" : false,
  });
}

/**
 * 创建 Drizzle ORM 数据库实例
 */
function createDb() {
  return drizzle(getSqlClient(), { schema });
}

type SqlClient = ReturnType<typeof createSqlClient>;
type Database = ReturnType<typeof createDb>;

// 内部单例缓存
let cachedSqlClient: SqlClient | null = null;
let cachedDb: Database | null = null;

/**
 * 获取 SQL 客户端单例
 */
export function getSqlClient(): SqlClient {
  cachedSqlClient ??= createSqlClient();
  return cachedSqlClient;
}

/**
 * 获取 Drizzle 数据库实例单例
 */
export function getDb(): Database {
  cachedDb ??= createDb();
  return cachedDb;
}

/**
 * 创建延迟加载代理
 * 只有在首次访问对象属性或方法时，才会调用工厂函数进行初始化。
 * 这对于避免在非数据库操作场景下建立不必要的连接非常有用。
 */
function createLazyProxy<T extends object>(factory: () => T): T {
  let instance: T | null = null;

  function getInstance(): T {
    instance ??= factory();
    return instance;
  }

  return new Proxy({} as T, {
    get(_target, property) {
      const target = getInstance();
      const value = Reflect.get(target, property);

      // 如果是函数，需要绑定 target 确保 this 指向正确
      return typeof value === "function" ? value.bind(target) : value;
    },
    ownKeys() {
      return Reflect.ownKeys(getInstance());
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(getInstance(), property);
    },
    has(_target, property) {
      return Reflect.has(getInstance(), property);
    },
  });
}

/**
 * 导出的 SQL 客户端代理（推荐使用）
 */
export const sqlClient = createLazyProxy(getSqlClient);

/**
 * 导出的数据库实例代理（推荐使用）
 */
export const db = createLazyProxy(getDb);

export type { Database };
