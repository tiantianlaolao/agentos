# AgentOS WebSocket Protocol v1

## Overview

Simple JSON messages over WebSocket. Each message has a fixed envelope:

```json
{
  "id": "uuid-v4",
  "type": "message.type",
  "timestamp": 1700000000000,
  "payload": { ... }
}
```

## Connection Flow

```
Client                          Server
  |--- connect ------------------->|
  |<-- connected ------------------|
  |                                |
  |--- chat.send ----------------->|
  |<-- skill.start (optional) ----|
  |<-- skill.result (optional) ---|
  |<-- chat.chunk (streaming) ----|
  |<-- chat.chunk (streaming) ----|
  |<-- chat.done -----------------|
  |                                |
  |--- ping ---------------------->|
  |<-- pong -----------------------|
```

## Connection Modes

| Mode | Description | Required Fields |
|------|-------------|-----------------|
| `builtin` | Use server's DeepSeek (free tier) | None |
| `byok` | Bring Your Own Key | `provider`, `apiKey` |
| `openclaw` | Connect to OpenClaw instance | `openclawUrl` or `openclawHosted` |
| `copaw` | Connect to CoPaw agent | `copawUrl` or `copawHosted` |

## Message Types

### Client -> Server

| Type | Description |
|------|-------------|
| `connect` | Establish session |
| `chat.send` | Send user message |
| `chat.stop` | Stop current generation |
| `skill.list.request` | Request installed skill list |
| `skill.library.request` | Request full skill catalog |
| `skill.install` | Install a skill for current user |
| `skill.uninstall` | Uninstall a skill for current user |
| `skill.toggle` | Enable/disable a skill (legacy) |
| `desktop.register` | Register desktop client capabilities |
| `desktop.result` | Desktop skill execution result |
| `ping` | Keepalive |

### Server -> Client

| Type | Description |
|------|-------------|
| `connected` | Session established |
| `chat.chunk` | Streaming response delta |
| `chat.done` | Generation complete |
| `skill.start` | Skill invocation started |
| `skill.result` | Skill result |
| `skill.list.response` | Installed skill list |
| `skill.library.response` | Full skill catalog with install status |
| `desktop.command` | Command for desktop client to execute |
| `error` | Error |
| `pong` | Keepalive response |

## Skill Management Messages

### Skill List (installed)

```
Client:  { type: "skill.list.request" }
Server:  { type: "skill.list.response", payload: { skills: [...] } }
```

Each skill in the response:
```json
{
  "name": "weather",
  "version": "1.0.0",
  "description": "...",
  "author": "AgentOS",
  "audit": "platform",
  "auditSource": "AgentOS",
  "enabled": true,
  "installed": true,
  "environments": ["cloud"],
  "functions": [{ "name": "get_weather", "description": "..." }]
}
```

### Skill Library (catalog)

```
Client:  { type: "skill.library.request", payload?: { category?, search?, environment? } }
Server:  { type: "skill.library.response", payload: { skills: [...] } }
```

Each skill includes an `installed: boolean` field indicating the current user's install status.

### Install / Uninstall

```
Client:  { type: "skill.install", payload: { skillName: "weather" } }
Client:  { type: "skill.uninstall", payload: { skillName: "weather" } }
```

On success, the server sends an updated `skill.list.response`. On failure, an `error` message.

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_MESSAGE` | Malformed message |
| `AUTH_FAILED` | Invalid credentials or JWT |
| `RATE_LIMITED` | Free tier limit exceeded |
| `PROVIDER_ERROR` | LLM provider error |
| `SKILL_ERROR` | Skill execution error |
| `OPENCLAW_DISCONNECTED` | OpenClaw connection lost |
| `COPAW_ERROR` | CoPaw agent error |
| `INTERNAL_ERROR` | Server internal error |

## Rate Limiting (Free Tier)

- 20 messages per day per device
- Tracked by device fingerprint (sent in `connect`)
- BYOK and OpenClaw modes have no server-side limits
