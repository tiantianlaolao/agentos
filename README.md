# AgentOS

> The browser for the Agent era — an open-source platform to run, manage, and interact with AI agents across mobile, desktop, and cloud.

AgentOS is a universal AI Agent client that connects to multiple agent backends (OpenClaw, CoPaw, built-in LLMs) from a single unified interface. Think of it as what Chrome is to websites, but for AI agents.

## Key Features

**Multi-Agent Support**
- **Built-in Agent** — Zero-config AI assistant (DeepSeek), ready out of the box
- **OpenClaw** — Connect to hosted or self-hosted [OpenClaw](https://github.com/nicepkg/openclaw) instances with full memory, skills, and session management
- **CoPaw** — Connect to Alibaba's [AgentScope](https://github.com/modelscope/agentscope) CoPaw agents via HTTP SSE
- **BYOK** — Bring Your Own Key for DeepSeek, OpenAI, Anthropic, or Moonshot

**Skill System**
- Extensible skill framework with `SkillManifest` standard
- **Skill Library** — browse, install, and uninstall skills per user
- Built-in skills: Weather, Translation, US Stock Monitor
- Function Calling integration with all LLM providers
- Per-user skill visibility (public/private) and install state
- Skill Catalog database with audit badges and environment tags
- Visual skill execution cards with real-time status

**Three Clients, One Platform**
- **Mobile** (Android) — React Native + Expo, your command center on the go
- **Desktop** — Tauri v2 (Rust + React), local agent runtime and workstation
- **Server** — Node.js WebSocket backend, agent routing, and cloud services

**User System**
- Phone-based registration with SMS OTP
- JWT authentication
- Per-user conversation isolation and memory
- Hosted agent provisioning with invitation codes

**Developer-Friendly**
- Adapter pattern: add new agent backends by implementing `AgentAdapter` interface
- JSON-over-WebSocket protocol
- Local-first: chat history stored on device (SQLite)
- i18n support (English / Chinese)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Clients                             │
│  ┌──────────┐   ┌──────────┐   ┌────────────────────┐  │
│  │  Mobile   │   │ Desktop  │   │   Web (planned)    │  │
│  │ (Expo RN) │   │ (Tauri)  │   │                    │  │
│  └─────┬─────┘   └─────┬────┘   └────────────────────┘  │
│        │               │                                  │
│        └───────┬───────┘                                  │
│                │ WebSocket / Direct                       │
└────────────────┼─────────────────────────────────────────┘
                 │
┌────────────────┼─────────────────────────────────────────┐
│           AgentOS Server (:3100)                          │
│  ┌─────────────────────────────────────────────┐         │
│  │  WebSocket Handler                           │         │
│  │  ├── Auth (JWT)                              │         │
│  │  ├── Rate Limiting                           │         │
│  │  ├── Memory (extract + inject)               │         │
│  │  └── Skill Registry (Function Calling)       │         │
│  └──────────┬──────────────────────┬────────────┘         │
│             │                      │                      │
│  ┌──────────▼──────┐   ┌──────────▼──────────┐          │
│  │  AgentAdapter    │   │   LLM Provider      │          │
│  │  ├── OpenClaw    │   │   ├── DeepSeek      │          │
│  │  ├── CoPaw      │   │   ├── OpenAI        │          │
│  │  └── Desktop    │   │   ├── Anthropic     │          │
│  │                  │   │   └── Moonshot      │          │
│  └─────────────────┘   └─────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

## Project Structure

```
agentos/
├── mobile/          # React Native (Expo) — Android client
│   ├── app/         # Expo Router screens (tabs, login)
│   └── src/         # Stores, services, i18n, components
├── desktop/         # Tauri v2 — Desktop client (macOS/Windows/Linux)
│   ├── src/         # React UI (chat, settings, sidebar)
│   └── src-tauri/   # Rust backend (WebSocket, process manager)
├── server/          # Node.js — Backend server
│   └── src/
│       ├── adapters/    # AgentAdapter implementations
│       ├── providers/   # LLM provider integrations
│       ├── skills/      # Skill definitions, registry, user state
│       ├── auth/        # User auth, hosted provisioning
│       ├── memory/      # Conversation memory extraction
│       └── websocket/   # WebSocket connection handler
├── copaw-runtime/   # Python — CoPaw/AgentScope HTTP server
├── docs/            # Protocol specification
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

Or download the latest APK from [Releases](https://github.com/skingway/agentos/releases).

### Desktop

```bash
cd desktop
npm install
cargo tauri dev         # Development mode
cargo tauri build       # Production build
```

Requires [Rust](https://rustup.rs/) and Tauri v2 CLI.

## Connection Modes

| Mode | Description | Server Required |
|------|-------------|:---:|
| **Built-in** | Server-hosted LLM (DeepSeek default) | Yes |
| **BYOK** | Your own API key, routed through server for skills/memory | Yes |
| **OpenClaw Hosted** | Per-user managed OpenClaw instance | Yes |
| **OpenClaw Self-hosted** | Direct WebSocket to your own Gateway | No |
| **CoPaw** | HTTP SSE to AgentScope CoPaw runtime | Yes |

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

1. Create a directory under `server/src/skills/your-skill/`
2. Define a `manifest.ts` with `SkillManifest` (name, description, functions in OpenAI Function Calling format)
3. Implement a `handler.ts` that processes function calls and returns results
4. The skill auto-loads on server start via `SkillLoader` and syncs to the Skill Catalog

See [docs/skills-development.md](docs/skills-development.md) for the full development guide, and [docs/skills-guide.md](docs/skills-guide.md) for the end-user guide.

## Tech Stack

| Component | Technologies |
|-----------|-------------|
| **Mobile** | React Native, Expo, TypeScript, Zustand, SQLite |
| **Desktop** | Tauri v2, Rust, React, TypeScript |
| **Server** | Node.js, WebSocket (ws), Express, TypeScript, better-sqlite3 |
| **LLM** | DeepSeek, OpenAI, Anthropic, Moonshot (Kimi) |
| **Protocol** | JSON over WebSocket |
| **Auth** | Phone + SMS OTP, JWT |

## Roadmap

- [x] Multi-agent support (OpenClaw, CoPaw, Built-in, BYOK)
- [x] Skill system with SkillManifest standard
- [x] User auth and per-user isolation
- [x] Conversation memory
- [x] Desktop MVP (Tauri v2)
- [x] Hosted agent provisioning
- [x] User-level Skill management (install/uninstall, Skill Library)
- [x] Skill Catalog database with audit and environment metadata
- [ ] Desktop remote skill execution (file ops, browser automation)
- [ ] Hosted mode skill management (OpenClaw/CoPaw)
- [ ] Skill marketplace and community ecosystem
- [ ] Multi-agent collaboration
- [ ] iOS client (TestFlight)
- [ ] Payment integration

## License

[Apache License 2.0](LICENSE)
