# MCP 与 Skills：一篇给普通人看的说明

> 如果你不是开发者，只是想用 AgentOS 的"技能"功能，这篇文档帮你搞清楚背后的逻辑。

---

## 什么是 Skill（技能）？

Skill 就是 **AI 助理的能力扩展**。

没有 Skill 的 AI，只能跟你聊天。装上 Skill 之后，它可以：

- 查天气、查汇率、查股票
- 搜索网页、总结文章
- 生成图片
- 操作你电脑上的文件
- ……

你可以把 Skill 理解为 **手机上的 App**：

| 手机 | AgentOS |
|------|---------|
| App Store | Skill 市场 |
| 安装一个 App | 安装一个 Skill |
| App 有不同权限（相机、位置） | Skill 有不同权限（网络、文件） |
| 有官方 App 也有第三方 App | 有官方 Skill 也有第三方 Skill |

在 AgentOS 里，你可以在 **Skill Library（技能库）** 里浏览、搜索、安装和卸载技能。

---

## 什么是 MCP？

MCP 的全称是 **Model Context Protocol**（模型上下文协议）。

听起来很技术，但核心概念很简单：

> **MCP 是一个"接口标准"，让 AI 可以统一地调用各种外部工具。**

### 用 USB 来类比

在 USB 出现之前，每种设备都有自己的接口——打印机一种线、鼠标一种线、相机又一种线。USB 出现后，一个接口连接所有设备。

MCP 做的事情一模一样：

```
USB 之前：每种设备 → 每种线          混乱
USB 之后：所有设备 → 一种线（USB）    统一

MCP 之前：每个 AI → 单独对接每个工具   混乱
MCP 之后：所有 AI → 一种协议（MCP）    统一
```

有了 MCP，一个"GitHub 工具"写一次，所有支持 MCP 的 AI 客户端（Claude、Cursor、AgentOS 等）都能直接用。

### 一个 MCP Server 里有什么？

一个 MCP Server 是一个**工具包**，里面可以包含**一个或多个工具（tools）**：

```
mcp-server-github（1 个 Server = 1 个工具包）
  ├── create_issue         创建 Issue
  ├── list_pull_requests   列出 PR
  ├── create_branch        创建分支
  ├── search_repositories  搜索仓库
  └── ...                  共 20+ 个工具

mcp-server-filesystem（1 个 Server = 1 个工具包）
  ├── read_file            读文件
  ├── write_file           写文件
  ├── list_directory       列目录
  └── search_files         搜索文件
```

转换到 AgentOS 里的对应关系：

```
1 个 MCP Server   →   1 个 Skill（技能）
Server 里的 tools  →   Skill 里的 functions（功能）

用户看到的：
  🐙 GitHub 工具  [官方认证] [已安装]
    功能：创建 Issue、列出 PR、创建分支、搜索仓库...
```

你不需要关心一个技能背后有几个工具。安装一个技能，AI 就自动获得这个技能包里的所有能力。

### MCP 的生态有多大？

MCP 由 Anthropic（Claude 的公司）在 2024 年底发起，短短一年多，生态已经爆发：

- 官方收录的 MCP Server：90+ 个
- 第三方市场总计：**17,000+ 个**
- 覆盖领域：搜索、数据库、开发工具、办公协作、地图、日历、文件管理……

---

## MCP 和 Skill 是什么关系？

**MCP 不等于 Skill。MCP 是 Skill 的来源之一。**

AgentOS 的 Skill 可以来自四种途径：

```
              ┌──────────────────────────────┐
              │   你在 AgentOS 里看到的 Skill   │
              │                                │
              │   查天气  翻译  搜索  写代码助手   │
              └──────────┬───────────────────┘
                         │
          ┌──────────────┼──────────────────┐
          │              │                  │
    ┌─────┴─────┐  ┌─────┴─────┐  ┌────────┴────────┐
    │  内置技能   │  │ MCP 转换  │  │ SKILL.md 知识型  │
    │ (我们自研)  │  │(自动接入)  │  │  (纯文本定义)    │
    └───────────┘  └───────────┘  └─────────────────┘
```

### 来源一：内置技能

AgentOS 团队自己开发的技能，比如天气查询、汇率换算、网页搜索等。代码完全可控，质量最高。

### 来源二：MCP 转换

AgentOS 内置了一个"桥接器"，可以把任何 MCP 工具自动包装成 Skill。

你不需要知道什么是 MCP。当你在技能库里看到"GitHub 工具"、"数据库查询"这些技能时，它们背后可能就是 MCP，但你只需要点"安装"就行了。

### 来源三：SKILL.md 知识型技能

不是所有技能都需要调用外部工具。有些技能只是给 AI 注入"专业知识"：

- "SEO 优化专家"——教 AI 如何分析网页 SEO
- "代码审查助手"——教 AI 按照最佳实践审查代码
- "邮件写作模板"——教 AI 用专业格式写商务邮件

