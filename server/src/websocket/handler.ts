import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  MessageType,
  ErrorCode,
  type ClientMessage,
  type ServerMessage,
  type ConnectMessage,
  type ChatSendMessage,
  type ConnectionMode,
  type SkillInvocation,
  type ChatHistoryItem,
  type SkillToggleMessage,
  type SkillInstallMessage,
  type SkillUninstallMessage,
  type SkillLibraryRequestMessage,
  type DesktopRegisterMessage,
  type DesktopCommandMessage,
  type DesktopResultMessage,
} from '../types/protocol.js';
import { createProvider } from '../providers/factory.js';
import type { LLMProvider, ToolCall } from '../providers/base.js';
import { OpenClawAdapter } from '../adapters/openclaw.js';
import { isAgentAdapter, type AgentAdapter } from '../adapters/base.js';
import { DesktopAdapter, registerDesktopSession, unregisterDesktopSession, getDesktopSession, hasDesktopOnline } from '../adapters/desktop.js';
import { skillRegistry } from '../skills/registry.js';
import { checkRateLimit, incrementCount } from '../middleware/rateLimit.js';
import {
  installSkillForUser,
  uninstallSkillForUser,
  getUserInstalledSkillNames,
  listSkillCatalog,
  getUserSkillConfig,
  setUserSkillConfig,
} from '../skills/userSkills.js';
import { verifyToken } from '../auth/jwt.js';
import { getMemory, migrateMemory } from '../memory/store.js';
import { extractAndUpdateMemory } from '../memory/extractor.js';
import { getHostedAccount, checkHostedQuota, incrementHostedUsage } from '../auth/hosted.js';

interface Session {
  id: string;
  mode: ConnectionMode;
  deviceId: string;
  userId: string | null;
  userPhone: string | null;
  provider: LLMProvider | AgentAdapter | null;
  abortController: AbortController | null;
  isHosted: boolean;
}

// ── Desktop WebSocket mapping: userId → ws (for relaying commands to desktop) ──
const desktopWebSockets = new Map<string, WebSocket>();

export function getDesktopWebSocket(userId: string): WebSocket | undefined {
  return desktopWebSockets.get(userId);
}

// ── Desktop pending commands: commandId → { resolve, reject, timer } ──
interface PendingDesktopCommand {
  resolve: (value: { success: boolean; data?: Record<string, unknown>; error?: string }) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingDesktopCommands = new Map<string, PendingDesktopCommand>();

/**
 * Execute a function on the user's desktop client.
 * Sends DESKTOP_COMMAND via WebSocket and waits for DESKTOP_RESULT.
 */
export async function executeOnDesktop(
  userId: string,
  functionName: string,
  args: Record<string, unknown>,
  timeout = 30000,
): Promise<string> {
  const desktopWs = desktopWebSockets.get(userId);
  if (!desktopWs || desktopWs.readyState !== WebSocket.OPEN) {
    throw new Error('Desktop client not connected');
  }

  const commandId = uuidv4();

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingDesktopCommands.delete(commandId);
      reject(new Error(`Desktop command timed out after ${timeout / 1000}s`));
    }, timeout);

    pendingDesktopCommands.set(commandId, {
      resolve: (result) => {
        clearTimeout(timer);
        pendingDesktopCommands.delete(commandId);
        if (result.success) {
          resolve(JSON.stringify(result.data || {}));
        } else {
          reject(new Error(result.error || 'Desktop command failed'));
        }
      },
      reject: (err) => {
        clearTimeout(timer);
        pendingDesktopCommands.delete(commandId);
        reject(err);
      },
      timer,
    });

    // Send command to desktop
    send(desktopWs, {
      id: uuidv4(),
      type: MessageType.DESKTOP_COMMAND,
      timestamp: Date.now(),
      payload: {
        command: functionName,
        args,
        commandId,
      },
    });

    console.log(`[Desktop] Sent command "${functionName}" (id=${commandId}) to desktop for user ${userId}`);
  });
}

// ── Push message infrastructure ──
const pendingPushMessages: Array<{ content: string; timestamp: number }> = [];
let activePushWs: WebSocket | null = null;
let backgroundPushAdapter: OpenClawAdapter | null = null;

function deliverPushMessage(content: string): void {
  console.log('[Push] Received:', content.slice(0, 100));
  if (activePushWs && activePushWs.readyState === WebSocket.OPEN) {
    send(activePushWs, {
      id: uuidv4(),
      type: MessageType.PUSH_MESSAGE,
      timestamp: Date.now(),
      payload: { content, source: 'openclaw-cron' },
    });
  } else {
    pendingPushMessages.push({ content, timestamp: Date.now() });
    console.log(`[Push] Queued (${pendingPushMessages.length} pending)`);
  }
}

function flushPushQueue(ws: WebSocket): void {
  if (pendingPushMessages.length === 0) return;
  console.log(`[Push] Flushing ${pendingPushMessages.length} queued messages`);
  while (pendingPushMessages.length > 0) {
    const msg = pendingPushMessages.shift()!;
    send(ws, {
      id: uuidv4(),
      type: MessageType.PUSH_MESSAGE,
      timestamp: Date.now(),
      payload: { content: msg.content, source: 'openclaw-cron' },
    });
  }
}

