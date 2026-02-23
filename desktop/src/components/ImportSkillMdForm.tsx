/**
 * ImportSkillMdForm — Overlay form for importing a SKILL.md definition (desktop).
 */

import { useState } from 'react';

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onImported: () => void;
}

export function ImportSkillMdForm({ serverUrl, authToken, onClose, onImported }: Props) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (!content.trim()) {
      setError('Please paste the SKILL.md content.');
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
          <button className="skills-back-btn" onClick={onClose}>&larr; Back</button>
          <h2 className="skills-title">Import SKILL.md</h2>
        </div>

        <div className="register-skill-form">
          <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888' }}>
            Paste the contents of a SKILL.md file to register it as a skill.
          </p>

          {error && <div className="register-skill-error">{error}</div>}

          <label className="register-skill-label">SKILL.md Content *</label>
          <textarea
            className="register-skill-input register-skill-textarea"
            placeholder={'# skill-name\n\nDescription of the skill...\n\n## functions\n\n### my_function\n\nWhat it does...'}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            style={{ fontFamily: 'monospace', minHeight: '200px' }}
          />

          <div className="register-skill-hint" style={{ margin: '12px 0', fontSize: '11px', color: '#666', lineHeight: '16px' }}>
            SKILL.md uses a markdown format to define skills. The heading defines the skill name,
            and ## functions sections define callable functions.
          </div>

          <button
            className="register-skill-submit"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Importing...' : 'Import Skill'}
          </button>
        </div>
      </div>
    </div>
  );
}
