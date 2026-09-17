<!-- README-I18N:START -->

**中文** | [English](./README.en.md)

<!-- README-I18N:END -->

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="logo/oddenova-logo-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="logo/oddenova-logo-light.png" />
  <img src="logo/oddenova-logo-light.png" alt="oddenova" height="80" />
</picture>


## **即刻开始，vibe 一首属于自己的单曲**

[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange?style=flat-square)](LICENSE)
[![CI](https://github.com/yiichuan/oddeNova/actions/workflows/ci.yml/badge.svg)](https://github.com/yiichuan/oddeNova/actions/workflows/ci.yml)

**[立即体验 → www.oddenova.com](https://www.oddenova.com)**

[如何交互](#如何交互) • [本地使用快速开始](#本地使用快速开始) • [工作原理](#工作原理) • [项目结构](#项目结构)

</div>

---

oddeNova 是一个【即兴音乐制作的 Agent】。通过与它的对话，一步一步制作出想要的音乐。

**像 vibe coding 一样，vibe 音乐**

<img src="docs/images/oddenova-demo.gif" alt="oddeNova 演示" width="100%" />

## 为谁而生

为那些在乎音乐的创作者们
无论是为自己的作品制作配乐，还是音乐即是自己的作品本身
无论是暂时缺乏编曲知识，不会使用音乐制作软件，还是对这一切早已熟稔于心

你不满足于流行到腻味的模版“神曲”，不满足于抽卡式的 AI音乐
你想要让节奏，音符，和弦都完完全全成为表达的一部分


## 如何交互

与 oddeNova 对话来生成和调整音乐，或是直接修改控制音乐播放的 Strudel 代码
你的想法和选择才是创作的主体


**核心创作体验**

- **自然语言编曲** — 描述你的想法与意见，不断迭代创作结果
- **分层音轨管理** — 鼓组、弦乐、合成器等等，各自作为独立 layer，实现精细地管理
- **精准迭代编辑** — 修改空间从整首曲子，到单个音符，通过对话就能完成
- **即时播放** — 代码生成后立即在浏览器中执行播放，更新代码也能无缝衔接
- **WAV 导出** — 有了满意的demo，导出 wav 文件

**AI 与交互**

- **分布式的创作** — Agent 不会一次生成完整的曲子，而是像自然创作一样，根据想法从简单到复杂地组织音轨
- **思考过程可见** — 推理过程可见，一眼看明白 Agent 是如何用代码结构出乐段的
- **编曲辅助建议** — 根据当前上下文自动给出下一步的操作建议
- **多 LLM 服务商** — 支持 DeepSeek、OpenAI、Claude、GLM（智谱），可在设置中切换

**会话与历史**

- **多 Session 管理** — 创建并随时切换多个独立的音乐创作会话
- **Session 回放** — 创作过程中的阶段成果全部保留，随时切换
- **撤销功能** — 支持回退至任意历史版本（最多 50 步）
- **分享链接** — 生成可分享的 URL，一键分享你的创作

**界面与其他**

- **代码面板** — 实时展示带语法高亮的 Strudel 代码，可以直接上手编辑
- **动画面板** - 跟随版本主题的 vj 动画，在播放时跟随律动产生丰富的视觉效果
- **精选页** - 收集了一系列 strudel 复刻曲目作品
- **移动端适配** — 手机访问网页也可以体验完整功能
- **学习Strudel** - Strudel代码是基于 JS 的实现实时音乐播放的代码语言，它功能强大，上手简单，oddeNova 包含了中文版教程的链接

## 本地使用快速开始

### 环境要求

- Node.js >= 18
- 以下任一 AI 服务商的 API Key（可选）：
  - [DeepSeek](https://platform.deepseek.com/)
  - [OpenAI](https://platform.openai.com/)
  - [Anthropic](https://console.anthropic.com/)（Claude）
  - [GLM（智谱）](https://open.bigmodel.cn/)

### 安装与运行

```bash
git clone https://github.com/yiichuan/oddeNova.git
cd oddeNova
npm install
npm run dev
```

打开浏览器访问 `http://localhost:5173`，首次使用时在弹窗中选择服务商并填写对应的 API Key 即可开始创作。

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 类型检查 + 生产环境构建 |
| `npm run preview` | 预览生产构建产物 |
| `npm run lint` | ESLint 代码检查 |
| `npm test` | 运行单元测试（Vitest） |


## 工作原理

你输入的每一条文字都会触发一个 AI Agent 推理循环：

```
用户文字输入
    ↓
AI Agent（多轮工具调用循环，最多 30 轮）
    ├── setCode(code)             编写或修改完整 Strudel 代码
    ├── validate(code)            验证代码语法与运行时
    └── commit(explanation)       提交最终代码并播放
    ↓
Strudel 引擎执行 → 浏览器 WebAudio 播放
```

Agent 通过 `setCode` 直接管理完整的 Strudel 代码。每次对话写入新版本后经 `validate` 校验，最终 `commit` 触发热重载播放。代码内以 `/* @layer NAME */` 注释标记各音轨层，实现结构化的增量编辑。

**简单上手——你可以不明白编曲，也可以看不懂代码：**

**新手友好 · 用你最自然的语言描述**

> "我想要一首让人放松的背景音乐"  
> "加点活泼的感觉，像下午喝咖啡的氛围"  
> "一段简单的鼓"  
> "让节奏快一些，声音亮一些"

**进阶用户 · 精准控制每一个细节**

> "来一段 lo-fi 鼓点加贝斯，BPM 90，加点 vinyl 噪声"  
> "加个合成器旋律，偏 ambient 风格，用 Fender Rhodes 音色"  
> "把军鼓换成更 trap 的感觉，加 808 低音"  
> "把整体调到 A 小调，tempo 升到 140"

## 技术栈

| 层级 | 技术选型 |
|------|----------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| 样式 | Tailwind CSS v4 |
| 代码编辑器 | CodeMirror 6 |
| 音频引擎 | [Strudel](https://strudel.cc/) + superdough（WebAudio API） |
| AI 模型 | DeepSeek / Kimi / OpenAI / Claude / GLM，可在界面中自由切换 |
| 数据持久化 | IndexedDB（会话存储） |
| 测试 | Vitest |
| 部署 | Vercel（含 Serverless Functions） |

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│                      Browser                        │
│                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ History  │  │  Chat / UI   │  │  Code Panel  │  │
│  │  Panel   │  │  (React 19)  │  │ (CodeMirror) │  │
│  └──────────┘  └──────┬───────┘  └──────────────┘  │
│                        │                            │
│               ┌────────▼────────┐                   │
│               │   Agent Loop    │                   │
│               │  loop.ts        │                   │
│               │  executor.ts    │                   │
│               │  tools.ts       │                   │
│               └────────┬────────┘                   │
│                        │ tool calls                 │
│    ┌───────────────────┼───────────────────┐        │
│    ▼                   ▼                   ▼        │
│         setCode()    validate()    commit()         │
│    └───────────────────┬───────────────────┘        │
│                        │ final code                 │
│               ┌────────▼────────┐                   │
│               │  Strudel Engine │                   │
│               │  (WebAudio API) │                   │
│               └─────────────────┘                   │
│                                                     │
│  ── LLM API (DeepSeek / Kimi / OpenAI / Claude) ── │
│  ── IndexedDB (session + undo history) ─────────── │
└─────────────────────────────────────────────────────┘
```

详见 [docs/frontend-architecture.md](docs/frontend-architecture.md)。

## 项目结构

```
src/
├── App.tsx                  # 应用主组件
├── agent/
│   ├── tools.ts             # Agent 工具定义（3 个工具）
│   ├── executor.ts          # 工具执行器
│   ├── loop.ts              # Agent 推理循环（最多 30 轮）
│   └── parser.ts            # Strudel 代码解析（layer 提取）
├── components/              # UI 组件
│   ├── ChatInput.tsx        # 文字输入
│   ├── CodePanel.tsx        # 代码编辑器 + WAV 导出
│   ├── ConversationView.tsx # 对话历史 + Agent 推理展示
│   ├── HistoryPanel.tsx     # Session 浏览器 + 回放控制
│   └── ...
├── hooks/
│   ├── useSessions.ts       # Session 状态管理（IndexedDB）
│   ├── useReplay.ts         # Session 回放
│   ├── useSuggestions.ts    # AI 建议生成
│   └── useStrudel.ts        # Strudel 音频引擎管理
├── services/
│   ├── llm.ts               # LLM API 调用（双协议：Anthropic + OpenAI）
│   ├── llm-config.ts        # 多服务商配置与路由
│   ├── share.ts             # 分享链接生成
│   └── strudel.ts           # Strudel 引擎封装与验证
├── demo/                    # Demo 模式配置与 LLM 模拟
└── prompts/
    ├── active.ts            # 当前激活的提示词版本指针
    └── versions/            # 版本化提示词（一个需求一个工作版本，完成后冻结）
```

## 许可证

[AGPL-3.0](LICENSE)（基于 Strudel 依赖的许可证要求）