/**
 * Start a persistent background connection to OpenClaw Gateway
 * for receiving push messages (cron, scheduled tasks) even when
 * no mobile client is connected. Messages are queued and flushed
 * when a client reconnects.
 */
export function initPushListener(url: string, token?: string): void {
  function connect() {
    if (backgroundPushAdapter) {
      backgroundPushAdapter.onPushMessage = null;
      backgroundPushAdapter.onDisconnect = null;
      backgroundPushAdapter.cleanup();
    }
    const adapter = new OpenClawAdapter(url, token);
    adapter.onPushMessage = (content: string) => {
      deliverPushMessage(content);
    };
    adapter.onDisconnect = () => {
      console.log('[Push] Gateway connection lost, reconnecting in 10s...');
      setTimeout(connect, 10000);
    };
    backgroundPushAdapter = adapter;
    adapter.ensureConnected()
      .then(() => console.log('[Push] Background listener connected to OpenClaw'))
      .catch((err) => {
        console.error('[Push] Background listener failed:', err.message);
        setTimeout(connect, 10000);
      });
  }
  connect();
}

export function handleConnection(ws: WebSocket): void {
  let session: Session | null = null;

  ws.on('message', async (data) => {
    let message: ClientMessage;

    try {
      message = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      sendError(ws, ErrorCode.INVALID_MESSAGE, 'Invalid JSON');
      return;
    }

    try {
      switch (message.type) {
        case MessageType.CONNECT:
          try {
            session = await handleConnect(ws, message);
          } catch (e) {
            // handleConnect already sent error to client before throwing
            console.error('[WS] Connect failed:', e instanceof Error ? e.message : e);
          }
          break;

        case MessageType.CHAT_SEND:
          if (!session) {
            sendError(ws, ErrorCode.INVALID_MESSAGE, 'Not connected');
            return;
          }
          await handleChatSend(ws, session, message);
          break;

        case MessageType.CHAT_STOP:
          if (session?.abortController) {
            session.abortController.abort();
            session.abortController = null;
          }
          break;

        case MessageType.SKILL_LIST_REQUEST:
          handleSkillListRequest(ws, session ?? undefined);
          break;

        case MessageType.SKILL_TOGGLE:
          handleSkillToggle(ws, message as SkillToggleMessage, session ?? undefined);
          break;

        case MessageType.SKILL_INSTALL:
          handleSkillInstall(ws, message as SkillInstallMessage, session ?? undefined);
          break;

        case MessageType.SKILL_UNINSTALL:
          handleSkillUninstall(ws, message as SkillUninstallMessage, session ?? undefined);
          break;

        case MessageType.SKILL_LIBRARY_REQUEST:
          handleSkillLibraryRequest(ws, message as SkillLibraryRequestMessage, session ?? undefined);
          break;

        case MessageType.SKILL_CONFIG_GET:
          handleSkillConfigGet(ws, message as any, session ?? undefined);
          break;

        case MessageType.SKILL_CONFIG_SET:
          handleSkillConfigSet(ws, message as any, session ?? undefined);
          break;

        case MessageType.DESKTOP_REGISTER:
          console.log(`[WS] Received desktop.register from session ${session?.id}, userId=${session?.userId}`);
          if (session) {
            handleDesktopRegister(ws, session, message as DesktopRegisterMessage);
          }
          break;

        case MessageType.DESKTOP_COMMAND:
          if (session) {
            handleDesktopCommand(ws, session, message as DesktopCommandMessage);
          }
          break;

        case MessageType.DESKTOP_RESULT: {
          // Desktop sends back result for a command — resolve pending promise
          const resultPayload = (message as DesktopResultMessage).payload;
          const pending = pendingDesktopCommands.get(resultPayload.commandId);
          if (pending) {
            pending.resolve({
              success: resultPayload.success,
              data: resultPayload.data,
              error: resultPayload.error,
            });
          } else {
            console.log('[Desktop] Result received for unknown commandId:', resultPayload.commandId);
          }
          break;
        }

        case MessageType.PING:
          send(ws, { id: uuidv4(), type: MessageType.PONG, timestamp: Date.now() });
          break;

        default:
          sendError(ws, ErrorCode.INVALID_MESSAGE, `Unknown message type`);
      }
    } catch (error) {
      console.error('[WS] Handler error:', error);
      sendError(
        ws,
        ErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Internal error'
      );
    }
  });

  // Keep-alive ping every 30 seconds to prevent NAT/firewall timeout
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('close', () => {
    clearInterval(pingInterval);
    if (session) {
      session.abortController?.abort();
      if (activePushWs === ws) {
        activePushWs = null;
      }
      // Clean up desktop session (registered via desktop.register, not tied to mode)
      if ((session as unknown as Record<string, boolean>)._desktopRegistered && session.userId) {
        desktopWebSockets.delete(session.userId);
        unregisterDesktopSkills(session.userId);
        unregisterDesktopSession(session.userId);
      }
      // Clean up agent adapter
      if (session.provider && isAgentAdapter(session.provider)) {
        session.provider.cleanup();
      }
      console.log(`[WS] Session ${session.id} disconnected`);
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] Connection error:', error);
  });
}

