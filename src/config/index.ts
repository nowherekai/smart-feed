/**
 * 配置模块聚合导出
 * 统一导出环境变量配置类型、单例对象及加载函数。
 */

export type { AiProvider, AppEnv } from "./env";
export { appEnv, getAppEnv, loadAppEnv } from "./env";
