/**
 * AI smoke test 脚本
 * 用于通过 Bun 直接验证 src/ai/client.ts 的真实初始化与调用链路。
 *
 * 用法:
 *   bun src/ai/smoke.ts
 *   bun src/ai/smoke.ts basic
 *   bun run ai:smoke -- heavy
 */

import { getAppEnv } from "../config";
import { createLogger } from "../utils";
import { type AiTaskKind, createAiClient } from "./client";
import type { AiPromptInput } from "./prompts";

type SmokeMode = AiTaskKind | "all";

const logger = createLogger("AiSmoke");

const contentEn = `Executive Summary
Bitcoin remains rangebound between $60k and $70k, while URPD shows a dense overhead supply cluster from $80k to $126k that likely requires either deeper price discount or more time to redistribute.
Total Supply in Loss sits near 8.4M BTC, echoing the Q2 2022 structure, when roughly 3M BTC needed to be redistributed before the market could reclaim its cycle mid-line.
LTH Realized Loss has climbed to $200M/day since November 2025, confirming active capitulation, while a cooldown below $25M/day remains the key threshold for base formation.
Coinbase Spot CVD has turned marginally positive, suggesting spot buyers are starting to absorb sell-side pressure, though demand remains well below the levels typically seen at durable lows.
Corporate treasury flows are becoming more concentrated, with Marathon distributing roughly 15k BTC and Strategy remaining the only consistent large-scale buyer.
The Perpetual Market Directional Premium has compressed back toward neutral and slightly below zero, reflecting a reset in long-biased leverage and cooling speculative appetite.
Perpetual positioning is now far less momentum-driven, with bullish exposure being unwound and short-side interest re-emerging, leaving futures more balanced but also more cautious.
Implied volatility continues to soften across the curve, suggesting options markets are pricing a calmer near-term environment and reduced demand for volatility exposure.
Downside skew is beginning to rebuild, signalling some return in protective positioning, though levels remain well below those typically associated with stronger hedging demand.
Gamma positioning has flipped back into supportive territory, reducing downside convexity and pointing to a more stable near-term dealer setup after the recent negative gamma regime.`;