/** Handle SKILL_LIST_REQUEST: return skills for the current agent mode */
async function handleSkillListRequest(ws: WebSocket, session?: Session): Promise<void> {
  // For agent adapter modes (openclaw, copaw), query the adapter's own skills
  if (session && session.provider && isAgentAdapter(session.provider) && typeof session.provider.listSkills === 'function') {
    try {
      const adapterSkills = await session.provider.listSkills();
      const adapterName = (session.provider as AgentAdapter).name;
      const skills = adapterSkills.map((s) => {
        const extra = s as unknown as Record<string, unknown>;
        return {
          name: s.name,
          version: s.version || '1.0.0',
          description: s.description || '',
          author: s.author || adapterName,
          audit: s.audit || 'ecosystem',
          auditSource: s.auditSource || adapterName,
          enabled: extra.disabled !== true,
          emoji: typeof extra.emoji === 'string' ? extra.emoji : undefined,
          eligible: typeof extra.eligible === 'boolean' ? extra.eligible : undefined,
          functions: (s.functions || []).map((f) => ({
            name: f.name,
            description: f.description,
          })),
        };
      });
      send(ws, {
        id: uuidv4(),
        type: MessageType.SKILL_LIST_RESPONSE,
        timestamp: Date.now(),
        payload: { skills },
      });
      return;
    } catch (err) {
      console.error(`[Skills] Failed to list skills from ${session.provider.name}:`, err);
      // Fall through to builtin skills
    }
  }

  // Default: return builtin skills from registry (for builtin/byok modes)
  // Filter by user visibility (public + user's private skills)
  const userCtx = session ? { userId: session.userId, userPhone: session.userPhone } : undefined;
  const installedNames = session?.userId
    ? getUserInstalledSkillNames(session.userId)
    : null; // null = anonymous, show all

  const skills = skillRegistry.listForUser(userCtx).map((s) => ({
    name: s.manifest.name,
    version: s.manifest.version,
    description: s.manifest.description,
    author: s.manifest.author,
    audit: s.manifest.audit,
    auditSource: s.manifest.auditSource,
    enabled: s.enabled,
    installed: installedNames ? installedNames.includes(s.manifest.name) : true,
    environments: s.manifest.environments,
    visibility: s.manifest.visibility || 'public',
    functions: s.manifest.functions.map((f) => ({
      name: f.name,
      description: f.description,
    })),
  }));

  send(ws, {
    id: uuidv4(),
    type: MessageType.SKILL_LIST_RESPONSE,
    timestamp: Date.now(),
    payload: { skills },
  });
}

/** Handle SKILL_TOGGLE: legacy no-op, redirect to install/uninstall */
function handleSkillToggle(ws: WebSocket, _message: SkillToggleMessage, session?: Session): void {
  handleSkillListRequest(ws, session).catch(() => {});
}

