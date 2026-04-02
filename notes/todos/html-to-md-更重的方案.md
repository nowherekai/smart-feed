可参考：

核心逻辑位于 claude_gen_summary.py 中的以下几个步骤：

  1. 结构化噪声剔除（Readability 算法）
  这是第一道工序。系统使用了 readability-lxml 库（类似于 Safari 浏览器的“阅读模式”技术）。
   * 做法：通过算法识别网页中的“正文区域”（Article Body），自动剔除网页的页眉（Header）、页脚（Footer）、侧边栏（Sidebar）、导航菜单（Navigation）以及无关的广告代码。
   * 结果：只保留文章的标题和核心内容块。

  2. 格式转换（HTML to Markdown）
  系统默认使用 html2text 库（或可选 pandoc）将 HTML 转换为 Markdown。
   * 做法：将 HTML 标签（如 <div>, <span>）转化为 Markdown 语法（如 #, **）。
   * 配置优化：
       * h.ignore_links = False：保留链接（方便后续回溯）。
       * h.skip_internal_links = True：跳过网页内部锚点（如“返回顶部”）。
       * h.mark_code = True：识别并保留代码块格式（对技术类新闻至关重要）。

  3. 自定义正则清理（Custom Regex Cleaning）
  在转换成 Markdown 后，脚本还会执行一个 clean_markdown_content 函数，针对 Markdown 语法产生的“视觉噪音”进行深度清理：
   * 表格清理：使用正则 re.sub(r'\|[\s\-:]*\|[\s\-:]*\|.*?\n', '', content) 删掉 Markdown 表格中的分隔符行（如 |---|---|），因为这些符号对 AI 理解意义不大且浪费 Token。
   * 符号脱水：去掉行首行尾的多余管道符 |，将连续的破折号 --- 替换为空白。
   * 空白压缩：合并多余的空行，确保文本紧凑。

  4. 长度截断与裁剪
  为了防止某些超长网页导致 API 费用爆炸或超出模型上下文限制：
   * 做法：代码中设置了 MAX_PROMPT_LENGTH = 20000 字符。如果清理后的 Markdown 仍然过长，脚本会自动从尾部截断，并添加 ... 标识。

  总结：为什么要这么做？
   1. 节省成本：清理掉网页的 CSS、JS 和冗余 HTML 标签后，文本体积通常能减少 60%-90%，大幅降低了调用 Claude/GPT 的费用。
   2. 提高准确度：LLM 不需要解析网页的 UI 元素。给它纯净的 Markdown，它能更专注于内容逻辑，生成更高质量的摘要。
   3. 防干扰：很多网页侧边栏包含“相关推荐”或“最新评论”，如果不清理，AI 可能会误把评论内容当成正文来总结。

  代码实现参考：
  在 claude_gen_summary.py 中，你可以看到 process_html_with_readability() -> convert_html_to_markdown() -> clean_markdown_content() 这个清晰的流水线。
