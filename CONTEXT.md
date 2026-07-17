# oddeNova

oddeNova 是一个用自然语言驱动 Strudel 音频引擎的 AI 音乐创作工具。本文件登记项目专属的领域词汇——只收本项目语境下有特定含义的词,通用编程概念不收。

## Language

**Agent turn**:
一次完整的 agent 执行周期:一条指令进入 → LLM 生成 → 播放并落库。是 [App] 把一条用户意图变成一段可听音乐 + 一条会话记录的最小工作单元。文本指令与"根据心情生成"共用同一个 Agent turn,只在如何构造输入(是否带 [Conversation history]、是否带 mood context)上分叉。
_Avoid_: request、run、call、generation

**Session**:
一条独立的对话线,持有自己的消息列表、最后一次成功的代码、标题与时间戳;持久化在 IndexedDB,不可用时降级到内存。当前激活的那条叫 current session,其余在后台完成的 Agent turn 只落库、不动编辑器、不发声。
_Avoid_: conversation、chat、thread

**Session revision**:
一次已 commit 的 [Agent turn] 所形成的不可变代码边界:记录该 turn 开始时的代码与最终代码,并由对应 assistant 消息引用。它描述的是"这一轮 agent 改了什么",不从相邻消息推算;播放失败仍会形成 revision 并记录失败状态,因为 [Playback commit] 仍以最新代码为 [Session] 真相。
_Avoid_: diff(仅指展示结果)、snapshot、version

**Score**:
一段 Strudel 代码解析后的结构化表示:BPM、是否有 stack、各 [Layer] 的位置与内容。由 parser 这个深模块从原始代码字符串解析得到。
_Avoid_: pattern、track、composition

**Layer**:
Score 里的一个声部——stack 中的一个顶层条目。agent 通过增删替换 Layer 来改音乐。
_Avoid_: voice、part、channel、stem

**Playback commit**:
让一段代码成为某条 [Session] 的"真相":先 play 它,再无条件写入存档(`setCurrentCode`)——不论 play 成没成功,落库的始终是最新代码,使 strudel 的"在播代码"与 session 的"存档代码"不发散。[Agent turn] 与 rewind 都经由 `commitPlayback` 提交。
_Avoid_: save、sync、persist(单指落库那一步)

**Conversation history**:
传给 agent 作为上下文的历史回合快照,在 [Agent turn] 写入新用户消息之前截取。文本指令携带它;"根据心情生成"刻意不带(独立的一次性创作)。
_Avoid_: context、memory、transcript