/** Handle SKILL_INSTALL: install a skill for the current user */
function handleSkillInstall(ws: WebSocket, message: SkillInstallMessage, session?: Session): void {
  const { skillName } = message.payload;
  if (!session?.userId) {
    sendError(ws, ErrorCode.AUTH_FAILED, '请先登录后再安装技能');
    return;
  }

  try {
    installSkillForUser(session.userId, skillName);

    // If hosted mode with agent adapter, also install on remote agent
    if (session.isHosted && session.provider && isAgentAdapter(session.provider) && session.provider.installSkill) {
      const manifest = skillRegistry.get(skillName)?.manifest;
      if (manifest) {
        session.provider.installSkill(manifest).catch((err: Error) => {
          console.error(`[Skills] Remote install failed for ${skillName}:`, err.message);
        });
      }
    }

    // Return updated skill list
    handleSkillListRequest(ws, session).catch(() => {});
  } catch (err) {
    sendError(ws, ErrorCode.SKILL_ERROR, `安装技能失败: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

/** Handle SKILL_UNINSTALL: uninstall a skill for the current user */
function handleSkillUninstall(ws: WebSocket, message: SkillUninstallMessage, session?: Session): void {
  const { skillName } = message.payload;
  if (!session?.userId) {
    sendError(ws, ErrorCode.AUTH_FAILED, '请先登录后再卸载技能');
    return;
  }

  try {
    uninstallSkillForUser(session.userId, skillName);

    // If hosted mode with agent adapter, also uninstall on remote agent
    if (session.isHosted && session.provider && isAgentAdapter(session.provider) && session.provider.uninstallSkill) {
      session.provider.uninstallSkill(skillName).catch((err: Error) => {
        console.error(`[Skills] Remote uninstall failed for ${skillName}:`, err.message);
      });
    }

    // Return updated skill list
    handleSkillListRequest(ws, session).catch(() => {});
  } catch (err) {
    sendError(ws, ErrorCode.SKILL_ERROR, `卸载技能失败: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

/** Server-side catalog cache (60s TTL) to reduce DB queries */
let _catalogCache: { data: import('../skills/userSkills.js').SkillCatalogEntry[]; ts: number; key: string } | null = null;
const CATALOG_CACHE_TTL = 60_000;

/** Handle SKILL_LIBRARY_REQUEST: return full catalog with installed status */
function handleSkillLibraryRequest(ws: WebSocket, message: SkillLibraryRequestMessage, session?: Session): void {
  const opts = message.payload || {};
  const cacheKey = JSON.stringify(opts);
  let catalog: import('../skills/userSkills.js').SkillCatalogEntry[];

  if (_catalogCache && _catalogCache.key === cacheKey && Date.now() - _catalogCache.ts < CATALOG_CACHE_TTL) {
    catalog = _catalogCache.data;
  } else {
    catalog = listSkillCatalog({
      category: opts.category,
      search: opts.search,
      environment: opts.environment,
      userPhone: session?.userPhone || undefined,
      userId: session?.userId || undefined,
    });
    _catalogCache = { data: catalog, ts: Date.now(), key: cacheKey };
  }

  const installedNames = session?.userId
    ? getUserInstalledSkillNames(session.userId)
    : [];

  const skills = catalog.map((entry) => ({
    name: entry.name,
    version: entry.version,
    description: entry.description || '',
    author: entry.author || 'AgentOS',
    category: entry.category,
    emoji: entry.emoji || undefined,
    environments: entry.environments as string[],
    permissions: entry.permissions as string[],
    audit: entry.audit,
    auditSource: entry.auditSource || undefined,
    visibility: entry.visibility,
    installed: installedNames.includes(entry.name),
    isDefault: entry.isDefault,
    installCount: entry.installCount || 0,
    functions: entry.functions as Array<{ name: string; description: string }>,
  }));

  send(ws, {
    id: uuidv4(),
    type: MessageType.SKILL_LIBRARY_RESPONSE,
    timestamp: Date.now(),
    payload: { skills },
  });
}

function handleSkillConfigGet(ws: WebSocket, message: { payload: { skillName: string } }, session?: Session): void {
  if (!session?.userId) {
    sendError(ws, ErrorCode.AUTH_FAILED, 'Authentication required for skill config');
    return;
  }

  const { skillName } = message.payload;
  const config = getUserSkillConfig(session.userId, skillName);

  // Get config fields from manifest
  const skill = skillRegistry.get(skillName);
  const fields = (skill?.manifest.config || []).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    secret: f.secret,
    description: f.description,
  }));

  send(ws, {
    id: uuidv4(),
    type: MessageType.SKILL_CONFIG_RESPONSE,
    timestamp: Date.now(),
    payload: { skillName, config, fields },
  });
}

function handleSkillConfigSet(ws: WebSocket, message: { payload: { skillName: string; config: Record<string, unknown> } }, session?: Session): void {
  if (!session?.userId) {
    sendError(ws, ErrorCode.AUTH_FAILED, 'Authentication required for skill config');
    return;
  }

  const { skillName, config } = message.payload;
  setUserSkillConfig(session.userId, skillName, config);

  // Return updated config
  handleSkillConfigGet(ws, { payload: { skillName } }, session);
}

