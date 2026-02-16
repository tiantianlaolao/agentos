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
| `openclaw` | Connect to OpenClaw instance | `openclawUrl` |

## Message Types

### Client -> Server

| Type | Description |
|------|-------------|
| `connect` | Establish session |
| `chat.send` | Send user message |
| `chat.stop` | Stop current generation |
| `ping` | Keepalive |

### Server -> Client

| Type | Description |
|------|-------------|
| `connected` | Session established |
| `chat.chunk` | Streaming response delta |
| `chat.done` | Generation complete |
| `skill.start` | Skill invocation started |
| `skill.result` | Skill result |
| `error` | Error |
| `pong` | Keepalive response |

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_MESSAGE` | Malformed message |
| `AUTH_FAILED` | Invalid API key |
| `RATE_LIMITED` | Free tier limit exceeded |
| `PROVIDER_ERROR` | LLM provider error |
| `SKILL_ERROR` | Skill execution error |
| `OPENCLAW_DISCONNECTED` | OpenClaw connection lost |
| `INTERNAL_ERROR` | Server internal error |

## Rate Limiting (Free Tier)

- 20 messages per day per device
- Tracked by device fingerprint (sent in `connect`)
- BYOK and OpenClaw modes have no server-side limits
