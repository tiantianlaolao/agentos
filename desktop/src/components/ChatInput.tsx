import { useState, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n/index.ts';

interface Props {
  onSend: (content: string) => void;
  onStop: () => void;
  disabled: boolean;
  streaming: boolean;
}

export function ChatInput({ onSend, onStop, disabled, streaming }: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const t = useTranslation();

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, disabled, onSend]);

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
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, []);

  return (
    <div className="chat-input-container">
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