这类技能本质上是一段精心编写的提示词（Prompt），用 Markdown 文件定义，不涉及任何 API 调用。

---

## 为什么 AgentOS 不直接用 MCP，还要做自己的 Skill 系统？

这是最关键的问题。简单来说：

> **MCP 只管"AI 怎么调用工具"，不管"用户怎么使用工具"。**

### 1. MCP 缺少用户管理

MCP 没有"安装/卸载"的概念。它不知道哪个用户装了哪些工具，也没有用户配置、权限确认这些功能。

Skill 系统提供了这些：

| 功能 | MCP 有吗 | Skill 有吗 |
|------|---------|-----------|
| AI 调用工具 | 有 | 有 |
| 用户安装/卸载 | 没有 | 有 |
| 按用户隔离（你装了我没装） | 没有 | 有 |
| 技能市场（浏览/搜索/分类） | 没有 | 有 |
| 安全审核和信任等级 | 没有 | 有 |
| 用户填写配置（比如 API Key） | 没有 | 有 |
| 多语言展示 | 没有 | 有 |
| 使用量统计 | 没有 | 有 |

### 2. 不是所有能力都适合用 MCP

| 场景 | 适合 MCP 吗 | 说明 |
|------|-----------|------|
| 调用 GitHub API | 适合 | MCP 擅长这种"调工具"的场景 |
| 查数据库 | 适合 | 标准的工具调用 |
| SEO 优化知识 | 不适合 | 这是纯知识注入，没有工具可调 |
| 邮件写作模板 | 不适合 | 同上，纯 Prompt 指令 |
| 简单的 HTTP 接口 | 不太值得 | 小开发者写个 REST API 比学 MCP 协议简单得多 |

### 3. 用户体验差异

直接暴露 MCP 给用户是这样的：

```
mcp-server-brave-search
  tools: brave_web_search(query, count, offset)
         brave_local_search(query, count)
```

经过 Skill 系统包装后是这样的：

```
🔍 网页搜索                    [官方认证]
  搜索互联网，获取最新信息和答案
  [已安装]  [10,234 人在用]
```

哪个普通用户更容易理解？

---

## 别的 AI 客户端怎么用 MCP？

几乎所有 AI 客户端（Claude Desktop、Cursor、Windsurf 等）用 MCP 的方式都是一样的：**用户手动编辑 JSON 配置文件**。

以 Claude Desktop 为例，用户需要：

1. 自己去 GitHub 或市场上找到想用的 MCP Server
2. 打开一个配置文件，手写 JSON（指定启动命令、参数、密钥等）
3. 重启 Claude Desktop
4. 工具直接全部生效——没有"安装/卸载"，所有对话都能用

```
Claude Desktop / Cursor：
  用户自己找 → 手动写 JSON → 重启 → 全部生效，无法按需开关
  （像手动安装电脑驱动程序）

AgentOS：
  我们预置 → 自动转成 Skill → 用户点"安装" → 按用户隔离
  （像 App Store 装 App）
```

这就是 AgentOS 做 Skill 系统的核心价值——**把开发者才能用的东西，变成普通人能用的**。

---

## 一句话总结

| 概念 | 一句话解释 |
|------|-----------|
| **MCP** | AI 调用工具的"通信协议"（像 USB 线） |
| **MCP Server** | 遵循 MCP 协议的"工具包"（像 USB 设备） |
| **Skill** | 用户在 AgentOS 里看到的"技能"（像手机 App） |
| **Skill 系统** | 管理技能的完整框架（像 App Store） |

```
MCP 是我们最大的"供货商"（上万个现成工具）
但 Skill 系统是面向用户的"商店"

就像 App Store 里的 App 不全是用 Swift 写的——
Skill 市场里的 Skill 也不全是 MCP 来的。
MCP 是来源之一，不是全部。
```

---

## HTTP 技能：最简单的扩展方式

除了内置技能和 MCP，AgentOS 还支持一种门槛最低的方式——**HTTP 技能**。

### 什么是 HTTP 技能？

如果你（或你的公司）已经有一个 API 接口，不需要学任何新协议，直接把 URL 告诉 AgentOS 就行：

```
你有个 API：https://my-milktea.com/api/skill
  ↓
在 AgentOS 里填入 URL + 描述功能
  ↓
自动变成你的私有 Skill
  ↓
跟 AI 说"珍珠奶茶还有多少"→ AI 调你的 API → 返回答案
```

AI 调用时，AgentOS 会向你的 URL 发送这样的请求：

```json
POST https://my-milktea.com/api/skill

{
  "function": "check_inventory",
  "args": { "product": "珍珠奶茶" }
}
```

你的服务器返回结果，AI 就能读懂并回复用户。

### HTTP 技能是按用户隔离的

你注册的 HTTP 技能**只有你自己能看到和使用**，别的用户看不到。这保护了你的业务接口不被他人访问。

### 同一个需求，三种实现方式