const contentZh = `三十岁前后，有一种感觉很难描述——

工作是有的，哪怕不算喜欢，也还算稳定。关系也不是没有，朋友、恋人、家人，日子能过。手机里随时有人可以联系，日历上也不缺事情。

可是，总觉得哪里不对。

像是站在一片没有边界的水里——脚踩不到底，也够不到岸。一切都模糊的，包括"我到底想要什么"、"我现在走的这条路对不对"、"那些同龄人好像都安顿好了，为什么我还没有"。

这不是抑郁，也不是焦虑发作。你能正常起床上班，能参加朋友聚会，能假装没事地聊天。但每隔一段时间，这种漂浮感就会冒出来，悄悄地问你：你真的知道自己在哪里吗？

这种感觉有一个名字。而且，它比你想象的更普遍。

全球研究：几乎一半的年轻人都在经历这件事
2025 年 12 月，英国心理学会（British Psychological Society）发布了一项国际研究的结果。

研究由伦敦摄政大学的奥利弗·罗宾逊（Oliver Robinson）教授主导，调查了来自八个国家的 2200 多名 18 到 29 岁的年轻人。他们想知道：所谓的"四分之一人生危机"（quarter-life crisis），是英语世界特有的现象，还是一种更普遍的人类经历？

结果很有力。

全球范围内，有 40% 到 77% 的年轻人自我报告正在经历一种"危机状态"。 其中印度尼西亚最高，超过四分之三的年轻人（77%）表示正在经历；土耳其紧随其后；英国大约是 43%，希腊最低，也有约 40%。

怎么算是"危机"？研究者给出了标准：一个人需要同时认识到自己正处于「高度压力、困难和不稳定」的时期，并感受到自己处于人生的某个转折点。这种状态的持续时间，通常在一到两年之间。

最常被提及的触发因素，按出现频率排列：职业转变、经济困难、学业压力、家庭冲突。而最常出现的情绪体验，是：焦虑、担忧、情绪低落、情感麻木，以及对自我的负面评价——觉得自己是个失败者，觉得自己毫无价值。

将近一半的英国受访者（48%）报告了这种负面的自我评价。

但罗宾逊教授强调了一件重要的事：这些「危机时期」是成年早期心理发展的关键窗口。它们不是病，而是一种发展性的压力信号——你不是出了问题，而是正在某个真实的转折点上。

为什么偏偏是三十岁前后？
如果只看统计数字，这个问题有点奇怪：为什么一到三十岁，感觉就特别难熬？

美国发展心理学家杰弗里·阿内特（Jeffrey Arnett）在 2000 年提出了「成年初显期」（emerging adulthood）这一概念，它给了我们第一个重要的线索。

阿内特在《美国心理学家》杂志发表的那篇文章，是近 30 年来被引用次数最多的发展心理学论文之一。他的核心观察是：过去半个世纪里，成年的时间表发生了根本性的变化。

在工业化社会，二十岁出头就完成「成年三件套」（稳定工作、婚姻、孩子）的模式已经成为历史。现在，大多数人把这些过渡推迟到了 30 岁前后。他们在二十几岁时，处于一种持续的探索状态——不断尝试不同的工作方向、不同的关系模式、不同的生活方式。

阿内特用五个词来描述这个阶段的特征：

• 身份探索：你还在尝试不同的可能性

• 不稳定性：住所、工作、关系都可能反复变动

• 自我聚焦：你比人生任何其他阶段都更在乎"我想要什么"

• 感觉中间：既不是青少年，也还没成为真正意义上的成年人

• 可能性：未来还是开放的，但这种开放本身也是压力

这最后两点，正是漂浮感的来源。

你不是卡住了，你是处于一个真实存在的"中间状态"。 人类历史上第一次，有一整个世代的年轻人需要在 20 到 30 岁之间，面对一个没有固定剧本的发展阶段。以前父辈经历的路，你走不了；未来要走的路，还没有被前人走出来。

当你在水里漂，可能不是因为你游泳技术差，而是因为这片水，本来就没有底。

但漂浮感不只是"阶段问题"：社会时钟的隐性压力
解释漂浮感，只讲「成年初显期」还不够。因为漂浮感里，有一种特殊的焦虑成分——一种「我是不是落后了」的焦虑。

这种焦虑，来自一个叫做「社会时钟」（social clock）的东西。

1965 年，美国社会心理学家伯尼斯·纽加滕（Bernice Neugarten）提出了这个概念。她的观察是：每一种文化，都有一张隐性的时间表，规定了人应该在什么年龄达到什么里程碑——什么时候上学、工作、结婚、生孩子、退休。

这张时间表没有人明说，但它无处不在。你从小看着父母的生活轨迹长大，看着亲戚在聚会上的互相比较，看着同学发的朋友圈——它就这样悄悄内化进了你对「正常人生」的预期里。

纽加滕发现：偏离社会时钟，会导致焦虑、羞耻感，以及一种与同龄人的疏离感。 你不是在跟某个具体的人比较，你是在跟那张内化在脑子里的「应该」较劲。

问题是，今天的社会时钟正在经历一场前所未有的错位。

数据很能说明问题：在美国，1890 年男性首次结婚的中位年龄是 26.1 岁，女性是 22 岁；到了 2023 年，这两个数字分别变成了 30.2 岁和 28.4 岁。社会时钟已经在客观上推迟了——但问题是，旧的时钟并没有从人们心里被卸载下来。

父母那一代的「正常」仍然活在家庭饭桌上、七大姑八大姨的追问里，活在同学群的隐性比较里，活在你刷到朋友圈里那些晒婚礼晒孩子晒升职的瞬间里。

于是出现了一种现代特有的撕裂：你的实际处境告诉你，三十岁漂着是正常的；但你内心深处的时钟告诉你，你已经「晚了」。

这两个声音同时存在，正是漂浮感变得特别消耗人的原因。

数据说：你不是出问题了，而是正处于发展的「碎片期」
2011 年，科罗拉多州立大学的曼弗雷德·迪尔（Manfred Diehl）和伊丽莎白·海（Elizabeth Hay）发表了一项研究，专门考察不同年龄段的人，「自我概念」是怎样组织的。

所谓「自我概念」，简单说就是你对「我是谁」这个问题的回答——包括你是什么样的人、你在不同角色中有什么特质。心理学家用两个维度来描述它：自我概念分化度（你在不同角色中的自我有多不同）和自我概念清晰度（你对自己的认识有多稳定和清楚）。

他们通过聚类分析，在样本中找到了五种不同的自我组织模式：

• 「自我确定型」：自我清晰、稳定，内在整合度高

• 「从容型」：自我边界清楚，不同角色较为统一

• 「碎片化型」：自我概念碎片化，但主观上不觉得困惑

• 「困惑型」：觉得困惑，但自我形象相对一致

• 「碎片化且困惑型」：两种状态叠加，自我既碎片又不清晰

研究的关键发现是：年轻人更集中在「碎片化且困惑」这一组，而年长的成年人则更集中在「自我确定」这一组。

更重要的是，他们验证了这种模式与心理健康的关系：「自我确定型」的人拥有最高的积极心理健康水平和最低的消极心理健康水平；「碎片化且困惑型」则相反。

这听起来像坏消息，但请注意这个研究最核心的含义：这不是你的个人问题，而是一条有规律的发展轨迹。 年轻成年人本来就更倾向于处于自我碎片化和困惑的状态；而随着年龄和经历的积累，这种状态会自然地朝向更整合、更清晰的方向移动。

漂浮感，不是你失败了。它是你正处于人生自我整合过程中的一个必经地带。

漂浮感里，藏着一个发展信号
如果说成年初显期是漂浮感的结构性来源，社会时钟是它的文化压力来源，那么自我概念的碎片化，就是它真实发生在你内心的心理学机制。

三件事加在一起，构成了那个「说不清楚」的感觉：

你知道自己在探索，但探索的感觉让你觉得自己「还没长大完」；你感受到来自社会时钟的压力，但又说不清楚那个「应该」到底是谁规定的；你对自己是谁还没有清晰的答案，但又不知道该从哪里开始整合。

这三层叠加起来，就是漂浮。

但罗宾逊的研究给了我们一个重要的转折点：那些经历过所谓「四分之一人生危机」的年轻人，在事后回望这段时期，大多数人把它描述为一段有意义的成长催化剂，而不是单纯的痛苦经历。

危机，是因为它让人不舒服。有意义，是因为它迫使你真实地面对那些平时可以回避的问题：我真正想要的是什么？我现在的生活，有多少是我自己选择的，有多少是「应该」强加给我的？

漂浮感是个信号，它不是在告诉你「你有问题」，而是在说：你快要走到一个需要真正做选择的地方了。
  `;