async function handleConnect(ws: WebSocket, message: ConnectMessage): Promise<Session> {
  const { mode, provider: providerName, apiKey, openclawUrl, openclawToken, openclawHosted, copawUrl, copawToken, copawHosted, deviceId, authToken, model } = message.payload;

  // Verify JWT if provided
  let userId: string | null = null;
  let userPhone: string | null = null;
  if (authToken) {
    const decoded = verifyToken(authToken);
    if (decoded) {
      userId = decoded.userId;
      userPhone = decoded.phone;
      console.log(`[WS] Authenticated user: ${decoded.phone} (${userId})`);
    }
  }

  // OpenClaw access control (non-hosted)
  if (mode === 'openclaw' && !openclawHosted) {
    if (!userId) {
      sendError(ws, ErrorCode.AUTH_FAILED, '请先登录再使用 OpenClaw');
      throw new Error('OpenClaw requires authentication');
    }
    // Server proxy mode (no user-provided URL): admin only
    if (!openclawUrl) {
      const ADMIN_PHONES = ['13501161326'];
      if (!userPhone || !ADMIN_PHONES.includes(userPhone)) {
        sendError(ws, ErrorCode.AUTH_FAILED, '请在设置中配置自己的 OpenClaw 连接方式');
        throw new Error('Non-admin user cannot use server proxy OpenClaw');
      }
    }
  }

  // CoPaw access control
  let isCopawHosted = false;
  if (mode === 'copaw') {
    if (copawHosted) {
      // Hosted mode: shared instance, require auth
      if (!userId) {
        sendError(ws, ErrorCode.AUTH_FAILED, '请先登录后再使用 CoPaw 托管服务');
        throw new Error('CoPaw hosted mode requires authentication');
      }
      isCopawHosted = true;
    } else if (!copawUrl) {
      // Self-hosted mode without URL
      sendError(ws, ErrorCode.INVALID_MESSAGE, '请在设置中填写 CoPaw 地址');
      throw new Error('CoPaw self-hosted mode requires URL');
    }
  }

  // Hosted OpenClaw mode
  let isHosted = false;
  let hostedQuota: { used: number; total: number } | undefined;
  let hostedPort: number | null = null;
  let hostedInstanceToken: string | null = null;
  let hostedInstanceStatus: string = 'pending';

  if (openclawHosted) {
    if (!userId) {
      sendError(ws, ErrorCode.AUTH_FAILED, '请先登录后再使用托管服务');
      throw new Error('Hosted mode requires authentication');
    }

    const account = getHostedAccount(userId);
    if (!account) {
      sendError(ws, ErrorCode.AUTH_FAILED, '请先激活托管服务');
      throw new Error('Hosted account not activated');
    }

    isHosted = true;
    hostedQuota = { used: account.quotaUsed, total: account.quotaTotal };
    hostedPort = account.port;
    hostedInstanceToken = account.instanceToken;
    hostedInstanceStatus = account.instanceStatus;
  }

  let llmProvider: LLMProvider | AgentAdapter | null;
  if (isHosted) {
    if (!hostedPort || !hostedInstanceToken || hostedInstanceStatus !== 'ready') {
      const msg = hostedInstanceStatus === 'provisioning'
        ? '托管实例正在启动中，请稍后再试'
        : hostedInstanceStatus === 'error'
        ? '托管实例启动失败，请联系管理员'
        : '托管实例未就绪，请联系管理员';
      sendError(ws, ErrorCode.INTERNAL_ERROR, msg);
      throw new Error(`Hosted instance not ready: ${hostedInstanceStatus}`);
    }
    llmProvider = new OpenClawAdapter(`ws://127.0.0.1:${hostedPort}`, hostedInstanceToken);
  } else if (isCopawHosted) {
    // CoPaw hosted: use server's default CoPaw URL (shared instance, no user URL)
    llmProvider = createProvider('copaw', { model });
  } else {
    // If client sends mode='builtin' with an apiKey, treat as BYOK (user's own key)
    const effectiveMode = (mode === 'builtin' && apiKey) ? 'byok' : mode;
    llmProvider = createProvider(effectiveMode, { provider: providerName, apiKey, model, openclawUrl, openclawToken, copawUrl, copawToken });
  }

  const resolvedDeviceId = deviceId || 'anonymous';

  // Migrate memory from deviceId to userId on first authenticated connect
  if (userId && resolvedDeviceId !== 'anonymous') {
    try { migrateMemory(resolvedDeviceId, userId); } catch { /* ignore */ }
  }

  const session: Session = {
    id: uuidv4(),
    mode,
    deviceId: resolvedDeviceId,
    userId,
    userPhone,
    provider: llmProvider,
    abortController: null,
    isHosted: isHosted || isCopawHosted,
  };

  // For agent adapter modes: register as push target and connect for chat
  if ((mode === 'openclaw' || mode === 'copaw' || isHosted || isCopawHosted) && llmProvider && isAgentAdapter(llmProvider)) {
    const adapter = llmProvider;

    // Register as active push target and flush queued messages
    activePushWs = ws;
    flushPushQueue(ws);

    // If no background push listener, set up push on session adapter as fallback
    if (!backgroundPushAdapter) {
      adapter.onPushMessage = (content: string) => {
        deliverPushMessage(content);
      };
    }

    // Connect to agent adapter immediately for chat readiness
    adapter.connect({}).catch((err: Error) => {
      console.error(`[${adapter.name}] Eager connect failed:`, err.message);
    });
  }

  // Send skill names: use registry for builtin/byok, or generic tag for agent modes
  const userCtx = { userId, userPhone };
  const skillNames = (mode !== 'openclaw' && mode !== 'copaw' && !isHosted)
    ? skillRegistry.listEnabledForUser(userCtx).map((s) => s.manifest.name)
    : ['agent'];

  send(ws, {
    id: uuidv4(),
    type: MessageType.CONNECTED,
    timestamp: Date.now(),
    payload: {
      sessionId: session.id,
      mode,
      skills: skillNames,
      hostedQuota,
    },
  });

  console.log(`[WS] Session ${session.id} connected (mode: ${mode}${isHosted ? ', hosted' : ''})`);
  return session;
}

