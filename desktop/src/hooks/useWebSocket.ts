import { useState, useCallback, useRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import type { AgentMode, ChatMessageItem, ActiveSkill, SkillManifestInfo } from '../types';

interface WsEvent {
  type: string;
  payload: {
    sessionId?: string;
    delta?: string;
    fullContent?: string;
    skillName?: string;
    description?: string;
    message?: string;
    reason?: string;
    skillsInvoked?: Array<{
      name: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }>;
  };
}

interface ConnectResult {
  session_id: string;
  device_id: string;
  skills: string[];
}

function flog(msg: string) {
  invoke('frontend_log', { msg }).catch(() => {});
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [activeSkill, setActiveSkill] = useState<ActiveSkill | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamBuffer = useRef('');
  const onChunkRef = useRef<((content: string) => void) | null>(null);
  const onDoneRef = useRef<((fullContent: string, skills?: ChatMessageItem['skillsInvoked']) => void) | null>(null);
  const onErrorRef = useRef<((error: string) => void) | null>(null);
  const onSkillListRef = useRef<((skills: SkillManifestInfo[]) => void) | null>(null);
  const channelRef = useRef<Channel<WsEvent> | null>(null);

  const connect = useCallback(
    async (
      url: string,
      mode: AgentMode,
      authToken?: string,
      apiKey?: string,
      model?: string,
      copawUrl?: string,
      copawToken?: string,
      openclawHosted?: boolean
    ) => {
      try {
        flog('connect() called, mode=' + mode + ', url=' + url);
        setError(null);
        setConnecting(true);

        // Create IPC Channel for all post-connection events
        const channel = new Channel<WsEvent>();
        channelRef.current = channel;

        channel.onmessage = (event: WsEvent) => {
          const { type, payload } = event;
          switch (type) {
            case 'chat.chunk': {
              const delta = payload?.delta || '';
              streamBuffer.current += delta;
              onChunkRef.current?.(streamBuffer.current);
              break;
            }
            case 'chat.done': {
              setStreaming(false);
              setActiveSkill(null);
              const full = payload?.fullContent || streamBuffer.current;
              onDoneRef.current?.(full, payload?.skillsInvoked);
              streamBuffer.current = '';
              break;
            }
            case 'skill.start': {
              setActiveSkill({
                name: payload?.skillName || 'unknown',
                description: payload?.description || '',
              });
              break;
            }
            case 'skill.result': {
              setActiveSkill(null);
              break;
            }
            case 'skill.list.response': {
              const skills = (payload as unknown as { skills?: SkillManifestInfo[] })?.skills || [];
              onSkillListRef.current?.(skills);
              break;
            }
            case 'error': {
              flog('channel error: ' + (payload?.message || 'Unknown'));
              const errMsg = payload?.message || 'Unknown error';
              setError(errMsg);
              setStreaming(false);
              onErrorRef.current?.(errMsg);
              break;
            }
            case 'disconnected': {
              flog('channel disconnected: ' + (payload?.reason || ''));
              setConnected(false);
              setConnecting(false);
              setSessionId(null);
              setStreaming(false);
              break;
            }
          }
        };

        // invoke blocks until server confirms connection (Rust side handles timeout)
        const result = await invoke<ConnectResult>('connect_server', {
          url,
          mode,
          authToken: authToken || null,
          apiKey: apiKey || null,
          model: model || null,
          copawUrl: copawUrl || null,
          copawToken: copawToken || null,
          openclawHosted: openclawHosted || null,
          onEvent: channel,
        });

        flog('connect_server resolved: sessionId=' + result.session_id);
        setConnected(true);
        setConnecting(false);
        setSessionId(result.session_id);
        setError(null);
      } catch (e) {
        flog('connect_server FAILED: ' + String(e));
        setConnecting(false);
        setConnected(false);
        setError(String(e));
      }
    },
    []
  );

  const disconnect = useCallback(async () => {
    flog('disconnect() called');
    channelRef.current = null;
    try {
      await invoke('disconnect_server');
    } catch { /* ignore */ }
    setConnected(false);
    setConnecting(false);
    setSessionId(null);
  }, []);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      content: string,
      history: Array<{ role: string; content: string }>,
      callbacks: {
        onChunk: (content: string) => void;
        onDone: (fullContent: string, skills?: ChatMessageItem['skillsInvoked']) => void;
        onError: (error: string) => void;
      }
    ) => {
      streamBuffer.current = '';
      onChunkRef.current = callbacks.onChunk;
      onDoneRef.current = callbacks.onDone;
      onErrorRef.current = callbacks.onError;
      setStreaming(true);
      setError(null);

      try {
        await invoke('send_message', {
          conversationId,
          content,
          history,
        });
      } catch (e) {
        setStreaming(false);
        const errMsg = String(e);
        setError(errMsg);
        callbacks.onError(errMsg);
      }
    },
    []
  );

  const stopGeneration = useCallback(async () => {
    try {
      await invoke('stop_generation');
      setStreaming(false);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const requestSkillList = useCallback(async () => {
    await invoke('request_skill_list');
  }, []);

  const toggleSkill = useCallback(async (name: string, enabled: boolean) => {
    await invoke('toggle_skill', { name, enabled });
  }, []);

  const setOnSkillList = useCallback((cb: ((skills: SkillManifestInfo[]) => void) | null) => {
    onSkillListRef.current = cb;
  }, []);

  return {
    connected,
    connecting,
    sessionId,
    streaming,
    activeSkill,
    error,
    connect,
    disconnect,
    sendMessage,
    stopGeneration,
    requestSkillList,
    toggleSkill,
    setOnSkillList,
  };
}