以"奶茶店库存查询"为例：

| | 内置 Skill | MCP Server | HTTP Skill |
|---|---|---|---|
| **代码写在哪** | AgentOS 源码里 | 独立的工具包 | 你自己的服务器 |
| **谁来做** | AgentOS 团队 | 任何开发者 | 任何开发者 |
| **谁能用** | 所有用户 | 所有用户 | 仅注册者自己 |
| **能跨平台吗** | 仅 AgentOS | Claude/Cursor 等都能用 | 仅 AgentOS |
| **技术门槛** | 要懂 AgentOS 源码 | 要学 MCP 协议 | 会写 POST 接口就行 |
| **适合场景** | 天气、翻译等通用能力 | GitHub、数据库等标准工具 | 接入已有的业务系统 |

三种方式最终效果一样——用户跟 AI 说需求，AI 都能给出答案。区别在于谁来做、给谁用、怎么部署。

**HTTP 技能的核心价值是"门槛最低"**——你的奶茶店已经有管理后台了，后台本来就有查库存的 API，不想重写成 MCP 也不想改 AgentOS 源码，直接填个 URL 就接进来了。

---

## 行业对比：各平台怎么做"自定义 API 接入"

"开发者提供 API → 平台自动变成 AI 能力"这种模式是**行业共识**，不是 AgentOS 独创。但各家做法不同：

### ChatGPT — GPT Actions

OpenAI 最早做这个模式。创建自定义 GPT 时可以添加"Actions"——开发者提供一个 OpenAPI Schema（描述 API 的 JSON 文件）和 URL，ChatGPT 就知道怎么调用。

但 GPT Actions **锁死在 ChatGPT 平台**，其他 AI 客户端用不了。

### OpenClaw ClawHub — Skill 里用 fetch

ClawHub 是 OpenClaw 的技能市场（3000+ 技能）。开发者写 JavaScript 代码，在代码里用 `fetch` 调 HTTP 接口。本质也是 HTTP 调用，只是包装在 JS 代码里。

### Coze（字节跳动）— 插件系统

和 ChatGPT 类似，开发者提交 API 接口描述，平台自动集成。锁定在字节生态内。

### Dify — 自定义工具节点

可视化工作流里添加"自定义工具"节点，填 API URL 和参数描述。

### 各平台对比一览

| 平台 | 接入方式 | 锁定在哪 | 开发者门槛 |
|------|---------|---------|-----------|
| **ChatGPT** GPT Actions | OpenAPI Schema + URL | 锁定 ChatGPT | 中（要写 OpenAPI JSON） |
| **Coze** 插件 | API URL + 参数描述 | 锁定字节生态 | 低 |
| **Dify** 自定义工具 | API URL + 配置 | 锁定 Dify | 低 |
| **OpenClaw** ClawHub | JS 代码 + fetch | 锁定 OpenClaw | 中（要写 JavaScript） |
| **AgentOS** HTTP Skill | API URL + 函数描述 | AgentOS | 最低（只需有个 POST 接口） |

### AgentOS 的差异点

1. **门槛最低**：不需要学 OpenAPI Schema，不需要写 JS 代码，只需要有一个能接收 POST 请求的接口
2. **按用户隔离**：你注册的 Skill 只有你能看到，保护业务数据
3. **统一管理**：HTTP Skill 和内置 Skill、MCP Skill 在同一个技能库里展示，用户体验一致
4. **安全防护**：内置 SSRF 防护（禁止访问内网地址）、超时限制、响应大小限制

---

## 一句话总结

| 概念 | 一句话解释 |
|------|-----------|
| **MCP** | AI 调用工具的"通信协议"（像 USB 线） |
| **MCP Server** | 遵循 MCP 协议的"工具包"（像 USB 设备） |
| **HTTP Skill** | 把你已有的 API 接口接入 AgentOS（像给 App 加个快捷方式） |
| **SKILL.md** | 纯文本定义的"知识型技能"（像给 AI 一本专业手册） |
| **Skill** | 用户在 AgentOS 里看到的"技能"（像手机 App） |
| **Skill 系统** | 管理所有技能的完整框架（像 App Store） |

```
Skill 的四种来源：

内置代码    → AgentOS 团队自研，质量最高
MCP 转换    → 接入万级生态，数量最多
SKILL.md   → 纯文本定义，创建成本最低
HTTP Skill → 接入已有系统，门槛最低

四种来源，一个商店，统一体验。
```

---

## 延伸阅读

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP 官方 Server 仓库](https://github.com/modelcontextprotocol/servers)
- [GPT Actions vs MCP 对比](https://fast.io/resources/gpt-actions-vs-mcp/)
- [ClawHub Skills Marketplace 开发指南](https://www.digitalapplied.com/blog/clawhub-skills-marketplace-developer-guide-2026)
- [AgentOS Skill 开发指南](./skills-development.md)
- [AgentOS Skill 使用指南](./skills-guide.md)