async function handleChatSend(
  ws: WebSocket,
  session: Session,
  message: ChatSendMessage
): Promise<void> {
  const { conversationId, content, history } = message.payload;

  // Hosted quota check (OpenClaw hosted only — CoPaw hosted is a shared instance, no per-user quota)
  if (session.isHosted && session.mode !== 'copaw') {
    if (!session.userId) {
      sendError(ws, ErrorCode.AUTH_FAILED, '请先登录', conversationId);
      return;
    }
    const quota = checkHostedQuota(session.userId);
    if (!quota.allowed) {
      sendError(
        ws,
        ErrorCode.HOSTED_QUOTA_EXCEEDED,
        `托管额度已用完 (${quota.used}/${quota.total})`,
        conversationId
      );
      return;
    }
  }

  // Rate limiting (builtin mode only) — use userId if authenticated, else deviceId
  const rateLimitId = session.userId || session.deviceId;
  const isRegistered = !!session.userId;
  const { allowed, remaining } = checkRateLimit(rateLimitId, session.mode, isRegistered);
  if (!allowed) {
    sendError(
      ws,
      ErrorCode.RATE_LIMITED,
      `Daily message limit reached (${remaining} remaining). Try again tomorrow or switch to BYOK/OpenClaw mode.`,
      conversationId
    );
    return;
  }

  if (!session.provider) {
    sendError(ws, ErrorCode.PROVIDER_ERROR, 'No LLM provider configured', conversationId);
    return;
  }

  const abortController = new AbortController();
  session.abortController = abortController;

  let fullContent = '';
  const skillsInvoked: SkillInvocation[] = [];

  try {
    console.log(`[Chat] handleChatSend: mode=${session.mode}, content="${content.slice(0, 50)}", wsState=${ws.readyState}`);

    // Build messages for LLM
    const llmMessages: ChatHistoryItem[] = [];

    // Inject user memory for builtin/byok mode
    const memoryUserId = session.userId || session.deviceId;
    if (session.mode === 'builtin' || session.mode === 'byok') {
      const currentMemory = getMemory(memoryUserId);
      if (currentMemory) {
        llmMessages.push({
          role: 'user',
          content: `以下是你对这位用户的记忆，包含之前对话中了解到的信息。当用户问起之前聊过什么、或涉及相关话题时，请主动利用这些记忆来回答：\n\n${currentMemory}`,
        });
        llmMessages.push({
          role: 'assistant',
          content: '好的，我已了解这些信息，会在对话中参考。',
        });
      }
    }

    // Add conversation history
    if (history) {
      llmMessages.push(...history);
    }
    llmMessages.push({ role: 'user', content });

    // Set up agent adapter session key and tool event forwarding
    if ((session.mode === 'openclaw' || session.mode === 'copaw' || session.isHosted) && session.provider && isAgentAdapter(session.provider)) {
      // CoPaw: stable per-user sessionKey so CoPaw retains conversation context across reconnects
      // OpenClaw: per-session key (OpenClaw manages its own session persistence)
      if (session.mode === 'copaw') {
        session.provider.sessionKey = `agentos-copaw-${session.userId || session.deviceId}`;
      } else {
        session.provider.sessionKey = `agentos-${session.id}`;
      }
      session.provider.onToolEvent = (event) => {
        if (event.phase === 'start') {
          send(ws, {
            id: uuidv4(),
            type: MessageType.SKILL_START,
            timestamp: Date.now(),
            payload: {
              conversationId,
              skillName: event.name,
              description: `Running ${event.name}...`,
            },
          });
        } else if (event.phase === 'result') {
          const resultData = event.result ? { result: event.result } : {};
          send(ws, {
            id: uuidv4(),
            type: MessageType.SKILL_RESULT,
            timestamp: Date.now(),
            payload: {
              conversationId,
              skillName: event.name,
              success: true,
              data: resultData,
            },
          });
          skillsInvoked.push({
            name: event.name,
            input: event.args || {},
            output: resultData,
          });
        } else if (event.phase === 'error') {
          send(ws, {
            id: uuidv4(),
            type: MessageType.SKILL_RESULT,
            timestamp: Date.now(),
            payload: {
              conversationId,
              skillName: event.name,
              success: false,
              error: event.error || 'Tool execution failed',
            },
          });
        }
      };

      // Agent adapter modes: use simple streaming (skills handled by the agent itself)
      const stream = session.provider.chat(llmMessages, { signal: abortController.signal });
      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;
        fullContent += chunk;
        send(ws, {
          id: uuidv4(),
          type: MessageType.CHAT_CHUNK,
          timestamp: Date.now(),
          payload: { conversationId, delta: chunk },
        });
      }
    } else {
      // Builtin / BYOK: use Function Calling with skill registry
      const llmProvider = session.provider as LLMProvider;
      const userCtx = { userId: session.userId, userPhone: session.userPhone };
      // If logged in, only provide tools for installed skills; anonymous gets all public defaults
      const userInstalledNames = session.userId
        ? getUserInstalledSkillNames(session.userId)
        : null;
      const tools = userInstalledNames
        ? skillRegistry.toToolsForInstalledUser(userCtx, userInstalledNames)
        : skillRegistry.toFunctionCallingToolsForUser(userCtx);
      const hasToolSupport = tools.length > 0 && llmProvider.chatWithTools;

      if (hasToolSupport) {
        console.log(`[Chat] Entering FC mode with ${tools.length} tools`);
        fullContent = await handleFunctionCallingChat(
          ws, session, conversationId, llmMessages, tools, skillsInvoked, abortController,
        );
        console.log(`[Chat] FC done, fullContent length=${fullContent.length}, wsState=${ws.readyState}`);
      } else {
        // No tools or provider doesn't support tools: simple streaming
        const stream = session.provider!.chat(llmMessages, { signal: abortController.signal });
        for await (const chunk of stream) {
          if (abortController.signal.aborted) break;
          fullContent += chunk;
          send(ws, {
            id: uuidv4(),
            type: MessageType.CHAT_CHUNK,
            timestamp: Date.now(),
            payload: { conversationId, delta: chunk },
          });
        }
      }
    }

    if (!abortController.signal.aborted) {
      incrementCount(session.userId || session.deviceId);

      if (session.isHosted && session.userId) {
        incrementHostedUsage(session.userId);
      }

      send(ws, {
        id: uuidv4(),
        type: MessageType.CHAT_DONE,
        timestamp: Date.now(),
        payload: {
          conversationId,
          fullContent,
          skillsInvoked: skillsInvoked.length > 0 ? skillsInvoked : undefined,
        },
      });

      // Async memory extraction (builtin/byok mode, non-blocking)
      if ((session.mode === 'builtin' || session.mode === 'byok') && session.provider) {
        const memoryMessages: ChatHistoryItem[] = [
          ...(history || []),
          { role: 'user', content },
          { role: 'assistant', content: fullContent },
        ];
        extractAndUpdateMemory(memoryUserId, memoryMessages, session.provider).catch(() => {});
      }
    }
  } catch (error) {
    console.error(`[Chat] ERROR in handleChatSend:`, error instanceof Error ? error.message : error);
    if (!abortController.signal.aborted) {
      sendError(
        ws,
        ErrorCode.PROVIDER_ERROR,
        error instanceof Error ? error.message : 'LLM provider error',
        conversationId
      );
    }
  } finally {
    session.abortController = null;
    // Clean up agent adapter tool event callback
    if (session.provider && isAgentAdapter(session.provider)) {
      session.provider.onToolEvent = null;
    }
  }
}

