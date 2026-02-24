/**
 * ImportSkillMdForm — Overlay form for importing a SKILL.md definition (desktop).
 * Supports both file picker and paste input.
 */

import { useState, useRef } from 'react';
import { useTranslation } from '../i18n/index.ts';

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onImported: () => void;
}

export function ImportSkillMdForm({ serverUrl, authToken, onClose, onImported }: Props) {
  const t = useTranslation();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(reader.result as string);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setError(`Failed to read file: ${reader.error?.message || 'Unknown error'}`);
    };
    reader.readAsText(file);
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    setError('');

    if (!content.trim()) {
      setError(t('skills.contentRequired'));
      return;
    }

    setLoading(true);
    try {
      const baseUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const response = await fetch(`${baseUrl}/skills/md/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content: content.trim() }),
      });

      const data = await response.json();
      if (response.ok) {
        onImported();
        onClose();
      } else {
        setError(data.error || 'Import failed');
      }
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-skill-overlay">
      <div className="register-skill-panel">
        <div className="register-skill-header">
          <button className="skills-back-btn" onClick={onClose}>&larr; {t('skills.back')}</button>
          <h2 className="skills-title">{t('skills.skillMdTitle')}</h2>
        </div>

        <div className="register-skill-form">
          <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888' }}>
            {t('skills.skillMdIntro')}
          </p>

          {error && <div className="register-skill-error">{error}</div>}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* File picker button */}
          <button
            className="register-skill-file-picker"
            onClick={handlePickFile}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px 16px',
              marginBottom: '8px',
              backgroundColor: 'transparent',
              border: '1px dashed #6c63ff',
              borderRadius: '8px',
              color: '#6c63ff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '16px' }}>&#128196;</span>
            {t('skills.chooseFile')}
          </button>

          {fileName && (
            <div style={{ color: '#8f8', fontSize: '12px', marginBottom: '8px' }}>
              {t('skills.fileSelected', { name: fileName })}
            </div>
          )}

          <label className="register-skill-label">{t('skills.skillMdLabel')}</label>
          <textarea
            className="register-skill-input register-skill-textarea"
            placeholder={'# skill-name\n\nDescription of the skill...\n\n## functions\n\n### my_function\n\nWhat it does...'}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (fileName) setFileName('');
            }}
            rows={12}
            style={{ fontFamily: 'monospace', minHeight: '200px' }}
          />

          <div className="register-skill-hint" style={{ margin: '12px 0', fontSize: '11px', color: '#666', lineHeight: '16px' }}>
            {t('skills.skillMdHint')}
          </div>

          <button
            className="register-skill-submit"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? t('skills.importing') : t('skills.importBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
