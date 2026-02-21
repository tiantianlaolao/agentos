import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessageItem, ActiveSkill } from '../types';
import { useTranslation } from '../i18n/index.ts';

interface Props {
  messages: ChatMessageItem[];
  streamingContent: string | null;
  activeSkill: ActiveSkill | null;
}

export function MessageList({ messages, streamingContent, activeSkill }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const t = useTranslation();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleCopy = useCallback((msgId: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  return (
    <div className="message-list">
      {messages.length === 0 && !streamingContent && (
        <div className="empty-state">
          <div className="empty-icon">A</div>
          <h2>{t('chat.emptyTitle')}</h2>
          <p>{t('chat.emptySubtitle')}</p>
        </div>
      )}

      {messages.map((msg) => (
        <div key={msg.id} className={`message message-${msg.role}`}>
          <div className="message-avatar">
            {msg.role === 'user' ? 'U' : 'A'}
          </div>
          <div className="message-content">
            {msg.role === 'assistant' && (
              <button
                className="copy-btn"
                onClick={() => handleCopy(msg.id, msg.content)}
                title={copiedId === msg.id ? t('chat.copied') : t('chat.copyMessage')}
              >
                {copiedId === msg.id ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            )}
            {msg.role === 'assistant' ? (
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            ) : (
              <p>{msg.content}</p>
            )}
            {msg.skillsInvoked && msg.skillsInvoked.length > 0 && (
              <div className="skills-badge">
                {msg.skillsInvoked.map((s, i) => (
                  <span key={i} className="skill-tag">
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {activeSkill && (
        <div className="message message-assistant">
          <div className="message-avatar">A</div>
          <div className="message-content">
            <div className="skill-indicator">
              <span className="spinner" />
              {activeSkill.description}
            </div>
          </div>
        </div>
      )}

      {streamingContent && (
        <div className="message message-assistant">
          <div className="message-avatar">A</div>
          <div className="message-content">
            <ReactMarkdown>{streamingContent}</ReactMarkdown>
            <span className="cursor-blink" />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
