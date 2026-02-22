import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore.ts';
import { useSettingsStore } from '../stores/settingsStore.ts';
import { useTranslation } from '../i18n/index.ts';
import { fetchMemory, updateMemory } from '../services/memoryApi.ts';

interface Props {
  onClose: () => void;
}

export function MemoryPanel({ onClose }: Props) {
  const t = useTranslation();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const authToken = useAuthStore((s) => s.authToken);
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  const mode = useSettingsStore((s) => s.mode);

  const isBuiltinOrBYOK = mode === 'builtin' || mode === 'desktop';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadMemory = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMemory(serverUrl, authToken);
      if (result) {
        setContent(result.content);
        setUpdatedAt(result.updatedAt);
      } else {
        setContent('');
        setUpdatedAt('');
      }
    } catch {
      setError(t('memory.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [authToken, serverUrl, t]);

  useEffect(() => {
    if (isLoggedIn && isBuiltinOrBYOK) {
      loadMemory();
    } else {
      setLoading(false);
    }
  }, [isLoggedIn, isBuiltinOrBYOK, loadMemory]);

  const handleEdit = useCallback(() => {
    setEditContent(content);
    setEditing(true);
    setSaveSuccess(false);
  }, [content]);

  const handleCancel = useCallback(() => {
    setEditing(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!authToken) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateMemory(serverUrl, authToken, editContent);
      setContent(editContent);
      setUpdatedAt(result.updatedAt);
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setError(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [authToken, serverUrl, editContent, t]);

  const formatTime = useCallback((iso: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString();
  }, []);

  // Not logged in
  if (!isLoggedIn) {
    return (
      <div className="memory-panel">
        <div className="memory-header">
          <button className="memory-back-btn" onClick={onClose}>&larr; Back</button>
          <h2 className="memory-title">{t('memory.title')}</h2>
          <div />
        </div>
        <div className="memory-content">
          <div className="memory-empty">
            <span className="memory-empty-icon">&#128274;</span>
            <span>{t('memory.loginRequired')}</span>
          </div>
        </div>
      </div>
    );
  }

  // External agent mode
  if (!isBuiltinOrBYOK) {
    return (
      <div className="memory-panel">
        <div className="memory-header">
          <button className="memory-back-btn" onClick={onClose}>&larr; Back</button>
          <h2 className="memory-title">{t('memory.title')}</h2>
          <div />
        </div>
        <div className="memory-content">
          <div className="memory-empty">
            <span className="memory-empty-icon">&#9729;</span>
            <span>{t('memory.externalAgent')}</span>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="memory-panel">
        <div className="memory-header">
          <button className="memory-back-btn" onClick={onClose}>&larr; Back</button>
          <h2 className="memory-title">{t('memory.title')}</h2>
          <div />
        </div>
        <div className="memory-content">
          <div className="memory-loading">
            <div className="spinner" />
            <span>{t('memory.title')}...</span>
          </div>
        </div>
      </div>
    );
  }

  // Edit mode
  if (editing) {
    return (
      <div className="memory-panel">
        <div className="memory-header">
          <button className="memory-back-btn" onClick={handleCancel}>{t('memory.cancel')}</button>
          <h2 className="memory-title">{t('memory.title')}</h2>
          <button
            className="memory-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t('memory.saving') : t('memory.save')}
          </button>
        </div>
        <div className="memory-content">
          <textarea
            className="memory-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value.slice(0, 2000))}
            maxLength={2000}
            autoFocus
            placeholder={t('memory.empty')}
          />
          <div className="memory-char-count">
            {t('memory.charCount', { count: String(editContent.length) })}
          </div>
          {error && <div className="memory-error">{error}</div>}
        </div>
      </div>
    );
  }

  // View mode
  return (
    <div className="memory-panel">
      <div className="memory-header">
        <button className="memory-back-btn" onClick={onClose}>&larr; Back</button>
        <h2 className="memory-title">{t('memory.title')}</h2>
        <button className="memory-edit-btn" onClick={handleEdit}>{t('memory.edit')}</button>
      </div>
      <div className="memory-content">
        {saveSuccess && <div className="memory-success">{t('memory.saveSuccess')}</div>}
        {error && <div className="memory-error">{error}</div>}
        {!content ? (
          <div className="memory-empty">
            <span className="memory-empty-icon">&#128161;</span>
            <span>{t('memory.empty')}</span>
          </div>
        ) : (
          <div className="memory-view">
            <div className="memory-text">{content}</div>
            <div className="memory-meta">
              {updatedAt && (
                <span>{t('memory.updatedAt', { time: formatTime(updatedAt) })}</span>
              )}
              <span>{t('memory.charCount', { count: String(content.length) })}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
