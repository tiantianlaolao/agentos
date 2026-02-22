import { useState } from 'react';
import type { AgentMode } from '../types/index.ts';
import type { Conversation } from '../services/storage.ts';
import { useTranslation } from '../i18n/index.ts';
import { useAuthStore } from '../stores/authStore.ts';

function maskPhone(phone: string): string {
  if (phone.length >= 7) {
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }
  return phone;
}

interface Props {
  connected: boolean;
  connecting: boolean;
  currentMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  onNewChat: () => void;
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onOpenMemory: () => void;
  onOpenProcess: () => void;
}

const MODE_COLORS: Record<AgentMode, string> = {
  builtin: '#2d7d46',
  openclaw: '#c26a1b',
  copaw: '#1b6bc2',
  desktop: '#6c63ff',
};

const MODES: { value: AgentMode; label: string; description: string }[] = [
  { value: 'builtin', label: 'Built-in', description: 'Server-hosted DeepSeek' },
  { value: 'openclaw', label: 'OpenClaw', description: 'Full agent mode' },
  { value: 'copaw', label: 'CoPaw', description: 'Personal AI agent' },
  { value: 'desktop', label: 'Desktop (BYOK)', description: 'Bring your own API key' },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function Sidebar({
  connected,
  connecting,
  currentMode,
  onModeChange,
  onNewChat,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onOpenSettings,
  onOpenSkills,
  onOpenMemory,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const t = useTranslation();
  const auth = useAuthStore();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="app-title">AgentOS</h1>
        <span className={`status-dot ${connected ? 'connected' : connecting ? 'connecting' : 'disconnected'}`} />
      </div>

      <button className="btn-new-chat" onClick={onNewChat}>
        {t('sidebar.newChat')}
      </button>

      <div className="sidebar-section conversation-history">
        <h3>{t('sidebar.conversations')}</h3>
        <div className="conversation-list">
          {conversations.length === 0 && (
            <div className="conversation-empty">{t('sidebar.noConversations')}</div>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="conversation-info">
                <span className="conversation-title">
                  {conv.title.length > 28 ? conv.title.slice(0, 28) + '...' : conv.title}
                </span>
                <span className="conversation-time">{formatTime(conv.updatedAt)}</span>
              </div>
              {deletingId === conv.id ? (
                <div className="conversation-delete-confirm">
                  <button
                    className="btn-confirm-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                      setDeletingId(null);
                    }}
                  >
                    {t('sidebar.deleteConfirm')}
                  </button>
                  <button
                    className="btn-cancel-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(null);
                    }}
                  >
                    {t('sidebar.deleteCancel')}
                  </button>
                </div>
              ) : (
                <button
                  className="btn-delete-conv"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingId(conv.id);
                  }}
                  title="Delete conversation"
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>{t('sidebar.agentMode')}</h3>
        <div className="mode-list">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={`mode-item ${currentMode === m.value ? 'active' : ''}`}
              onClick={() => onModeChange(m.value)}
              disabled={false}
              style={currentMode === m.value ? { borderColor: MODE_COLORS[m.value] } : undefined}
            >
              <div className="mode-item-header">
                <span
                  className="mode-dot"
                  style={{ background: MODE_COLORS[m.value] }}
                />
                <span className="mode-label">{t(`modes.${m.value}`)}</span>
              </div>
              <span className="mode-desc">{t(`modes.${m.value}Desc`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-grid">
          <button className="footer-btn" onClick={onOpenSkills}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span>Skills</span>
          </button>
          <button className="footer-btn" onClick={onOpenMemory}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
              <line x1="9" y1="21" x2="15" y2="21" />
              <line x1="10" y1="24" x2="14" y2="24" />
            </svg>
            <span>{t('memory.title')}</span>
          </button>
          <button className="footer-btn disabled" title="暂未开放">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>{t('process.title')}</span>
          </button>
          <button className="footer-btn" onClick={onOpenSettings}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>{t('sidebar.settings')}</span>
          </button>
        </div>
        <div className="sidebar-footer-info">
          <span className="sidebar-user-status">
            {auth.isLoggedIn ? maskPhone(auth.phone) : t('sidebar.notLoggedIn')}
          </span>
          <span className="version">v0.1.0</span>
        </div>
      </div>
    </div>
  );
}