const defaultInput: AiPromptInput = {
  cleanedMd: contentEn,
  originalUrl: "https://example.com/smoke-test",
  sourceName: "AI Smoke Test",
  title: "验证 src/ai/client.ts 是否可正常运行",
};

function parseSmokeMode(rawMode: string | undefined): SmokeMode {
  if (rawMode === undefined) {
    return "all";
  }

  if (rawMode === "basic" || rawMode === "heavy" || rawMode === "all") {
    return rawMode;
  }

  throw new Error(
    `[ai/smoke] Unsupported mode "${rawMode}". Expected one of: basic, heavy, all.`,
  );
}

async function runTask(
  client: ReturnType<typeof createAiClient>,
  kind: AiTaskKind,
): Promise<void> {
  logger.info("Running AI smoke task", {
    kind,
    resolvedConfig: client.resolveAiTaskConfig(kind),
  });

  const result =
    kind === "basic"
      ? await client.runBasicAnalysis(defaultInput)
      : await client.runHeavySummary(defaultInput);

  console.log(
    JSON.stringify(
      {
        kind,
        result,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = parseSmokeMode(process.argv[2]);
  const env = getAppEnv();
  const client = createAiClient({ env });

  logger.info("AI smoke test started", {
    apiKeyConfigured: env.openRouterApiKey !== null,
    basicModel: env.aiBasicModel,
    heavyModel: env.aiHeavyModel,
    mode,
    runtimeState: client.getAiRuntimeState(),
  });

  if (mode === "all") {
    await runTask(client, "basic");
    await runTask(client, "heavy");
  } else {
    await runTask(client, mode);
  }

  logger.info("AI smoke test completed", { mode });
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error("AI smoke test failed", {
    error: message,
    stack,
  });
  process.exitCode = 1;
});
