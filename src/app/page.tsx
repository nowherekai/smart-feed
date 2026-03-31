const sections = [
  "Next.js 全栈入口已就位",
  "BullMQ worker 骨架已接入",
  "后续优先推进 pipeline 子系统",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">smart-feed</p>
        <h1>项目骨架已生成</h1>
        <p className="lead">
          当前仓库已经切换为单体应用结构：Web 负责界面与 API，worker
          负责后台队列与 pipeline。
        </p>
      </section>

      <section className="panel">
        <h2>下一步建议</h2>
        <ul>
          {sections.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
