## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| `fetch` + `linkedom` + `turndown` | 依赖较轻，既能抓 HTML，又能做 DOM 去噪和 Markdown 转换，适合当前 Bun worker | 正文抽取仍是启发式规则，不是完整 Readability |
| 引入更重的正文提取器（如 Readability 生态） | 正文识别更强 | 依赖更重，当前 MVP 容易把 `Task 3` 扩大成内容提取专项工程 |

最终选择：**用服务层显式抓取 HTML，用 `linkedom` 做最小 DOM 清理与正文选择，再用 `turndown` 输出 Markdown**。先保证链路闭环和数据分层正确，正文抽取精度后续再迭代。

有需要可以改成Readability，先把流程跑通以后再考虑。
