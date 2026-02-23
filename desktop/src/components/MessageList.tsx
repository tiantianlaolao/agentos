import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import type { ChatMessageItem, ActiveSkill } from '../types';
import { useTranslation } from '../i18n/index.ts';
import { CodeBlock } from './CodeBlock.tsx';

interface Props {
  messages: ChatMessageItem[];
  streamingContent: string | null;
  activeSkill: ActiveSkill | null;
  onRetry?: () => void;
  onQuoteReply?: (text: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

function formatDateLabel(timestamp: number, t: (key: string) => string): string {
  const msgDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(msgDate, today)) return t('chat.today');
  if (sameDay(msgDate, yesterday)) return t('chat.yesterday');

  const y = msgDate.getFullYear();
  const m = String(msgDate.getMonth() + 1).padStart(2, '0');
  const d = String(msgDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shouldShowDateSeparator(
  current: ChatMessageItem,
  previous: ChatMessageItem | undefined,
): boolean {
  if (!previous) return true;
  const a = new Date(previous.timestamp);
  const b = new Date(current.timestamp);
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  );
}

const LONG_MESSAGE_THRESHOLD = 5000;

function MessageContent({ content }: { content: string }) {
  const t = useTranslation();
  const [forceMarkdown, setForceMarkdown] = useState(false);
  const isLong = content.length > LONG_MESSAGE_THRESHOLD;

  const markdownComponents: Components = useMemo(() => ({
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeStr = String(children).replace(/\n$/, '');
      // If it has a language class, it's a fenced code block
      if (match) {
        return <CodeBlock code={codeStr} language={match[1]} />;
      }
      if (className || (codeStr.includes('\n'))) {
        return <CodeBlock code={codeStr} language={match?.[1]} />;
      }
      return <code className={className} {...props}>{children}</code>;
    },
    pre({ children }) {
      // The pre wrapper is handled by CodeBlock, just pass through
      return <>{children}</>;
    },
  }), []);

  if (isLong && !forceMarkdown) {
    return (
      <div className="long-message-wrapper">
        <div className="long-message-tip">{t('chat.longMessageTip')}</div>
        <pre className="long-message-pre">{content}</pre>
        <button className="long-message-toggle" onClick={() => setForceMarkdown(true)}>
          Markdown
        </button>
      </div>
    );
  }

  return <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>;
}

export function MessageList({ messages, streamingContent, activeSkill, onRetry, onQuoteReply, hasMore, onLoadMore }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const t = useTranslation();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageContent: string;
  } | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const handleCopy = useCallback((msgId: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, content: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, messageContent: content });
  }, []);

  const handleContextCopy = useCallback(() => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.messageContent);
      setContextMenu(null);
    }
  }, [contextMenu]);

  const handleContextQuote = useCallback(() => {
    if (contextMenu && onQuoteReply) {
      onQuoteReply(contextMenu.messageContent);
      setContextMenu(null);
    }
  }, [contextMenu, onQuoteReply]);

  // Streaming content markdown components (same as MessageContent but without memo dependency issues)
  const streamingMarkdownComponents: Components = useMemo(() => ({
    code({ className, children }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeStr = String(children).replace(/\n$/, '');
      if (match || codeStr.includes('\n')) {
        return <CodeBlock code={codeStr} language={match?.[1]} />;
      }
      return <code className={className}>{children}</code>;
    },
    pre({ children }) {
      return <>{children}</>;
    },
  }), []);

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  const handleScroll = useCallback(() => {
    if (!listRef.current || !hasMore || !onLoadMore) return;
    if (listRef.current.scrollTop < 100) {
      const prevHeight = listRef.current.scrollHeight;
      onLoadMore();
      // Preserve scroll position after prepending
      requestAnimationFrame(() => {
        if (listRef.current) {
          const newHeight = listRef.current.scrollHeight;
          listRef.current.scrollTop += newHeight - prevHeight;
        }
      });
    }
  }, [hasMore, onLoadMore]);

  return (
    <div className="message-list" ref={listRef} onScroll={handleScroll}>
      {hasMore && (
        <div className="load-more-indicator" style={{ textAlign: 'center', padding: '12px', color: '#666', fontSize: '12px' }}>
          {t('chat.loadMore')}
        </div>
      )}
      {messages.length === 0 && !streamingContent && (
        <div className="empty-state">
          <div className="empty-icon">A</div>
          <h2>{t('chat.emptyTitle')}</h2>
          <p>{t('chat.emptySubtitle')}</p>
        </div>
      )}

      {messages.map((msg, idx) => (
        <div key={msg.id}>
          {/* Date separator */}
          {shouldShowDateSeparator(msg, messages[idx - 1]) && (
            <div className="date-separator">
              <span className="date-separator-text">
                {formatDateLabel(msg.timestamp, t)}
              </span>
            </div>
          )}

          {/* Error bubble */}
          {msg.isError ? (
            <div className="message message-assistant">
              <div className="message-avatar">A</div>
              <div className="message-content message-error">
                <p>{msg.content}</p>
              </div>
            </div>
          ) : (
            <div
              className={`message message-${msg.role}`}
              onContextMenu={(e) => handleContextMenu(e, msg.content)}
            >
              <div className="message-avatar">
                {msg.role === 'user' ? 'U' : 'A'}
              </div>
              <div className="message-content">
                {/* Push badge */}
                {msg.isPush && (
                  <div className="push-badge">
                    <span className="push-badge-icon">&#x1F514;</span>
                    <span className="push-badge-text">{msg.source || 'Agent Push'}</span>
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="message-actions">
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
                    {/* Retry button on last assistant message */}
                    {idx === lastAssistantIdx && onRetry && !streamingContent && (
                      <button
                        className="retry-btn"
                        onClick={onRetry}
                        title={t('chat.retry')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                {msg.role === 'assistant' ? (
                  <MessageContent content={msg.content} />
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
          )}
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

      {streamingContent !== null && (
        <div className="message message-assistant">
          <div className="message-avatar">A</div>
          <div className="message-content">
            {streamingContent ? (
              <ReactMarkdown components={streamingMarkdownComponents}>{streamingContent}</ReactMarkdown>
            ) : null}
            <span className="cursor-blink" />
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="context-menu-item" onClick={handleContextCopy}>
            {t('chat.copy')}
          </button>
          {onQuoteReply && (
            <button className="context-menu-item" onClick={handleContextQuote}>
              {t('chat.quoteReply')}
            </button>
          )}
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
