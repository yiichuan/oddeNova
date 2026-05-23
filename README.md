<div align="center">

<img src="logo/OddeNova-Logo.svg" alt="oddeNova" height="80" />

## **你如何 vibe coding，就如何 vibe 一只属于自己的单曲**

[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange?style=flat-square)](LICENSE)
[![CI](https://github.com/yiichuan/oddeNova/actions/workflows/ci.yml/badge.svg)](https://github.com/yiichuan/oddeNova/actions/workflows/ci.yml)

**[立即体验 → www.oddenova.com](https://www.oddenova.com)**

[功能特色](#功能特色) • [快速开始](#快速开始) • [工作原理](#工作原理) • [项目结构](#项目结构)

</div>

---

oddeNova 是一个基于浏览器的 AI 音乐创作工具。用文字描述你想要的音乐，AI Agent 会自动拆分为多个独立音轨层（layer），生成 [Strudel](https://strudel.cc/) live coding 代码并即时播放。支持持续对话迭代——AI 精准修改你指定的层，其余部分保持不变。

<!-- screenshot: 三栏布局全景图（历史面板 + 对话区 + 代码面板） -->
<!-- gif: 从输入描述到 Agent 工作到音乐播放的完整流程 -->

## 功能特色

**核心创作体验**

- **自然语言编曲** — 直接描述音乐意图，无需了解任何代码或乐理
- **分层音轨管理** — 底鼓、军鼓、贝斯、合成器等各自作为独立 layer，可按需增删替换
- **精准迭代编辑** — 每次对话只修改涉及的 layer，其余轨道保持原样
- **即时播放** — 代码生成后立即在浏览器中执行播放，无需后端服务
- **WAV 导出** — 通过 OfflineAudioContext 渲染并下载 WAV 音频文件

**AI 与交互**

- **思考过程可见** — 侧边栏实时展示 Agent 的推理过程与工具调用
- **AI 智能建议** — 根据当前音乐上下文自动生成下一步操作建议
- **多 LLM 服务商** — 支持 DeepSeek、Kimi、OpenAI、Claude、GLM（智谱），可在界面中随时切换

**会话与历史**

- **多 Session 管理** — 创建并随时切换多个独立的音乐创作会话
- **Session 回放** — 逐步回放任意历史会话的创作过程
- **撤销功能** — 支持回退至任意历史版本（最多 50 步）
- **分享链接** — 生成可分享的 URL，一键分享你的创作

**界面与其他**

- **代码面板** — 实时展示带语法高亮的 Strudel 代码，支持直接编辑
- **移动端适配** — 三栏布局在手机上自动切换为单栏抽屉式布局
- **Demo 模式** — URL 附加 `?demo=true` 进入预设演示流程，无需 API Key

## 快速开始

### 环境要求

- Node.js >= 18
- 以下任一 AI 服务商的 API Key（可选）：
  - [DeepSeek](https://platform.deepseek.com/)
  - [Kimi (Moonshot)](https://platform.moonshot.cn/)
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

### 一键部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyiichuan%2FoddeNova)

> API Key 在应用内界面填写，无需配置服务器环境变量。如需 cron 清理功能，在 Vercel 项目设置中配置 `CRON_SECRET`。

## 工作原理

你输入的每一条文字都会触发一个 AI Agent 推理循环：

```
用户文字输入
    ↓
AI Agent（多轮工具调用循环，最多 30 轮）
    ├── getScore()                查看当前音轨结构
    ├── addLayer(name, code)      添加新音轨层
    ├── removeLayer(name)         移除音轨层
    ├── replaceLayer(name, code)  替换音轨内容
    ├── applyEffect(layer, chain) 为音轨叠加效果链
    ├── setTempo(bpm)             设置 BPM（30–240）
    ├── improvise(role, style)    让子 LLM 即兴生成新音轨
    ├── validate(code)            验证代码语法与运行时
    └── commit(explanation)       提交最终代码并播放
    ↓
stack(...layers) → Strudel 引擎执行 → 浏览器 WebAudio 播放
```

Agent 将整首音乐维护为多个具名 layer 的集合。每次对话只修改相关 layer，其余保持不变，实现精准的增量编辑。

**任何人都可以上手——不需要会编曲，也不需要懂代码：**

**新手友好 · 用你最自然的语言描述**

> "我想要一首让人放松的背景音乐"  
> "加点活泼的感觉，像下午喝咖啡的氛围"  
> "鼓点太沉了，换轻快一点的"  
> "节奏再快一点，我想跳起来"

**进阶用户 · 精准控制每一个细节**

> "来一段 lo-fi 鼓点加贝斯，BPM 90，加点 vinyl 噪声"  
> "加个合成器旋律，偏 ambient 风格，用 Fender Rhodes 音色"  
> "把军鼓换成更 trap 的感觉，加 808 低音"  
> "把整体调到 A 小调，tempo 升到 140"

### 内置音乐风格

| 风格 | BPM 范围 | 特色 |
|------|---------|------|
| lo-fi | 70–90 | 慵懒颗粒感，轻柔鼓点 |
| house | 118–128 | 四四拍踩镲，律动贝斯线 |
| dnb | 165–180 | 高速碎拍，深沉低频 |
| ambient | 60–90 | 大量留白，氛围感铺垫层 |
| techno | 125–140 | 工业感打击，循环律动 |
| synthwave | 90–110 | 复古合成器，八十年代质感 |
| trap | 130–160 | hi-hat 连排，808 低音 |
| jazz | 90–110 | 摇摆律动，爵士和声 |

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
│ addLayer()       replaceLayer()       validate()    │
│ removeLayer()    applyEffect()        improvise()   │
│ setTempo()       getScore()           commit()      │
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
│   ├── tools.ts             # Agent 工具定义（9 个工具）
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
    └── versions/            # 版本化提示词（只增不改）
```

## 许可证

[AGPL-3.0](LICENSE)（基于 Strudel 依赖的许可证要求）