/**
 * Handle a chat with LLM Function Calling.
 * Loop: send message with tools -> if LLM returns tool_calls, execute them,
 * feed results back, repeat. If LLM returns text, stream it.
 * Max 5 tool call rounds to prevent infinite loops.
 */
async function handleFunctionCallingChat(
  ws: WebSocket,
  session: Session,
  conversationId: string,
  initialMessages: ChatHistoryItem[],
  tools: ReturnType<typeof skillRegistry.toFunctionCallingTools>,
  skillsInvoked: SkillInvocation[],
  abortController: AbortController,
): Promise<string> {
  const MAX_ROUNDS = 5;
  let fullContent = '';

  // Build messages in OpenAI format (role + content + tool_calls + tool_call_id)
  const messages: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
  }> = initialMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (abortController.signal.aborted) break;

    console.log(`[FC] Round ${round + 1}/${MAX_ROUNDS}, calling chatWithTools...`);
    const t0 = Date.now();
    const result = await (session.provider as LLMProvider).chatWithTools!(messages, {
      tools,
      signal: abortController.signal,
    });
    console.log(`[FC] Round ${round + 1} result: type=${result.type}, took ${Date.now() - t0}ms`);

    if (result.type === 'text') {
      for await (const chunk of result.stream) {
        if (abortController.signal.aborted) break;
        fullContent += chunk;
        send(ws, {
          id: uuidv4(),
          type: MessageType.CHAT_CHUNK,
          timestamp: Date.now(),
          payload: { conversationId, delta: chunk },
        });
      }
      break;
    }

    // Tool calls: execute each one
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: result.toolCalls,
    });

    for (const toolCall of result.toolCalls) {
      if (abortController.signal.aborted) break;

      const functionName = toolCall.function.name;
      console.log(`[FC] Executing tool: ${functionName}, args: ${toolCall.function.arguments}`);
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      send(ws, {
        id: uuidv4(),
        type: MessageType.SKILL_START,
        timestamp: Date.now(),
        payload: {
          conversationId,
          skillName: functionName,
          description: `Running ${functionName}...`,
        },
      });

      let toolResult: string;
      try {
        const userCtxExec = { userId: session.userId, userPhone: session.userPhone };
        const execInstalledNames = session.userId
          ? getUserInstalledSkillNames(session.userId)
          : null;
        const { skillName, result: execResult } = execInstalledNames
          ? await skillRegistry.executeForInstalledUser(functionName, args, userCtxExec, execInstalledNames)
          : await skillRegistry.executeForUser(functionName, args, userCtxExec);

        let resultData: Record<string, unknown>;
        try {
          resultData = JSON.parse(execResult);
        } catch {
          resultData = { result: execResult };
        }

        send(ws, {
          id: uuidv4(),
          type: MessageType.SKILL_RESULT,
          timestamp: Date.now(),
          payload: {
            conversationId,
            skillName,
            success: true,
            data: resultData,
          },
        });

        skillsInvoked.push({
          name: skillName,
          input: args,
          output: resultData,
        });

        toolResult = execResult;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Skill execution failed';

        send(ws, {
          id: uuidv4(),
          type: MessageType.SKILL_RESULT,
          timestamp: Date.now(),
          payload: {
            conversationId,
            skillName: functionName,
            success: false,
            error: errorMsg,
          },
        });

        toolResult = JSON.stringify({ error: errorMsg });
      }

      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
        name: functionName,
      });
    }
  }

  return fullContent;
}

