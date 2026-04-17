# 🎵 Vibe Live Music

**用说话的方式创作与实时编辑电子乐。**

Vibe Live Music 是一个基于浏览器的 AI 音乐创作工具。你只需用自然语言（语音或文字）描述想要的音乐，AI 会自动生成 [Strudel](https://strudel.cc/) live coding 代码，并即时在浏览器中播放。你可以不断对话来迭代修改音乐，像和一位 DJ 搭档协作一样。

## ✨ 功能特色

- **语音输入** — 按住空格键或点击麦克风按钮，用说话的方式描述你想要的音乐
- **文字输入** — 也可以直接打字输入指令
- **AI 编曲** — LLM 理解你的自然语言描述，生成可运行的 Strudel 代码
- **即时播放** — 生成的音乐代码立即在浏览器中执行并播放
- **迭代编辑** — 在已有音乐的基础上继续对话，AI 会保留未提及的部分并修改你指定的内容
- **代码面板** — 实时展示当前运行的 Strudel 代码，带语法高亮
- **频谱可视化** — 动态频率柱状图可视化当前播放的音频
- **撤销功能** — 支持撤销到之前的版本（最多 50 步历史记录）
- **快捷提示** — 内置常用音乐风格的快捷提示按钮

## 🛠️ 技术栈

| 层级 | 技术选型 |
|------|----------|
| **前端框架** | React 19 + TypeScript |
| **构建工具** | Vite 8 |
| **样式** | Tailwind CSS v4 |
| **音频引擎** | [Strudel](https://strudel.cc/) (CDN 加载) |
| **AI 模型** | DeepSeek (`deepseek-chat`)，通过 OpenAI SDK 调用 |
| **语音识别** | Web Speech API（推荐 Chrome 浏览器） |

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- 推荐使用 Chrome 浏览器（语音识别依赖 Web Speech API）

### 安装与运行

```bash
# 克隆项目
git clone <repository-url>
cd vibe-live-music

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开浏览器访问 `http://localhost:5173` 即可使用。

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | TypeScript 类型检查 + 生产环境构建 |
| `npm run preview` | 预览生产构建产物 |
| `npm run lint` | ESLint 代码检查 |

## 📁 项目结构

```
vibe-live-music/
├── index.html                 # 入口 HTML，加载 Strudel CDN
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example               # 环境变量示例
└── src/
    ├── main.tsx               # React 入口
    ├── App.tsx                # 应用主组件，串联所有逻辑
    ├── index.css              # Tailwind 配置 + 自定义主题色
    ├── components/
    │   ├── ApiKeyModal.tsx    # API Key 设置弹窗
    │   ├── ChatPanel.tsx      # 对话面板（用户/AI 消息）
    │   ├── CodePanel.tsx      # Strudel 代码展示面板
    │   ├── ControlBar.tsx     # 底部控制栏（播放/停止/撤销）
    │   ├── Visualizer.tsx     # 音频频谱可视化
    │   └── VoiceButton.tsx    # 语音输入按钮
    ├── hooks/
    │   ├── useChat.ts         # 对话状态管理
    │   ├── useSpeech.ts       # 语音识别 Hook
    │   └── useStrudel.ts      # Strudel 音频引擎管理
    ├── services/
    │   ├── llm.ts             # LLM API 调用
    │   ├── speech.ts          # Web Speech API 封装
    │   └── strudel.ts         # Strudel 引擎封装
    ├── prompts/
    │   └── system-prompt.ts   # AI System Prompt（含 Strudel 语法参考）
    └── types/
        └── strudel.d.ts       # Strudel 全局类型声明
```

## 🎯 使用方式

1. **启动音频引擎** — 打开页面后，点击底部的「启动音频引擎」按钮
2. **描述你的音乐** — 通过以下任一方式：
   - 按 `空格键` 开始/停止语音输入
   - 点击麦克风按钮进行语音输入
   - 在输入框中直接打字
3. **等待 AI 生成** — AI 会返回 Strudel 代码并自动播放
4. **继续迭代** — 说出你想修改的部分，例如：
   - "加点贝斯"
   - "节奏快一点"
   - "加个延迟效果"
   - "换成 lo-fi 风格"
5. **控制播放** — 使用底部控制栏的播放、停止、撤销按钮

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Space` | 切换语音输入（非输入框焦点时） |

### 示例指令

- "来一段 lo-fi 鼓点"
- "加个合成器旋律"
- "贝斯再重一点"
- "来点 ambient 氛围感"
- "节奏改成 140 BPM"
- "加个 reverb 效果"

## ⚙️ 配置

当前版本使用内置的 DeepSeek API 配置。如需自定义，可修改 `src/services/llm.ts` 中的相关常量：

```typescript
const DEEPSEEK_API_KEY = 'your-api-key';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-chat';
```

也可以通过页面右上角的 ⚙️ 按钮在浏览器中配置 API 参数。

## 🔧 工作原理

```
用户语音/文字 → Web Speech API 转写 → LLM (DeepSeek) 生成 Strudel 代码
                                              ↓
               浏览器播放 ← Strudel 引擎执行 ← JSON { code, explanation }
                  ↓
            频谱可视化 (Web Audio API AnalyserNode)
```

1. **输入处理**：语音通过 Web Speech API 转为文字，与文字输入统一处理
2. **Prompt 构建**：将用户指令和当前代码（如有）组合为 LLM 请求
3. **代码生成**：LLM 基于 Strudel 语法参考和示例生成音乐代码
4. **音频执行**：Strudel 引擎在浏览器中解析并执行代码，输出音频
5. **可视化**：通过 Web Audio API 的 AnalyserNode 获取频率数据并绘制

## 📄 License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)（基于 Strudel 依赖的许可证要求）
