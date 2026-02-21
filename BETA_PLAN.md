# AgentOS Beta 实施计划

## 定位
AgentOS 是通用 AI Agent 客户端平台。OpenClaw 是首个适配的 agent，用于吸引用户；内置 agent 逐步完善，成为平台核心竞争力。面向中国市场优先，架构全球化。

---

## Sprint 1: 用户体系 + 多模型内置 Agent（约 3-4 天）

### 1.1 服务端 - 用户注册/登录
- **数据库**: 添加 better-sqlite3，创建 `users` 表（id, phone, password_hash, created_at）和 `sms_codes` 表
- **腾讯云 SMS**: 集成 `tencentcloud-sdk-nodejs`，发送验证码
  - 需要先在腾讯云控制台：创建短信签名 + 审批验证码模板
- **API 端点**（新增 Express 路由）:
  - `POST /auth/send-code` — 发送验证码
  - `POST /auth/register` — 手机号 + 验证码 + 密码注册
  - `POST /auth/login` — 手机号 + 密码登录，返回 JWT
- **WS 认证**: CONNECT 消息新增 `authToken` 字段，服务端验证 JWT
- **限流改造**: 从 deviceId 改为 userId，注册用户 50 条/天，未注册 20 条/天

### 1.2 服务端 - 多模型支持
- **新增 Provider**:
  - `src/providers/openai.ts` — GPT-4o / GPT-4o-mini
  - `src/providers/anthropic.ts` — Claude 3.5 Sonnet / Haiku（使用 Anthropic SDK）
  - `src/providers/moonshot.ts` — Kimi（OpenAI 兼容 API）
- **更新 factory.ts**: builtin 模式根据用户选择的模型路由到对应 provider
- **协议更新**: CONNECT 消息新增 `model` 字段
- **环境变量**: 新增各模型 API Key（`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MOONSHOT_API_KEY`）
- **系统提示词**: 每个 provider 独立的中文友好系统提示，不再声称自己是其他 AI

### 1.3 移动端 - 登录注册
- **新页面**: `app/login.tsx` — 手机号 + 验证码 + 密码
- **Auth Store**: `src/stores/authStore.ts` — userId, authToken, isLoggedIn, phone
- **路由守卫**: 根布局 `_layout.tsx` 检查登录状态，未登录跳转登录页
- **匿名模式**: 允许跳过登录，使用 deviceId 身份（保留现有体验，但功能受限）

### 1.4 移动端 - 模型选择
- **设置页增强**: builtin 模式下显示模型选择器（DeepSeek / GPT-4o / Kimi / Claude）
- **Settings Store 扩展**: 新增 `selectedModel` 字段
- **协议同步**: CONNECT 消息携带 model 参数

---

## Sprint 2: 直连优化（约 2-3 天）

### 2.1 BYOK 直连（去掉服务器中间层）
- **目标**: BYOK 模式下，App 直接调用 LLM API，API Key 不经过服务器
- **移动端新增**:
  - `src/services/directLLM.ts` — HTTP streaming 客户端，支持 OpenAI/Anthropic/DeepSeek API
  - 使用 React Native 的 `fetch` + `ReadableStream` 实现 SSE 流式
  - 统一接口：`chat(messages, options) → AsyncIterable<string>`
- **Chat 页面改造**: 根据 mode 决定走 WS（builtin/openclaw）还是直连（byok）
- **安全**: API Key 只存本地 SQLite，不传输到服务器

### 2.2 OpenClaw 自托管直连
- **目标**: 自托管 OpenClaw 用户，App 直接连用户的 Gateway，不经过 AgentOS Server
- **移动端新增**:
  - `src/services/openclawDirect.ts` — 复用服务端 OpenClaw 适配器的 WS 协议，在移动端实现
  - 连接挑战/响应握手 + chat.send + 流式接收
- **推送**: 直连模式下推送也直接走用户的 Gateway WS 连接

### 2.3 架构成果
```
builtin 模式:    App → AgentOS Server → 多模型 API
BYOK 模式:       App → LLM API 直连（服务器不参与）
OpenClaw 云托管:  App → AgentOS Server → OpenClaw Gateway
OpenClaw 自托管:  App → 用户的 Gateway 直连（服务器不参与）
```

---

## Sprint 3: 打磨发布（约 1-2 天）

### 3.1 翻译 Skill
- builtin 模式硬编码：检测翻译意图 → 调用 LLM 翻译 → SkillCard 展示

### 3.2 英文 GitHub README
- 项目介绍、功能列表、截图、安装指南

### 3.3 APK 分发
- 构建 Release APK
- 上传蓝奏云/123 云盘
- 服务器下载页

---

## 文件改动清单

### 服务端新增
| 文件 | 说明 |
|------|------|
| `src/auth/sms.ts` | 腾讯云 SMS 封装 |
| `src/auth/jwt.ts` | JWT 生成/验证 |
| `src/auth/routes.ts` | Express 路由: send-code, register, login |
| `src/auth/db.ts` | SQLite 用户数据库 |
| `src/providers/openai.ts` | OpenAI Provider |
| `src/providers/anthropic.ts` | Anthropic Provider |
| `src/providers/moonshot.ts` | Moonshot/Kimi Provider |

### 服务端修改
| 文件 | 变更 |
|------|------|
| `src/types/protocol.ts` | 新增 authToken、model 字段 |
| `src/providers/factory.ts` | 支持多模型路由 |
| `src/websocket/handler.ts` | JWT 验证 + 按用户限流 |
| `src/middleware/rateLimit.ts` | 从 deviceId 改为 userId |
| `src/index.ts` | 挂载 auth 路由 |
| `package.json` | 新增 better-sqlite3, tencentcloud-sdk-nodejs, jsonwebtoken, bcrypt |

### 移动端新增
| 文件 | 说明 |
|------|------|
| `app/login.tsx` | 登录/注册页 |
| `src/stores/authStore.ts` | 认证状态 |
| `src/services/directLLM.ts` | BYOK 直连 LLM |
| `src/services/openclawDirect.ts` | OpenClaw 直连 |

### 移动端修改
| 文件 | 变更 |
|------|------|
| `app/_layout.tsx` | 登录路由守卫 |
| `app/(tabs)/settings.tsx` | 模型选择 + 直连选项 |
| `app/(tabs)/index.tsx` | 支持直连模式 chat |
| `src/stores/settingsStore.ts` | 新增 model 字段 |
| `src/types/protocol.ts` | 同步服务端协议 |
| `src/services/websocket.ts` | CONNECT 携带 authToken + model |
| `src/i18n/zh.ts` / `en.ts` | 新增翻译 key |

---

## 前置条件（需要你操作）
1. **腾讯云 SMS**: 登录控制台创建短信签名和验证码模板（审批需 ~2 小时）
2. **API Keys**: 准备 OpenAI / Anthropic / Moonshot 的 API Key（如果要支持多模型）
3. **确认**: 是否每个模型都需要服务端配置 Key，还是只提供 BYOK 方式？
