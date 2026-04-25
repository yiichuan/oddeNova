# 🎵 oddeNova

**用自然语言创作与实时编辑电子乐。**

> 本项目在 Attrax Shenzhen 黑客松期间创作。

oddeNova 是一个基于浏览器的 AI 音乐创作工具。你只需用文字描述想要的音乐，AI Agent 会自动将其分解为多个音轨层（layer），生成 [Strudel](https://strudel.cc/) live coding 代码并即时播放。你可以持续对话来迭代修改，AI 会精准修改你指定的层，而不影响其他部分。

## ✨ 功能特色

- **文字输入** — 用自然语言描述你想要的音乐或修改意图
- **Agent 编曲** — Claude 驱动的多工具 Agent，将音乐拆分为独立 layer 分别生成和修改
- **分层音轨管理** — 每个乐器/声部是独立的 layer（底鼓、军鼓、贝斯、合成器等），可单独增删替换
- **即时播放** — 生成代码立即在浏览器中执行并播放，无需后端
- **迭代编辑** — AI 仅修改你指定的层，保留未提及的部分
- **思考过程可见** — 侧边栏实时展示 Agent 的推理过程和工具调用
- **多 Session 管理** — 支持创建多个独立的音乐创作会话并随时切换
- **AI 智能建议** — 根据当前音乐上下文自动生成下一步操作建议
- **代码面板** — 实时展示当前运行的 Strudel 代码，带语法高亮
- **撤销功能** — 支持回退到历史版本（最多 50 步）
- **Demo 模式** — URL 加 `?demo=true` 可进入预设演示流程

## 🛠️ 技术栈

| 层级 | 技术选型 |
|------|----------|
| **前端框架** | React 19 + TypeScript |
| **构建工具** | Vite |
| **样式** | Tailwind CSS v4 |
| **音频引擎** | [Strudel](https://strudel.cc/) (npm) |
| **AI 模型** | Claude (`claude-opus-4-6` / `claude-sonnet-4-6`)，通过 Anthropic SDK 调用 |

## 🚀 快速开始

### 环境要求

- Node.js >= 18

### 安装与运行

```bash
git clone https://github.com/yiichuan/oddeNova.git
cd oddeNova

npm install
npm run dev
```

打开浏览器访问 `http://localhost:5173`。

首次使用需在弹窗中填写 API Key（支持 `.env.local` 预配置）。

### 环境变量

在项目根目录创建 `.env.local`：

```env
VITE_API_KEY=your-anthropic-api-key
# 可选，覆盖默认 base URL
VITE_BASE_URL=https://your-proxy.example.com
# 可选，覆盖默认模型（sonnet / opus）
VITE_LLM_MODEL=opus
```

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | TypeScript 类型检查 + 生产环境构建 |
| `npm run preview` | 预览生产构建产物 |
| `npm run lint` | ESLint 代码检查 |

## 📁 项目结构

```
src/
├── App.tsx                  # 应用主组件，串联所有逻辑
├── agent/
│   ├── tools.ts             # Agent 工具定义（addLayer / removeLayer / replaceLayer / commit）
│   ├── executor.ts          # 工具执行器
│   ├── loop.ts              # Agent 推理循环
│   └── parser.ts            # Strudel 代码解析（layer 提取）
├── components/
│   ├── Sidebar.tsx          # 侧边栏（对话 + 输入 + 建议）
│   ├── ConversationView.tsx # 消息流展示
│   ├── ChatInput.tsx        # 文字输入框
│   ├── CodePanel.tsx        # Strudel 代码展示
│   ├── SuggestionChips.tsx  # AI 建议快捷按钮
│   ├── HistoryPanel.tsx     # Session 历史面板
│   ├── ApiKeyModal.tsx      # API Key 设置弹窗
│   └── VizPlaceholder.tsx   # 音频可视化占位
├── hooks/
│   ├── useSessions.ts       # Session 状态管理
│   ├── useSuggestions.ts    # AI 建议生成
│   └── useStrudel.ts        # Strudel 音频引擎管理
├── services/
│   ├── llm.ts               # Claude API 调用 + Agent 运行入口
│   ├── llm-config.ts        # 模型配置（可切换 sonnet / opus）
│   ├── strudel.ts           # Strudel 引擎封装
├── demo/
│   ├── demo-config.ts       # Demo 场景配置
│   └── demo-llm.ts          # Demo 模式 LLM 模拟
└── prompts/                 # System prompt 与风格定义
```

## 🎯 使用方式

1. **启动音频引擎** — 打开页面后点击「启动音频引擎」
2. **描述音乐** — 在输入框中用自然语言描述，例如：
   - "来一段 lo-fi 鼓点加贝斯"
   - "加个合成器旋律，偏 ambient 风格"
   - "把军鼓换成更 trap 的感觉"
   - "节奏加快到 140 BPM"
3. **等待 Agent 生成** — 侧边栏会显示 Agent 的思考和工具调用过程
4. **继续迭代** — 基于已有音乐继续对话，AI 只修改你指定的部分
5. **使用建议** — 点击底部的建议 chip 快速触发下一步操作

## 🔧 工作原理

```
用户文字输入
    ↓
Claude Agent（多轮工具调用循环）
    ├── addLayer(name, code)      添加新音轨
    ├── removeLayer(name)         移除音轨
    ├── replaceLayer(name, code)  替换音轨内容
    ├── validate(code)            验证代码语法
    └── commit(explanation)       输出最终代码
    ↓
stack(...layers) → Strudel 引擎执行 → 浏览器播放
```

Agent 将整首音乐维护为多个具名 layer 的集合。每次对话只修改相关 layer，其余保持不变，实现精准的增量编辑。

## 📄 License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)（基于 Strudel 依赖的许可证要求）
