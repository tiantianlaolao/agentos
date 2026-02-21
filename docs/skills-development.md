# AgentOS Skills Development Guide

This guide covers how to create, register, and manage Skills in AgentOS.

## Architecture Overview

```
server/src/skills/
├── registry.ts        # SkillRegistry — register, query, execute skills
├── loader.ts          # SkillLoader — auto-discover and load skills at startup
├── userSkills.ts      # User-level install/uninstall state (DB layer)
├── weather/           # Built-in skill example
│   ├── manifest.ts    # SkillManifest definition
│   └── handler.ts     # Function handlers
└── translate/         # Another built-in skill
    ├── manifest.ts
    └── handler.ts
```

**Data flow:**

```
SkillLoader (startup)
  → discovers skill dirs under server/src/skills/*/
  → loads manifest.ts + handler.ts from each
  → registers into SkillRegistry
  → syncs to skill_catalog DB table (for Library UI)

User sends message
  → LLM sees available tools (from installed skills)
  → LLM calls a function → SkillRegistry.execute()
  → handler runs → result fed back to LLM
  → LLM generates final response
```

## Creating a New Skill

### Step 1: Create Skill Directory

```bash
mkdir server/src/skills/my-skill
```

### Step 2: Define the Manifest

Create `manifest.ts`:

```typescript
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'my-skill',
  version: '1.0.0',
  description: 'What this skill does (shown to users and to the LLM).',
  author: 'Your Name',
  agents: '*',                    // '*' = available to all agents
  environments: ['cloud'],        // 'cloud' | 'desktop' | 'mobile'
  permissions: ['network'],       // declared capabilities
  functions: [
    {
      name: 'my_function',
      description: 'What this function does (the LLM reads this to decide when to call it).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    },
  ],
  // Audit and visibility
  audit: 'platform',             // 'platform' | 'ecosystem' | 'unreviewed'
  auditSource: 'AgentOS',
  visibility: 'public',          // 'public' | 'private'
  owner: null,                   // phone number for private skills
};
```

### Step 3: Implement Handlers

Create `handler.ts`:

```typescript
import type { SkillHandler } from '../registry.js';

const myFunction: SkillHandler = async (args) => {
  const query = args.query as string;
  if (!query) {
    throw new Error('query parameter is required');
  }

  // Your logic here — call APIs, process data, etc.
  const result = { answer: `Result for: ${query}` };

  // Must return a string (JSON stringified)
  return JSON.stringify(result);
};

export const handlers: Record<string, SkillHandler> = {
  my_function: myFunction,
};
```

### Step 4: Done

The `SkillLoader` auto-discovers any directory under `server/src/skills/` that has both `manifest.ts` and `handler.ts`. On server start:

1. Manifest + handlers are registered in `SkillRegistry`
2. Skill is synced to the `skill_catalog` DB table
3. New users get it auto-installed (if `is_default = true`)
4. It appears in the Library UI for existing users to install

## SkillManifest Reference

```typescript
interface SkillManifest {
  name: string;              // Unique identifier (kebab-case)
  version: string;           // Semver
  description: string;       // Shown in UI and to LLM
  author: string;
  agents: string;            // '*' or specific agent name
  environments: string[];    // ['cloud'], ['desktop'], ['cloud', 'desktop']
  permissions: string[];     // ['network'], ['filesystem'], etc.
  functions: SkillFunction[];
  audit?: string;            // 'platform' | 'ecosystem' | 'unreviewed'
  auditSource?: string;      // Who audited it
  visibility?: string;       // 'public' (default) | 'private'
  owner?: string;            // Required if visibility='private'
}

interface SkillFunction {
  name: string;              // Function name (snake_case)
  description: string;       // LLM reads this to decide invocation
  parameters: object;        // JSON Schema (OpenAI Function Calling format)
}
```

## Skill Visibility

| Visibility | Behavior |
|------------|----------|
| `public` | Appears in Library for all users |
| `private` | Only visible to `owner` (matched by phone number) |

Example private skill:
```typescript
visibility: 'private',
owner: '13501161326',    // Only this user can see/install it
```

## Environment Tags

| Environment | Meaning | Executed By |
|-------------|---------|-------------|
| `cloud` | API calls, data processing | Server |
| `desktop` | Local file access, OS automation | Desktop client (planned) |
| `mobile` | Phone hardware access | Mobile client (planned) |

Currently all skills run as `cloud`. Desktop remote execution is planned for Phase 2.

## Database Schema

Skills are tracked in two tables:

```sql
-- Skill catalog (synced from registry at startup)
skill_catalog (
  name TEXT PRIMARY KEY,
  version TEXT, description TEXT, author TEXT,
  category TEXT,               -- 'general', 'productivity', etc.
  environments TEXT,           -- JSON array
  functions TEXT,              -- JSON array of {name, description}
  audit TEXT, audit_source TEXT,
  visibility TEXT, owner TEXT,
  is_default INTEGER,          -- 1 = auto-install for new users
  created_at INTEGER, updated_at INTEGER
)

-- Per-user install state
user_installed_skills (
  user_id TEXT,
  skill_name TEXT,
  installed_at INTEGER,
  source TEXT,                 -- 'library', 'upload', 'desktop'
  PRIMARY KEY (user_id, skill_name)
)
```

## WebSocket Protocol

Skills use these message types for client-server communication:

### Skill List (installed skills)

```
Client → Server:  { type: "skill.list.request" }
Server → Client:  { type: "skill.list.response", payload: { skills: SkillManifestInfo[] } }
```

### Skill Library (full catalog)

```
Client → Server:  { type: "skill.library.request" }
Server → Client:  { type: "skill.library.response", payload: { skills: SkillLibraryItem[] } }
```

### Install / Uninstall

```
Client → Server:  { type: "skill.install", payload: { skillName: "weather" } }
Client → Server:  { type: "skill.uninstall", payload: { skillName: "weather" } }
```

### Skill Execution Events (during chat)

```
Server → Client:  { type: "skill.start", payload: { skillName, description } }
Server → Client:  { type: "skill.result", payload: { skillName, result } }
```

## Function Calling Flow

When a user sends a message:

```
1. Server collects tools from user's installed skills
   → registry.toToolsForInstalledUser(ctx, installedNames)

2. LLM receives: system prompt + chat history + available tools

3. If LLM returns tool_calls:
   → Server executes each via registry.executeForInstalledUser()
   → Emits SKILL_START / SKILL_RESULT events to client
   → Feeds results back to LLM (up to 5 rounds)

4. LLM generates final text response → streamed to client
```

Anonymous (not logged in) users get all public default skills. Logged-in users get only their installed skills.

## Testing

To test a skill without the full client:

```javascript
// Connect via WebSocket
const ws = new WebSocket('ws://localhost:3100/ws');
ws.send(JSON.stringify({
  id: 'test-1', type: 'connect', timestamp: Date.now(),
  payload: { mode: 'builtin', authToken: 'your-jwt-token' }
}));

// After connected, send a message that triggers your skill
ws.send(JSON.stringify({
  id: 'test-2', type: 'chat.send', timestamp: Date.now(),
  payload: { conversationId: 'test', content: 'What is the weather in Tokyo?', history: [] }
}));
```
