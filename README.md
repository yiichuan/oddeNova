<div align="center">

# oddeNova

## **你如何 vibe coding，就如何 vibe 一只属于自己的单曲**

[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange?style=flat-square)](LICENSE)

[功能特色](#功能特色) • [快速开始](#快速开始) • [工作原理](#工作原理) • [项目结构](#项目结构)

</div>

---

oddeNova 是一个基于浏览器的 AI 音乐创作工具。用文字描述你想要的音乐，AI Agent 会将其自动拆分为多个独立音轨层（layer），生成 [Strudel](https://strudel.cc/) live coding 代码并即时播放。支持持续对话迭代——AI 精准修改你指定的层，其余部分保持不变。

> [!NOTE]
> 本项目在 Attrax Shenzhen 黑客松期间创作。

## 功能特色

- **自然语言编曲** — 直接描述你的音乐意图，无需了解任何代码或乐理
- **分层音轨管理** — 底鼓、军鼓、贝斯、合成器等各自作为独立 layer，可按需增删替换
- **精准迭代编辑** — 每次对话只修改涉及的 layer，其余轨道保持原样
- **即时播放** — 代码生成后立即在浏览器中执行播放，无需后端服务
- **思考过程可见** — 侧边栏实时展示 Agent 的推理过程与工具调用
- **AI 智能建议** — 根据当前音乐上下文自动生成下一步操作建议
- **多 Session 管理** — 创建并随时切换多个独立的音乐创作会话
- **代码面板** — 实时展示带语法高亮的 Strudel 代码
- **撤销功能** — 支持回退至任意历史版本（最多 50 步）
- **Demo 模式** — URL 附加 `?demo=true` 进入预设演示流程

## 快速开始

### 环境要求

- Node.js >= 18
- 以下任一 AI 服务商的 API Key：
  - [Anthropic](https://console.anthropic.com/)（Claude）
  - [DeepSeek](https://platform.deepseek.com/)

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
| `npm run dist:mac` | 打包为 macOS 桌面应用（.dmg） |

## 工作原理

你输入的每一条文字都会触发一个 AI Agent 推理循环：

```
用户文字输入
    ↓
AI Agent（多轮工具调用循环）
    ├── addLayer(name, code)      添加新音轨
    ├── removeLayer(name)         移除音轨
    ├── replaceLayer(name, code)  替换音轨内容
    ├── validate(code)            验证代码语法
    └── commit(explanation)       提交最终代码
    ↓
stack(...layers) → Strudel 引擎执行 → 浏览器播放
```

Agent 将整首音乐维护为多个具名 layer 的集合。每次对话只修改相关 layer，其余保持不变，实现精准的增量编辑。

**任何人都可以上手——不需要会编曲，也不需要懂代码：**

🎵 **新手友好 · 用你最自然的语言描述**

> "我想要一首让人放松的背景音乐"  
> "加点活泼的感觉，像下午喝咖啡的氛围"  
> "鼓点太沉了，换轻快一点的"  
> "节奏再快一点，我想跳起来"

🎛️ **进阶用户 · 精准控制每一个细节**

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
| 音频引擎 | [Strudel](https://strudel.cc/) |
| AI 模型 | Anthropic Claude / DeepSeek，可在界面中自由切换 |
| 桌面端 | Electron（可选） |

## 项目结构

```
src/
├── App.tsx                  # 应用主组件
├── agent/
│   ├── tools.ts             # Agent 工具定义
│   ├── executor.ts          # 工具执行器
│   ├── loop.ts              # Agent 推理循环
│   └── parser.ts            # Strudel 代码解析（layer 提取）
├── components/              # UI 组件
├── hooks/
│   ├── useSessions.ts       # Session 状态管理
│   ├── useSuggestions.ts    # AI 建议生成
│   └── useStrudel.ts        # Strudel 音频引擎管理
├── services/
    ├── llm.ts               # LLM API 调用（多服务商）
│   ├── llm-config.ts        # 模型配置
│   └── strudel.ts           # Strudel 引擎封装
├── demo/                    # Demo 模式配置与 LLM 模拟
└── prompts/                 # System prompt 与风格定义
```

## 许可证

[AGPL-3.0](LICENSE)（基于 Strudel 依赖的许可证要求）
