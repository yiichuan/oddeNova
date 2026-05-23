<!-- README-I18N:START -->

[中文](./README.md) | **English**

<!-- README-I18N:END -->

<div align="center">

<img src="logo/oddenova-logo.png" alt="oddeNova" height="80" />

## **Your space for improvised music-making**

[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange?style=flat-square)](LICENSE)
[![CI](https://github.com/yiichuan/oddeNova/actions/workflows/ci.yml/badge.svg)](https://github.com/yiichuan/oddeNova/actions/workflows/ci.yml)

**[Try it now → www.oddenova.com](https://www.oddenova.com)**

[Features](#features) • [Quick Start](#quick-start) • [How It Works](#how-it-works) • [Project Structure](#project-structure)

</div>

---

oddeNova is an Agent platform for improvised music creation. Describe a feeling, theme, or image in a single sentence — the AI Agent breaks it into visible track layers, and you shape the music through a loop of listening, judging, and refining.

**Not a one-click generator — a private space where you participate in the full creative process.**

<img src="docs/images/oddenova-demo.gif" alt="oddeNova Demo" width="100%" />

## For Whom

You have something to express and the taste to know when it sounds right —  
but you don't have a music theory background, production training, or experience with electronic music tools.  
You have a mood, a scene, an idea — and you'd rather shape it yourself than spin a random wheel.

## Features

Describe a feeling, shape the structure, until the track becomes yours.

**Core Creation Experience**

- **Natural language composition** — Describe your musical intent directly; no knowledge of code or music theory required
- **Layered track management** — Kick drum, snare, bass, synthesizer, etc. each as independent layers, add or remove on demand
- **Precise iterative editing** — Each conversation only modifies the relevant layers; other tracks remain unchanged
- **Instant playback** — Code executes and plays in the browser immediately after generation; no backend needed
- **WAV export** — Render and download WAV audio files via OfflineAudioContext

**AI & Interaction**

- **Visible thinking process** — Sidebar shows the Agent's reasoning and tool calls in real time
- **AI smart suggestions** — Automatically generates next-step suggestions based on the current musical context
- **Multiple LLM providers** — Supports DeepSeek, Kimi, OpenAI, Claude, GLM; switch freely in the UI

**Session & History**

- **Multi-session management** — Create and switch between multiple independent music creation sessions
- **Session replay** — Step through any past session's creative process
- **Undo** — Roll back to any historical version (up to 50 steps)
- **Share link** — Generate a shareable URL to share your creation in one click

**UI & Other**

- **Code panel** — View real-time syntax-highlighted Strudel code with direct editing support
- **Mobile-friendly** — Three-column layout automatically switches to a single-column drawer layout on mobile
- **Demo mode** — Append `?demo=true` to the URL to enter a preset demo flow without an API key

## Quick Start

### Requirements

- Node.js >= 18
- API key from any of the following AI providers (optional):
  - [DeepSeek](https://platform.deepseek.com/)
  - [Kimi (Moonshot)](https://platform.moonshot.cn/)
  - [OpenAI](https://platform.openai.com/)
  - [Anthropic](https://console.anthropic.com/) (Claude)
  - [GLM](https://open.bigmodel.cn/)

### Installation & Running

```bash
git clone https://github.com/yiichuan/oddeNova.git
cd oddeNova
npm install
npm run dev
```

Open your browser at `http://localhost:5173`. On first use, select a provider and enter your API key in the dialog to start creating.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint code check |
| `npm test` | Run unit tests (Vitest) |

### One-Click Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyiichuan%2FoddeNova)

> API keys are entered in the in-app UI; no server environment variables required. For the cron cleanup feature, configure `CRON_SECRET` in your Vercel project settings.

## How It Works

Every text message you send triggers an AI Agent inference loop:

```
User text input
    ↓
AI Agent (multi-round tool call loop, up to 30 rounds)
    ├── getScore()                View current track structure
    ├── addLayer(name, code)      Add a new track layer
    ├── removeLayer(name)         Remove a track layer
    ├── replaceLayer(name, code)  Replace track content
    ├── applyEffect(layer, chain) Apply an effect chain to a layer
    ├── setTempo(bpm)             Set BPM (30–240)
    ├── improvise(role, style)    Let a sub-LLM improvise a new track
    ├── validate(code)            Validate code syntax and runtime
    └── commit(explanation)       Commit final code and play
    ↓
stack(...layers) → Strudel engine executes → Browser WebAudio playback
```

The Agent maintains the entire piece of music as a collection of named layers. Each conversation only modifies the relevant layers while leaving the rest intact, enabling precise incremental editing.

**Anyone can get started — no music theory or coding knowledge required:**

**Beginner-friendly · Describe in your most natural language**

> "I want some relaxing background music"
> "Add something upbeat, like the vibe of a lazy afternoon coffee"
> "The drum beat is too heavy, make it lighter"
> "Speed up the rhythm, I want to dance"

**Advanced users · Precise control over every detail**

> "Give me a lo-fi drum beat with bass, BPM 90, and some vinyl noise"
> "Add a synth melody, more ambient, using a Fender Rhodes tone"
> "Swap the snare for something more trap, add 808 bass"
> "Shift everything to A minor, bump the tempo to 140"

### Built-in Music Styles

| Style | BPM Range | Character |
|-------|-----------|-----------|
| lo-fi | 70–90 | Lazy, grainy, soft drum hits |
| house | 118–128 | Four-on-the-floor hi-hats, groove bass line |
| dnb | 165–180 | High-speed breakbeats, deep low end |
| ambient | 60–90 | Lots of space, atmospheric layering |
| techno | 125–140 | Industrial percussion, looping groove |
| synthwave | 90–110 | Retro synthesizers, 80s aesthetic |
| trap | 130–160 | Hi-hat rolls, 808 bass |
| jazz | 90–110 | Swing feel, jazz harmony |
| blues | 72–100 | Soulful, earthy, 12-bar blues feel |
| funk | 90–115 | Syncopated rhythms, strong groove |
| bossanova | 90–130 | Brazilian jazz, elegant and flowing |
| reggae | 60–90 | Jamaican roots, off-beat emphasis |
| classical | 60–120 | Orchestral textures, structured harmony |
| rnb | 70–100 | Soulful, laid-back groove |
| folk | 70–100 | Warm and intimate, acoustic storytelling |
| country | 80–130 | Southern American roots, twangy character |
| latin | 100–135 | Latin heat, clave-driven rhythm |
| afrobeat | 92–120 | West African groove, polyrhythmic layers |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend framework | React 19 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v4 |
| Code editor | CodeMirror 6 |
| Audio engine | [Strudel](https://strudel.cc/) + superdough (WebAudio API) |
| AI models | DeepSeek / Kimi / OpenAI / Claude / GLM, switch freely in UI |
| Data persistence | IndexedDB (session storage) |
| Testing | Vitest |
| Deployment | Vercel (with Serverless Functions) |

## System Architecture

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

See [docs/frontend-architecture.md](docs/frontend-architecture.md) for details.

## Project Structure

```
src/
├── App.tsx                  # Main application component
├── agent/
│   ├── tools.ts             # Agent tool definitions (9 tools)
│   ├── executor.ts          # Tool executor
│   ├── loop.ts              # Agent inference loop (up to 30 rounds)
│   └── parser.ts            # Strudel code parsing (layer extraction)
├── components/              # UI components
│   ├── ChatInput.tsx        # Text input
│   ├── CodePanel.tsx        # Code editor + WAV export
│   ├── ConversationView.tsx # Conversation history + agent reasoning display
│   ├── HistoryPanel.tsx     # Session browser + replay controls
│   └── ...
├── hooks/
│   ├── useSessions.ts       # Session state management (IndexedDB)
│   ├── useReplay.ts         # Session replay
│   ├── useSuggestions.ts    # AI suggestion generation
│   └── useStrudel.ts        # Strudel audio engine management
├── services/
│   ├── llm.ts               # LLM API calls (dual protocol: Anthropic + OpenAI)
│   ├── llm-config.ts        # Multi-provider configuration and routing
│   ├── share.ts             # Share link generation
│   └── strudel.ts           # Strudel engine wrapper and validation
├── demo/                    # Demo mode configuration and LLM simulation
└── prompts/
    ├── active.ts            # Pointer to current active prompt version
    └── versions/            # Versioned prompts (append-only)
```

## License

[AGPL-3.0](LICENSE) (required by the Strudel dependency license)
