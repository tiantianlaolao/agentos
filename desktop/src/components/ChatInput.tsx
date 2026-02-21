import { useState, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n/index.ts';

interface Props {
  onSend: (content: string) => void;
  onStop: () => void;
  disabled: boolean;
  streaming: boolean;
  quotedText?: string;
  onClearQuote?: () => void;
}

export function ChatInput({ onSend, onStop, disabled, streaming, quotedText, onClearQuote }: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const t = useTranslation();

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    let content = trimmed;
    if (quotedText) {
      const quoteLine = quotedText.split('\n').map(l => `> ${l}`).join('\n');
      content = `${quoteLine}\n\n${trimmed}`;
      onClearQuote?.();
    }
    onSend(content);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, disabled, onSend, quotedText, onClearQuote]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (streaming) return;
        handleSend();
      }
    },
    [handleSend, streaming]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, []);

  return (
    <div className="chat-input-container">
      {quotedText && (
        <div className="quote-preview">
          <div className="quote-preview-text">
            {quotedText.length > 100 ? quotedText.slice(0, 100) + '...' : quotedText}
          </div>
          <button className="quote-preview-close" onClick={onClearQuote}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? '' : t('chat.inputPlaceholder')}
          disabled={disabled}
          rows={1}
        />
        {streaming ? (
          <button className="btn-stop" onClick={onStop} title={t('chat.stop')}>
            {t('chat.stop')}
          </button>
        ) : (
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            title={t('chat.send')}
          >
            {t('chat.send')}
          </button>
        )}
      </div>
    </div>
  );
}
