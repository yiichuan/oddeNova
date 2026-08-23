# 自建应用内中文 Strudel 学习文档翻译,而非链接上游或贡献 upstream

## 决定

strudel.cc 的学习类文档(Workshop 教程 6 篇,以及 Making Sound / Pattern
Functions / More / Understand 四个参考分组共约 34 篇,合计约 40 篇)没有官方
或社区认可的中文版。我们在 oddeNova 内部自建一份中文翻译,渲染在一个新的
独立页面(新路径,非 modal),不依赖路由库——在 `main.tsx` 里按
`window.location.pathname` 分支,命中时完全跳过 `App` 的挂载(不初始化
session/persona/IndexedDB)。页面双语,`t()`/`zh` 判断展示语言,"学习"按钮
统一指向这个内部页面。每篇内容是独立 JSX 组件(内容形态不同,不做数据驱动
的通用渲染器),按官方 `SIDEBAR` 分组(Workshop / Making Sound / Pattern
Functions / More / Understand)组织在新顶层目录 `src/learn/`。刻意不纳入
官方 `SIDEBAR` 里的 `Development` 分组——那是面向"在自己项目里集成
Strudel"的开发者向导,不是 oddeNova 音乐创作用户会用到的学习内容。

页面里的代码示例是**可编辑、可播放**的,不是静态展示——`src/learn/components.tsx`
的 `CodeBlock` 用 `@strudel/codemirror` 的 `StrudelMirror` 类,给每个代码
示例各自构造一个独立的编辑器+调度器实例(与 strudel.cc 自己的 `MiniRepl`
组件同款做法),而不是复用 `src/services/strudel.ts` 里那个绑定着会话/聊天
状态的全局单例 `strudelService`。所有实例共享同一个 superdough
`getAudioContext()` 单例作为输出(从不构造新的 AudioContext,符合
CLAUDE.md 的 AudioContext 约束),多实例之间靠 `StrudelMirror` 自带的
"solo" 机制(一个 `start-repl` DOM 事件)互斥——点开一个的播放会自动停掉
页面上其他正在播放的代码块。共享的模块加载 + 采样库加载被提到
`src/learn/mini-repl-engine.ts` 的模块级单例 `getMiniReplPrebake()` 里,
只加载一次,所有代码块实例复用同一个 promise。

## 背景与理由

Strudel 官方站点本身有 `/de/workshop/...` 这样的官方语言前缀基础设施,理论
上可以把中文翻译贡献回 `tidalcycles/strudel` upstream,让所有 Strudel 用户
受益。我们选择不这样做:upstream PR 节奏不由我们控制,而这次需求是解决
oddeNova 中文用户的即时学习体验,不是维护一份通用的 Strudel 官方文档。

自建翻译带来两个成本,是有意接受的:

1. **准确性**:AI/人工翻译技术文档容易在术语、示例代码上出错。
2. **维护漂移**:strudel.cc 原文更新后,我们的翻译不会自动同步,只能人工跟进。

oddeNova 本身与 Strudel 同为 AGPL-3.0 授权,翻译衍生内容在许可证上是兼容
的。为应对上述两个成本,**每一章节页面底部都带翻译声明**(翻译日期 + 对应
strudel.cc 原文链接),而不是只在入口页放一次——这样用户读到任意一章都能
就近核对原文,且各章节的翻译/校对时间可以独立标注、独立更新。

## 后果

- 这份中文内容**不会**随 strudel.cc 原文自动更新,需要人工定期核对是否过时。
- 如果将来决定把翻译贡献回 upstream,可以复用这里已翻译的内容作为初稿,但
  upstream 版本的维护责任、审核流程与这里完全独立,不要假设两边会自动同步。
- **不要**给这个页面接入路由库(react-router 等)——项目里已有
  `window.location.pathname` 分支的先例(见 `demo-config.ts` 的 demo/
  presentation 模式),新增路由库会引入不必要的依赖。
- **不要**为了"复用主 App 的播放逻辑"而让代码块接入 `strudelService`——那个
  单例是为聊天/会话状态设计的(一份 code、一份 session),而一个 docs 页面
  里天然会有几十个独立代码示例,需要的是"多个独立 REPL 实例、共享一个
  AudioContext"这种形状,`StrudelMirror` 本身已经原生支持,不需要在
  `strudelService` 之上做多实例改造。