// ── Desktop handlers ──

/** Track which desktop skills are registered per userId, for cleanup on disconnect */
const desktopSkillNames = new Map<string, string[]>();

function handleDesktopRegister(ws: WebSocket, session: Session, message: DesktopRegisterMessage): void {
  const userId = session.userId;
  if (!userId) return;

  // Register DesktopAdapter and store WS for command relay
  // (moved from handleConnect — now triggered by register message, works for all modes)
  if (!desktopWebSockets.has(userId)) {
    const desktopAdapter = new DesktopAdapter();
    desktopAdapter.connect({ deviceId: session.deviceId, userId });
    registerDesktopSession(userId, desktopAdapter);
  }
  desktopWebSockets.set(userId, ws);
  // Mark session so cleanup on close knows to unregister desktop
  (session as unknown as Record<string, boolean>)._desktopRegistered = true;

  // Register capabilities if the adapter exists
  const existingAdapter = getDesktopSession(userId);
  if (existingAdapter) {
    existingAdapter.registerCapabilities({
      os: message.payload.os,
      arch: message.payload.arch,
      hostname: message.payload.hostname,
      localAgents: message.payload.localAgents,
      localSkills: message.payload.localSkills,
    });
  }

  const manifests = message.payload.skillManifests;
  if (!manifests || manifests.length === 0) return;

  const registeredNames: string[] = [];

  for (const sm of manifests) {
    const skillName = `desktop-${sm.name}`;

    const manifest = {
      name: skillName,
      version: '1.0.0',
      description: sm.description,
      author: 'Desktop',
      agents: '*' as const,
      environments: ['desktop' as const],
      permissions: ['exec' as const],
      functions: sm.functions.map((f) => ({
        name: f.name,
        description: f.description,
        parameters: f.parameters,
      })),
      audit: 'unreviewed' as const,
      auditSource: 'Desktop',
      category: 'tools' as const,
      emoji: '🖥️',
      isDefault: false,
    };

    // Create proxy handlers that route to desktop execution
    const handlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {};
    for (const fn of sm.functions) {
      const fnName = fn.name;
      const capturedUserId = userId;
      handlers[fnName] = async (args: Record<string, unknown>) => {
        return executeOnDesktop(capturedUserId, fnName, args);
      };
    }

    skillRegistry.register(manifest, handlers);
    registeredNames.push(skillName);

    // Auto-install desktop skills for this user
    try {
      installSkillForUser(userId, skillName);
    } catch {
      // Already installed, ignore
    }
  }

  desktopSkillNames.set(userId, registeredNames);
  console.log(`[Desktop] Registered ${registeredNames.length} desktop skills for user ${userId}: ${registeredNames.join(', ')}`);
}

/** Unregister all desktop skills for a user (called on disconnect) */
function unregisterDesktopSkills(userId: string): void {
  const names = desktopSkillNames.get(userId);
  if (!names) return;

  for (const name of names) {
    skillRegistry.unregister(name);
  }

  desktopSkillNames.delete(userId);
  console.log(`[Desktop] Unregistered ${names.length} desktop skills for user ${userId}`);
}

function handleDesktopCommand(ws: WebSocket, session: Session, message: DesktopCommandMessage): void {
  // Route a command to the desktop client associated with the current user
  const userId = session.userId;
  if (!userId) {
    sendError(ws, ErrorCode.AUTH_FAILED, 'Authentication required for desktop commands');
    return;
  }

  const desktopWs = desktopWebSockets.get(userId);
  if (!desktopWs || desktopWs.readyState !== WebSocket.OPEN) {
    sendError(ws, ErrorCode.INTERNAL_ERROR, 'No desktop client connected');
    return;
  }

  // Forward command to desktop WebSocket
  send(desktopWs, {
    id: uuidv4(),
    type: MessageType.DESKTOP_COMMAND,
    timestamp: Date.now(),
    payload: {
      command: message.payload.command,
      args: message.payload.args,
      commandId: message.payload.commandId || uuidv4(),
    },
  });

  console.log(`[Desktop] Forwarded command "${message.payload.command}" to desktop for user ${userId}`);
}

function send(ws: WebSocket, message: ServerMessage): void {
  const type = message.type;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    if (type === MessageType.CHAT_CHUNK || type === MessageType.CHAT_DONE || type === MessageType.SKILL_START || type === MessageType.SKILL_RESULT) {
      console.log(`[WS:send] ${type} sent (readyState=${ws.readyState})`);
    }
  } else {
    if (type === MessageType.CHAT_CHUNK || type === MessageType.CHAT_DONE || type === MessageType.SKILL_START || type === MessageType.SKILL_RESULT || type === MessageType.ERROR) {
      console.warn(`[WS:send] DROPPED ${type} — readyState=${ws.readyState}`);
    }
  }
}

function sendError(
  ws: WebSocket,
  code: ErrorCode,
  message: string,
  conversationId?: string
): void {
  send(ws, {
    id: uuidv4(),
    type: MessageType.ERROR,
    timestamp: Date.now(),
    payload: { code, message, conversationId },
  });
}
