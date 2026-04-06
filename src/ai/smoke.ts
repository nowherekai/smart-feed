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

const contentEn = `# A “diff” tool for AI: Finding behavioral differences in new models

Mar 13, 2026

[Read the paper](https://arxiv.org/abs/2602.11729)

![A “diff” tool for AI: Finding behavioral differences in new models](https://www-cdn.anthropic.com/images/4zrzovbb/website/710b64c2542329ce05316098b4e405bb1c11e4d4-1000x1000.svg)

Every time a new AI model is released, its developers run a suite of evaluations to measure its performance and safety. These tests are essential, but they are somewhat limited. Because these benchmarks are human-authored, they can only test for risks we have already conceptualized and learned to measure.

This approach to safety is inherently *reactive*. It’s effective at catching known problems, but by definition, it's incapable of discovering “unknown unknowns”—the novel, emergent behaviors that pose some of the most subtle risks in new models. Auditing a new model from scratch is like being handed a million lines of code and told to “find the security flaws.” It’s an almost impossible task when you don’t know what you’re looking for.

In software engineering, whenever a program is updated, developers face this exact problem of identifying a small, critical change within a vast sea of code. This is why “[diff](https://en.wikipedia.org/wiki/Diff)” tools were invented. No programmer would ever audit a million lines from scratch to approve an update; instead, they review only the 50 lines that have actually changed, as directed by their diff tool.

In recent years, AI safety researchers have started to apply this same principle to neural networks. This is known as [model](https://transformer-circuits.pub/2024/model-diffing/index.html) [diffing](https://transformer-circuits.pub/2024/crosscoders/index.html). Previous work has shown that model diffing is a powerful way to understand how models change during fine-tuning—for instance, to understand [chat model behavior](https://arxiv.org/pdf/2504.02922), reveal [hidden backdoors](https://transformer-circuits.pub/2024/model-diffing/index.html), or find [undesirable emergent behaviors](https://www.arxiv.org/pdf/2506.19823).

Our new [Anthropic Fellows](https://alignment.anthropic.com/2025/anthropic-fellows-program-2026/) research project extends model diffing to its most challenging and general use case: comparing models with entirely different architectures. By building a generic diff tool for AI models, we can stop searching for a needle in a haystack, and instead let the comparison automatically point us to potentially dangerous behavioral differences.

It's important to note that this method is not a silver bullet. A single diff can surface thousands of unique features (the basic units into which we decompose the model), and only a small fraction of these may correspond to meaningful behavioral risks. However, by acting as a high-recall screening tool, it allows us to identify areas in which the models may diverge.

Among the thousands of candidates our tool flagged, we've identified and validated several concepts that act like switches for specific model behaviors.1 For example, we discovered:

-   A **“Chinese Communist Party Alignment” feature** found in the Qwen3-8B and DeepSeek-R1-0528-Qwen3-8B models. This controls pro-government censorship and propaganda in these Chinese-developed models, and is absent in the American models we compared them against.
-   An **“American Exceptionalism” feature** found in Meta’s Llama-3.1-8B-Instruct. It controls the model’s tendency to generate assertions of US superiority, a control absent in the Chinese model it was compared against.
-   A **“Copyright Refusal Mechanism” feature** exclusive to OpenAI’s [GPT-OSS-20B.](http://gpt-oss-20b.it) It controls the model’s tendency to refuse to provide copyrighted material, a behavior absent in the model it was compared against.

To be clear, while our method identifies these model-exclusive features, it does not determine their origin. Such behaviors could be the result of deliberate training decisions on the part of the model developers, or they could emerge indirectly and unintentionally from the data the model was trained on. (We focused on open-source language models in this research as this was an Anthropic Fellows project.)


## **A bilingual dictionary for AI models**

Imagine you're the final editor for an award-winning encyclopedia. A team of writers has just handed you the complete manuscript for next year’s edition. The vast majority of the content is identical to the current, trusted version, but they’ve added new entries to reflect recent scientific and cultural developments. Your job is to vet this final product.

To do this efficiently, you wouldn't re-read the entire encyclopedia. Instead, you’d use a change tracker to isolate only the new entries, because these added sections are the only place new errors could have been introduced. This is model diffing in a nutshell. Specifically, this approach is known as “base-vs-finetune model diffing”. It's the perfect tool for when a new model is a modified version of a trusted previous one.

But we could raise the complexity. Imagine your company is releasing a new edition for a different country, adapting the American encyclopedia for a French audience. This new edition is mostly composed of the same trusted concepts from the original, but to make it relevant, the writers have added new articles on French history, culture, and political philosophy. These articles don’t exist in the original. As an editor, your primary goal is still the same: you want to use a change tracker to see the new articles, since these hold the highest risk for errors and bias. But in this case, your old tool is useless, because you need one that can work across languages.

This much more difficult challenge is akin to the problem of “cross-architecture model diffing”: comparing two models with different origins and different internal “languages”.

The original research tool for this kind of diffing, a [standard crosscoder](https://transformer-circuits.pub/2024/crosscoders/index.html), is like a basic bilingual dictionary. It’s good at matching existing words, knowing that “sun” in English is “*soleil*” in French. But it has a major flaw: it's so focused on finding connections that it [struggles to find words that are unique to one language.](https://transformer-circuits.pub/2025/crosscoder-diffing-update/index.html) When it encounters a word like the French *dépaysement* (the specific feeling of being in a foreign country), it tries to force an imperfect translation like ”disorientation.” By calling it a match, the tool wrongly signals to the editor, “this isn’t new; we’ve seen it before,” causing them to overlook a new article that requires careful review.

To solve this, we built a better bilingual dictionary: the **Dedicated Feature Crosscoder (DFC)**. Instead of one big dictionary that tries to match everything, our DFC is architecturally designed with three distinct sections:

1.  A **shared dictionary**: This is the main bilingual dictionary, mapping all the concepts that both languages understand, like “sun” (*soleil*) or “water” (*eau*).
2.  A **"French-only" section**: This is a dedicated section for words exclusive to French, where a unique cultural concept like *dépaysement* would be cataloged.
3.  An **"English-only" section**: This section is for words exclusive to English. It would contain unique concepts like *serendipity*—the idea of finding something good without looking for it—which has no single-word equivalent in French.

Because our bilingual dictionary has dedicated sections for words exclusive to each language, it avoids the trap of forcing an imperfect translation. As a result, new articles in the encyclopedia are correctly flagged as novel, allowing the editor to focus their review on the parts that need it most.

For a safety auditor, the DFC can identify "words" unique to a new AI model that may warrant closer review than those they've seen before.


## Steering the model

Once our method identifies a potential new feature, how do we know it actually controls the behavior we think it does? We can test this by artificially suppressing or amplifying the feature while the model runs, then observing how its output changes—a common technique known as “steering.”

If we have a feature that we believe is responsible for, say, censorship, we can suppress it while the model is generating a response. If the model's output consistently becomes less censored, we have evidence that we've found a true cause-and-effect relationship between that feature and the model's behavior. Conversely, we can also amplify the feature to see if the behavior becomes more pronounced.


## **Critical behavioral differences between major open-weight AI models**


### Llama-3.1-8B-Instruct vs Qwen3-8B

Motivated by recent findings suggesting that a model made by a Chinese company, DeepSeek's R1-70B, [refuses to answer questions](https://arxiv.org/pdf/2505.17441) about topics sensitive to the Chinese Communist Party, we first performed a diff between a model made by another Chinese company, Alibaba's [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B), and a model made by an American company, Meta’s [Llama-3.1-8B-Instruct](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct). In this diff, the DFC automatically isolated features corresponding to distinct, politically charged behaviors.

In Qwen, we found a “Chinese Communist Party alignment” feature, which represents rhetoric consistent with the party’s ideology. By suppressing this feature, we make the model willing to talk about the Tiananmen Square massacre (which it ordinarily refuses to discuss). By amplifying it, we can cause the model to produce highly pro-government statements

In Llama, we found a feature for “American exceptionalism.” When we amplify this feature, the model’s responses shift from balanced to strong assertions of American superiority. Suppressing it has no notable effect.

!

**Left:** On a prompt about Tiananmen Square, suppressing the Qwen-exclusive “CCP alignment” feature uncensors the model. Amplifying it causes the model to output highly pro-government statements.
**Right:** Amplifying the Llama-exclusive “American exceptionalism” feature causes the model to generate text aligned with narratives of American superiority. Suppressing it has no notable effect, so we omit it from the figure.


### GPT-OSS-20B vs DeepSeek-R1-0528-Qwen3-8B

We also compared a more powerful open-source model, OpenAI's [GPT-OSS-20B](https://huggingface.co/openai/gpt-oss-20b), to DeepSeek's model [DeepSeek-R1-0528-Qwen3-8B](https://huggingface.co/deepseek-ai/DeepSeek-R1-0528-Qwen3-8B).

In the GPT model, we found a unique **“**Copyright Refusal” feature, which directly corresponds to a key behavioral difference between the two models. Whereas DeepSeek readily attempts to produce copyrighted material when asked, GPT often refuses such requests. Suppressing this feature disables the refusal mechanism, and the model attempts to generate the requested material. (Note that this does not cause the model to output actual copyrighted text. Instead, it typically produces a short snippet that quickly degrades into hallucination.) Turning the feature up causes the model to over-refuse, making it believe that, for example, the recipe for a peanut butter and jelly sandwich is copyrighted and should not be shared.

In the DeepSeek model, we replicated our earlier finding by identifying another “CCP alignment” feature. It functions just like the one in Qwen, allowing censorship and propaganda to be turned up or down. This confirms our method can consistently identify similar behaviors across models.

!

**Left:** Suppressing the GPT-OSS-20B-exclusive “copyright refusal” feature disables its copyright refusal mechanism and causes it to attempt to output the lyrics to the song “Bohemian Rhapsody” (though it does so imperfectly). Turning the dial up causes the model to mistakenly believe the recipe for a peanut butter and jelly sandwich is copyrighted and refuse to output it.
**Right:** On a prompt about Tiananmen Square, the DeepSeek-exclusive “CCP alignment” feature functions just like the one found in Qwen. Turning the dial down causes it to output a more truthful version of events, while turning the dial up causes it to output highly pro-government statements.


## Conclusion

As AI models rapidly evolve, it’s not enough to know how well they perform on existing tests—we also need to understand how they are changing and what new risks they might introduce. Cross-architecture model diffing provides a new way to audit these systems by automatically flagging behavioral differences.

The “CCP alignment” feature found in the DeepSeek and Qwen models we examined is one example of a specific, relevant behavior that some models possess and others do not. This is exactly the kind of “unknown unknown” that traditional testing can miss, but that model diffing is designed to catch.

These findings are reasonably consistent. The CCP alignment feature was independently rediscovered five out of five times we tested the approach, and American Exceptionalism four out of five. While we haven't yet applied this method to frontier models, our early results suggest the DFC could become a useful part of the auditor's toolkit.

One particularly useful application would be to monitor models as they are updated. The sycophancy that [emerged in OpenAI’s GPT-4o](https://openai.com/index/sycophancy-in-gpt-4o/) in April 2025 was a concerning behavioral *change* from a previous version. It’s possible that a tool like ours, if used to “diff” the updated model and its previous version, could have automatically flagged the emergence of this new sycophantic behavior and allowed developers to intervene before it was released.

By focusing on the differences, we can audit AI more intelligently, directing our limited safety resources to the changes that matter most.
`;

const _contentZh = `三十岁前后，有一种感觉很难描述——

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

  throw new Error(`[ai/smoke] Unsupported mode "${rawMode}". Expected one of: basic, heavy, all.`);
}

async function runTask(client: ReturnType<typeof createAiClient>, kind: AiTaskKind): Promise<void> {
  logger.info("Running AI smoke task", {
    kind,
    resolvedConfig: client.resolveAiTaskConfig(kind),
  });

  const result =
    kind === "basic" ? await client.runBasicAnalysis(defaultInput) : await client.runHeavySummary(defaultInput);

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
