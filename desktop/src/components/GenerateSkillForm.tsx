/**
 * GenerateSkillForm — Overlay form for AI-generating a SKILL.md definition (desktop).
 */

import { useState } from 'react';
import { useTranslation } from '../i18n/index.ts';

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onGenerated: () => void;
}

interface GenerateResult {
  content: string;
  parsed: { name: string; description: string; emoji: string };
}

export function GenerateSkillForm({ serverUrl, authToken, onClose, onGenerated }: Props) {
  const t = useTranslation();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);

  const handleGenerate = async () => {
    setError('');

    if (!description.trim()) {
      setError('Please describe the skill you want.');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const baseUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const response = await fetch(`${baseUrl}/skills/md/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ description: description.trim() }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(data as GenerateResult);
      } else {
        setError(data.error || 'Generation failed');
      }
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!result) return;

    setError('');
    setImporting(true);
    try {
      const baseUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const response = await fetch(`${baseUrl}/skills/md/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content: result.content }),
      });

      const data = await response.json();
      if (response.ok) {
        onGenerated();
        onClose();
      } else {
        setError(data.error || 'Import failed');
      }
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="register-skill-overlay">
      <div className="register-skill-panel">
        <div className="register-skill-header">
          <button className="skills-back-btn" onClick={onClose}>&larr; Back</button>
          <h2 className="skills-title">{t('skills.aiGenerate')}</h2>
        </div>

        <div className="register-skill-form">
          <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888' }}>
            {t('skills.aiGenerateDesc')}
          </p>

          {error && <div className="register-skill-error">{error}</div>}

          <label className="register-skill-label">{t('skills.description')}</label>
          <textarea
            className="register-skill-input register-skill-textarea"
            placeholder={t('skills.generatePromptPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={loading}
            style={{ minHeight: '80px' }}
          />

          <button
            className="register-skill-submit"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? t('skills.generating') : t('skills.generateBtn')}
          </button>

          {result && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: '#fff', fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>
                {t('skills.previewTitle')}
              </h3>

              <div style={{
                background: '#1a1a2e',
                border: '1px solid #2d2d44',
                borderRadius: '10px',
                padding: '16px',
                textAlign: 'center',
                marginBottom: '12px',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '6px' }}>
                  {result.parsed.emoji || ''}
                </div>
                <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                  {result.parsed.name}
                </div>
                <div style={{ color: '#aaa', fontSize: '13px' }}>
                  {result.parsed.description}
                </div>
              </div>

              <label className="register-skill-label">SKILL.md</label>
              <div style={{
                background: '#1a1a2e',
                border: '1px solid #2d2d44',
                borderRadius: '8px',
                padding: '10px',
                maxHeight: '200px',
                overflowY: 'auto',
              }}>
                <pre style={{
                  color: '#888',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  lineHeight: '16px',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {result.content}
                </pre>
              </div>

              <button
                className="register-skill-submit"
                onClick={handleConfirmImport}
                disabled={importing}
                style={{ marginTop: '12px', background: '#22c55e' }}
              >
                {importing ? t('skills.importing') : t('skills.confirmImport')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
