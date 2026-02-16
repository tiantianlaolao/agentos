# AgentOS

Open-source AI Agent mobile client. Connect to your own AI agents or use the built-in assistant with zero configuration.

## Features

- **Built-in Agent**: Zero-config AI assistant powered by DeepSeek
- **OpenClaw Support**: Connect to your OpenClaw instance via WebSocket
- **BYOK (Bring Your Own Key)**: Use your own API key for unlimited access
- **Local-first**: Chat history stored on device (SQLite)
- **Skills**: Extensible skill system (weather, and more coming)
- **i18n**: English and Chinese, more languages planned

## Project Structure

```
agentos/
├── mobile/          # React Native (Expo) client
│   ├── app/         # Expo Router screens
│   └── src/         # Source code (stores, services, i18n, types)
├── server/          # Node.js backend
│   └── src/         # WebSocket server, LLM providers, skills
└── docs/            # Protocol specification
```

## Quick Start

### Server

```bash
cd server
cp .env.example .env    # Edit with your API keys
npm install
npm run dev
```

### Mobile (Development)

```bash
cd mobile
npm install
npm start               # Opens Expo dev tools
```

Scan the QR code with Expo Go app on your Android device.

## Tech Stack

- **Mobile**: React Native + Expo + TypeScript + Zustand + SQLite
- **Server**: Node.js + WebSocket + Express + TypeScript
- **LLM**: DeepSeek (default), OpenAI, Anthropic (BYOK)
- **Protocol**: Simple JSON over WebSocket

## License

MIT
