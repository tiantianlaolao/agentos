# AgentOS

[English](README.md)

> Agent 时代的浏览器 —— 一个开源平台，在手机、桌面和云端运行、管理和交互 AI Agent。

AgentOS 是一个通用 AI Agent 客户端，通过统一界面连接多种 Agent 后端（OpenClaw、CoPaw、内置 LLM）。就像 Chrome 之于网站，AgentOS 之于 AI Agent。

## 核心特性

**多 Agent 支持**
- **内置助理** —— 零配置 AI 助手（DeepSeek 驱动），支持免费额度或自带 Key（BYOK）两种子模式
- **OpenClaw** —— 连接托管或自建的 [OpenClaw](https://github.com/nicepkg/openclaw) 实例，完整支持记忆、技能和会话管理
- **CoPaw** —— 连接阿里 [AgentScope](https://github.com/modelscope/agentscope) 的 CoPaw Agent（HTTP SSE 协议）

**技能系统**
- 基于 `SkillManifest` 标准的可扩展技能框架
- **技能库** —— 按用户浏览、安装和卸载技能
- 内置技能：天气查询、翻译、美股监控、计算器、汇率换算、网页搜索、链接摘要、图片生成、日期时间、Claude Code（远程开发）
- 与所有 LLM Provider 集成的 Function Calling
- 按用户的技能可见性（公开/私有）和安装状态
- 可视化技能执行卡片，实时显示状态

**桌面远程执行**
- **桌面 Shell** —— 从手机远程执行电脑上的任意 Shell 命令
- **桌面文件系统** —— 远程读取、写入和列出文件
- **Claude Code** —— 从手机远程调用桌面上的 Claude Code，分析项目、写代码、修 Bug、执行开发任务
- 桌面端自动注册为执行节点，不受聊天模式影响
- 手机端实时检测桌面在线状态并显示指示器

**三端一体**
- **移动端**（Android）—— React Native + Expo，随身指挥中心
- **桌面端**（macOS/Windows/Linux）—— Tauri v2（Rust + React），本地执行节点和工作站
- **服务端** —— Node.js WebSocket 后端，Agent 路由和云服务

**用户体系**
- 手机号注册 + 短信验证码
- JWT 认证
- 按用户隔离对话和 AI 提取的记忆
- 托管 Agent 配置，邀请码激活

**开发者友好**
- 适配器模式：实现 `AgentAdapter` 接口即可接入新 Agent 后端
- JSON-over-WebSocket 协议（[docs/protocol.md](docs/protocol.md)）
- 本地优先：聊天记录存储在设备上（SQLite）
- 国际化支持（中文 / English）
- MCP（Model Context Protocol）集成，可扩展工具访问

## 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                        客户端                              │
│  ┌──────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │  移动端   │   │    桌面端    │   │  Web（计划中）  │   │
│  │ (Expo RN) │   │  (Tauri v2)  │   │                 │   │
│  └─────┬─────┘   └──┬─────┬────┘   └─────────────────┘   │
│        │             │     │                               │
│        │          聊天│     │desktop.register               │
│        └──────┬──────┘     │(自动，所有模式)               │
│               │ WebSocket  │                               │
└───────────────┼────────────┼───────────────────────────────┘
                │            │
┌───────────────┼────────────┼───────────────────────────────┐
│          AgentOS 服务器 (:3100)                             │
│  ┌─────────────────────────────────────────────┐           │
│  │  WebSocket 处理器                            │           │
│  │  ├── 认证（JWT）                             │           │
│  │  ├── 速率限制                                │           │
│  │  ├── 记忆（提取 + 注入）                     │           │
│  │  ├── 技能注册表（Function Calling）          │           │
│  │  └── 桌面命令中继 ◄────────────────┐        │           │
│  └──────────┬──────────────────────┬──┘        │           │
│             │                      │            │           │
│  ┌──────────▼──────┐   ┌──────────▼──────────┐ │           │
│  │  Agent 适配器    │   │   LLM Provider      │ │           │
│  │  ├── OpenClaw    │   │   ├── DeepSeek      │ │           │
│  │  ├── CoPaw      │   │   ├── OpenAI        │ │           │
│  │  └── Desktop    │   │   ├── Anthropic     │ │           │
│  │                  │   │   └── Moonshot      │ │           │
│  └─────────────────┘   └─────────────────────┘ │           │
│                                                  │           │
│  桌面执行链路:                                    │           │
│  手机 → 服务器 → desktop.command → 桌面端 Rust    │           │
│  桌面端 Rust → desktop.result → 服务器 → 手机     │           │
└───────────────────────────────────────────────────────────────┘
```

## 项目结构

```
agentos/
├── mobile/          # React Native (Expo) —— Android 客户端
│   ├── app/         # Expo Router 页面（标签页、登录）
│   └── src/         # 状态管理、服务、国际化、组件
├── desktop/         # Tauri v2 —— 桌面客户端（macOS/Windows/Linux）
│   ├── src/         # React UI（聊天、设置、侧边栏、技能、记忆）
│   └── src-tauri/   # Rust 后端（WebSocket、技能执行器、MCP 桥接）
├── server/          # Node.js —— 后端服务器
│   └── src/
│       ├── adapters/    # Agent 适配器实现（OpenClaw、CoPaw、Desktop）
│       ├── providers/   # LLM Provider 集成
│       ├── skills/      # 技能定义、注册表、用户状态
│       ├── auth/        # 用户认证、托管配置
│       ├── memory/      # 对话记忆提取
│       └── websocket/   # WebSocket 连接处理
├── docs/            # 协议规范、技能开发指南
└── scripts/         # 部署和工具脚本
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm 或 yarn

### 服务端

```bash
cd server
cp .env.example .env    # 编辑并填入你的 API Key
npm install
npm run build
node dist/index.js      # 或者: npm run dev（开发模式）
```

`.env` 必填项：
```
DEEPSEEK_API_KEY=你的密钥
JWT_SECRET=你的密钥
```

### 移动端（Android）

```bash
cd mobile
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# APK 路径: android/app/build/outputs/apk/release/app-release.apk
```

也可以从 [Releases](https://github.com/tiantianlaolao/agentos/releases) 下载最新 APK。

### 桌面端

```bash
cd desktop
npm install
npm run tauri:dev       # 开发模式
npm run tauri:build     # 生产构建（.app / .exe）
```

需要 [Rust](https://rustup.rs/) 和 Tauri v2 CLI（`cargo install tauri-cli`）。

## Agent 模式

AgentOS 支持 3 种 Agent 模式，内置助理有两个子模式：

| 模式 | 说明 | 需要服务器 |
|------|------|:---:|
| **内置助理（免费额度）** | 服务器托管的 LLM（默认 DeepSeek），零配置 | 是 |
| **内置助理（自带 Key）** | 你自己的 API Key，通过服务器走技能和记忆 | 是 |
| **OpenClaw** | 托管（邀请码激活）或自建 Gateway | 托管：是 / 自建：否 |
| **CoPaw** | 托管（共享实例）或自建 AgentScope | 托管：是 / 自建：否 |

## 桌面远程执行

桌面端运行时会通过 `desktop.register` 自动注册为执行节点，无论当前使用哪种聊天模式。

**可用的桌面技能：**
- `desktop-shell` —— 执行 Shell 命令（`ls`、`open`、`osascript` 等）
- `desktop-filesystem` —— 读取、写入和列出文件
- `claude-code` —— 调用 Claude Code（`claude -p`），远程执行全栈开发任务

**手机端使用示例：**
- "在我电脑上执行 ls ~/Desktop"
- "帮我打开 bilibili"
- "读取我电脑上的 ~/notes.txt"
- "帮我分析一下 ~/agentos 项目的结构"
- "帮我修复 ~/my-app 里的登录 bug"

桌面技能在桌面端连接时自动注册并安装给当前登录用户。手机端会在桌面在线时显示绿色横幅"桌面已连接"。

## 添加新的 Agent 后端

实现 `server/src/adapters/base.ts` 中的 `AgentAdapter` 接口：

```typescript
interface AgentAdapter {
  readonly name: string;
  readonly type: AgentType;
  connect(options): Promise<void>;
  chat(messages, options?): AsyncIterable<string>;
  disconnect(): void;
  listSkills?(): Promise<SkillManifest[]>;
  // ... 完整接口见 base.ts
}
```

在 WebSocket handler 中注册适配器，即可自动支持所有客户端。

## 添加新技能

1. 在 `server/src/skills/你的技能/` 下创建目录
2. 定义 `manifest.ts`，符合 `SkillManifest` 格式（name、description、functions 使用 OpenAI Function Calling 格式）
3. 实现 `handler.ts`，处理函数调用并返回结果
4. 技能在服务器启动时通过 `SkillLoader` 自动加载，同步到技能目录

详见 [docs/skills-development.md](docs/skills-development.md)（技能开发指南）和 [docs/skills-guide.md](docs/skills-guide.md)（用户指南）。

## 技术栈

| 组件 | 技术 |
|------|------|
| **移动端** | React Native, Expo, TypeScript, Zustand, SQLite |
| **桌面端** | Tauri v2, Rust, React, TypeScript |
| **服务端** | Node.js, WebSocket (ws), Express, TypeScript, better-sqlite3 |
| **大模型** | DeepSeek, OpenAI, Anthropic, Moonshot (Kimi) |
| **协议** | JSON over WebSocket, MCP |
| **认证** | 手机号 + 短信验证码, JWT |

## 开发路线图

- [x] 多 Agent 支持（OpenClaw、CoPaw、内置助理 免费/BYOK）
- [x] 基于 SkillManifest 标准的技能系统
- [x] 用户认证和按用户隔离
- [x] 对话记忆（AI 提取的用户记忆）
- [x] 桌面端 MVP（Tauri v2）+ 自动连接
- [x] 托管 Agent 配置（邀请码 + 每用户独立实例）
- [x] 用户级技能管理（安装/卸载、技能库）
- [x] 技能目录数据库（审核标签 + 环境标签）
- [x] 桌面远程执行（Shell 命令、文件操作）
- [x] MCP 集成（服务端 MCP 转技能桥接 + 桌面本地 MCP）
- [x] 手机-桌面协同（手机发指令、桌面执行、结果返回）
- [x] 手机端桌面在线检测（绿色横幅）
- [x] Claude Code 远程技能（从手机调用桌面 Claude Code 进行开发）
- [x] 技能内容国际化（manifest 内置 locales 字段，技能名称/描述/函数说明跟随界面语言自动切换）
- [x] 统一 BYOK 子模式（移动端与桌面端一致，自带 Key 作为内置助理的子选项）
- [ ] 托管模式技能管理（OpenClaw/CoPaw）
- [ ] 桌面执行安全加固（确认弹窗、命令白名单）
- [ ] 技能市场和社区生态
- [ ] 浏览器自动化技能（Playwright）
- [ ] 多 Agent 协作
- [ ] iOS 客户端（TestFlight）
- [ ] 支付集成（微信支付 / 支付宝）

## 开源协议

[Apache License 2.0](LICENSE)
