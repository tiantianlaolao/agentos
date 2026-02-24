# AgentOS

[中文文档](README.zh-CN.md)

> The browser for the Agent era — an open-source platform to run, manage, and interact with AI agents across mobile, desktop, and cloud.

AgentOS is a universal AI Agent client that connects to multiple agent backends (OpenClaw, CoPaw, built-in LLMs) from a single unified interface. Think of it as what Chrome is to websites, but for AI agents.

## Key Features

**Multi-Agent Support**
- **Built-in Agent** — Zero-config AI assistant powered by DeepSeek, with free quota or BYOK (Bring Your Own Key) sub-modes
- **OpenClaw** — Connect to hosted or self-hosted [OpenClaw](https://github.com/nicepkg/openclaw) instances with full memory, skills, and session management
- **CoPaw** — Connect to Alibaba's [AgentScope](https://github.com/modelscope/agentscope) CoPaw agents via HTTP SSE

**Skill System**
- Extensible skill framework with `SkillManifest` standard
- **Skill Library** — browse, install, and uninstall skills per user
- 10 built-in skills: Weather, Translation, US Stock Monitor, Calculator, Currency Exchange, Web Search, URL Summary, Image Generation, Date/Time, Claude Code (remote)
- 27 SKILL.md knowledge skills: Code Review, React Patterns, Git Commit, Linux Admin, Data Analysis, Remotion Video, and more
- **SKILL.md Directory Mode** — multi-file skills with on-demand sub-document loading (e.g., Remotion with 34 topic docs), AI reads index first then loads specific docs as needed to save tokens
- MCP (Model Context Protocol) integration — bridge external MCP servers as installable skills
- Function Calling integration with all LLM providers
- Per-user skill visibility (public/private) and install state
- AI-powered skill generation — describe what you want, AI creates a SKILL.md for you
- Visual skill execution cards with real-time status

**Desktop Remote Execution**
- **Desktop Shell** — Execute any shell command on your computer from your phone
- **Desktop Filesystem** — Read, write, and list files remotely
- **Claude Code** — Remotely invoke Claude Code on your desktop to analyze projects, write code, fix bugs, and perform development tasks
- Desktop auto-registers as an execution node regardless of chat mode
- Mobile detects desktop online status and shows a live indicator

**Three Clients, One Platform**
- **Mobile** (Android) — React Native + Expo, your command center on the go
- **Desktop** (macOS/Windows/Linux) — Tauri v2 (Rust + React), local execution node and workstation
- **Server** — Node.js WebSocket backend, agent routing, and cloud services

**User System**
- Phone-based registration with SMS OTP
- JWT authentication
- Per-user conversation isolation and AI-extracted memory
- Hosted agent provisioning with invitation codes

**Developer-Friendly**
- Adapter pattern: add new agent backends by implementing `AgentAdapter` interface
- JSON-over-WebSocket protocol ([docs/protocol.md](docs/protocol.md))
- Local-first: chat history stored on device (SQLite)
- i18n support (English / Chinese)
- MCP (Model Context Protocol) integration for extensible tool access

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       Clients                             │
│  ┌──────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │  Mobile   │   │   Desktop    │   │  Web (planned)  │   │
│  │ (Expo RN) │   │  (Tauri v2)  │   │                 │   │
│  └─────┬─────┘   └──┬─────┬────┘   └─────────────────┘   │
│        │             │     │                               │
│        │         chat│     │desktop.register               │
│        └──────┬──────┘     │(auto, all modes)              │
│               │ WebSocket  │                               │
└───────────────┼────────────┼───────────────────────────────┘
                │            │
┌───────────────┼────────────┼───────────────────────────────┐
│          AgentOS Server (:3100)                             │
│  ┌─────────────────────────────────────────────┐           │
│  │  WebSocket Handler                           │           │
│  │  ├── Auth (JWT)                              │           │
│  │  ├── Rate Limiting                           │           │
│  │  ├── Memory (extract + inject)               │           │
│  │  ├── Skill Registry (Function Calling)       │           │
│  │  └── Desktop Command Relay ◄────────────────┐│           │
│  └──────────┬──────────────────────┬───────────┘│           │
│             │                      │             │           │
│  ┌──────────▼──────┐   ┌──────────▼──────────┐  │           │
│  │  AgentAdapter    │   │   LLM Provider      │  │           │
│  │  ├── OpenClaw    │   │   ├── DeepSeek      │  │           │
│  │  ├── CoPaw      │   │   ├── OpenAI        │  │           │
│  │  └── Desktop    │   │   ├── Anthropic     │  │           │
│  │                  │   │   └── Moonshot      │  │           │
│  └─────────────────┘   └─────────────────────┘  │           │
│                                                   │           │
│  Desktop Execution Flow:                          │           │
│  Phone → Server → desktop.command → Desktop Rust  │           │
│  Desktop Rust → desktop.result → Server → Phone   │           │
└───────────────────────────────────────────────────────────────┘
```

## Project Structure

```
agentos/
├── mobile/          # React Native (Expo) — Android client
│   ├── app/         # Expo Router screens (tabs, login)
│   └── src/         # Stores, services, i18n, components
├── desktop/         # Tauri v2 — Desktop client (macOS/Windows/Linux)
│   ├── src/         # React UI (chat, settings, sidebar, skills, memory)
│   └── src-tauri/   # Rust backend (WebSocket, skill executor, MCP bridge)
├── server/          # Node.js — Backend server
│   └── src/
│       ├── adapters/    # AgentAdapter implementations (OpenClaw, CoPaw, Desktop)
│       ├── providers/   # LLM provider integrations
│       ├── skills/      # Skill definitions, registry, user state
│       ├── auth/        # User auth, hosted provisioning
│       ├── memory/      # Conversation memory extraction
│       └── websocket/   # WebSocket connection handler
├── docs/            # Protocol specification, skill guides
└── scripts/         # Deployment and utility scripts
```

## Quick Start

### Prerequisites

- Node.js >= 18
- npm or yarn

### Server

```bash
cd server
cp .env.example .env    # Edit with your API keys
npm install
npm run build
node dist/index.js      # or: npm run dev (for development)
```

Required environment variables in `.env`:
```
DEEPSEEK_API_KEY=your-key-here
JWT_SECRET=your-secret
```

### Mobile (Android)

```bash
cd mobile
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Or download the latest APK from [Releases](https://github.com/tiantianlaolao/agentos/releases).

### Desktop

```bash
cd desktop
npm install
npm run tauri:dev       # Development mode
npm run tauri:build     # Production build (.app / .exe)
```

Requires [Rust](https://rustup.rs/) and Tauri v2 CLI (`cargo install tauri-cli`).

## Agent Modes

AgentOS supports 3 agent modes. The built-in agent has two sub-modes:

| Mode | Description | Server Required |
|------|-------------|:---:|
| **Built-in (Free)** | Server-hosted LLM (DeepSeek default), zero config | Yes |
| **Built-in (BYOK)** | Your own API key, routed through server for skills/memory | Yes |
| **OpenClaw** | Hosted (invitation code) or self-hosted Gateway | Hosted: Yes / Self-hosted: No |
| **CoPaw** | Hosted (shared) or self-hosted AgentScope runtime | Hosted: Yes / Self-hosted: No |

## Desktop Execution

When the desktop app is running, it automatically registers as an execution node via `desktop.register`. This works regardless of which chat mode is active.

**Available desktop skills:**
- `desktop-shell` — Execute shell commands (`ls`, `open`, `osascript`, etc.)
- `desktop-filesystem` — Read, write, and list files
- `claude-code` — Invoke Claude Code (`claude -p`) for full-stack development tasks

**Example usage from mobile:**
- "Run `ls ~/Desktop` on my computer"
- "Open google.com in my browser"
- "Read the file ~/notes.txt"
- "Analyze the project structure of ~/agentos"
- "Fix the login bug in ~/my-app"
- "Create a text animation video with Remotion" (with Remotion skill installed)

The desktop skills are automatically registered and installed for the logged-in user when the desktop app connects. Mobile shows a green "Desktop Connected" banner when desktop is online.

## Adding a New Agent Backend

Implement the `AgentAdapter` interface from `server/src/adapters/base.ts`:

```typescript
interface AgentAdapter {
  readonly name: string;
  readonly type: AgentType;
  connect(options): Promise<void>;
  chat(messages, options?): AsyncIterable<string>;
  disconnect(): void;
  listSkills?(): Promise<SkillManifest[]>;
  // ... see base.ts for full interface
}
```

Register your adapter in the WebSocket handler, and it will automatically work with all clients.

## Adding a New Skill

**Option 1: Built-in Skill (TypeScript)**

1. Create a directory under `server/src/skills/your-skill/`
2. Define a `manifest.ts` with `SkillManifest` (name, description, functions in OpenAI Function Calling format)
3. Implement a `handler.ts` that processes function calls and returns results
4. The skill auto-loads on server start via `SkillLoader` and syncs to the Skill Catalog

**Option 2: SKILL.md (Knowledge/Instruction)**

Single file:
```
server/data/skills-md/my-skill.md
```

Directory mode (multi-file, for complex topics):
```
server/data/skills-md/my-skill/
├── SKILL.md          # Main index with frontmatter
└── rules/            # Sub-documents loaded on demand
    ├── topic-a.md
    └── topic-b.md
```

SKILL.md frontmatter:
```yaml
---
name: my-skill
description: What this skill does
emoji: 🔧
name_zh: 中文名
description_zh: 中文描述
---
```

**Option 3: MCP Server**

Add external MCP servers via the Skill Library UI. Server-side MCP processes are bridged as installable skills.

See [docs/skills-development.md](docs/skills-development.md) for the full development guide, and [docs/skills-guide.md](docs/skills-guide.md) for the end-user guide.

## Tech Stack

| Component | Technologies |
|-----------|-------------|
| **Mobile** | React Native, Expo, TypeScript, Zustand, SQLite |
| **Desktop** | Tauri v2, Rust, React, TypeScript |
| **Server** | Node.js, WebSocket (ws), Express, TypeScript, better-sqlite3 |
| **LLM** | DeepSeek, OpenAI, Anthropic, Moonshot (Kimi) |
| **Protocol** | JSON over WebSocket, MCP |
| **Auth** | Phone + SMS OTP, JWT |

## Roadmap

- [x] Multi-agent support (OpenClaw, CoPaw, Built-in with free/BYOK)
- [x] Skill system with SkillManifest standard
- [x] User auth and per-user isolation
- [x] Conversation memory (AI-extracted memory per user)
- [x] Desktop MVP (Tauri v2) with auto-connect
- [x] Hosted agent provisioning (invitation codes + per-user instances)
- [x] User-level Skill management (install/uninstall, Skill Library)
- [x] Skill Catalog database with audit and environment metadata
- [x] Desktop remote execution (shell commands, file operations)
- [x] MCP integration (server-side MCP-to-Skill bridge + desktop local MCP)
- [x] Mobile-Desktop sync (phone sends command, desktop executes, result returns)
- [x] Desktop online detection on mobile (green banner)
- [x] Claude Code remote skill (invoke Claude Code on desktop from mobile)
- [x] Skill content i18n (locales in manifests — skill names, descriptions, and functions auto-switch with UI language)
- [x] Unified BYOK sub-mode under Built-in Agent (mobile + desktop consistent)
- [x] 27 SKILL.md knowledge skills with featured recommendations and install counts
- [x] User-created skills: MCP Server, HTTP Skill, AI-generated SKILL.md, file import
- [x] SKILL.md directory mode (multi-file skills with on-demand sub-document loading)
- [x] Remotion video creation skill (desktop-side execution with dependency detection)
- [ ] Hosted mode skill management (OpenClaw/CoPaw)
- [ ] Desktop execution security (confirmation dialogs, command allowlists)
- [ ] Skill marketplace and community ecosystem
- [ ] Browser automation skill (Playwright)
- [ ] Local LLM support (Ollama)
- [ ] Multi-agent collaboration
- [ ] iOS client (TestFlight)
- [ ] Payment integration (WeChat Pay / Alipay)

## License

[Apache License 2.0](LICENSE)
