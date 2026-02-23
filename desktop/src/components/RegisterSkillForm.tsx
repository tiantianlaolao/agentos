/**
 * RegisterSkillForm — Overlay form for registering external HTTP skills (desktop).
 */

import { useState } from 'react';

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onRegistered: () => void;
}

export function RegisterSkillForm({ serverUrl, authToken, onClose, onRegistered }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [funcName, setFuncName] = useState('');
  const [funcDesc, setFuncDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (!name.trim() || !endpointUrl.trim() || !funcName.trim()) {
      setError('Name, endpoint URL, and at least one function are required.');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      setError('Skill name must contain only lowercase letters, digits, and hyphens.');
      return;
    }

    setLoading(true);
    try {
      const baseUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const response = await fetch(`${baseUrl}/skills/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          endpointUrl: endpointUrl.trim(),
          functions: [
            {
              name: funcName.trim(),
              description: funcDesc.trim() || funcName.trim(),
              parameters: {
                type: 'object',
                properties: {
                  input: {
                    type: 'string',
                    description: 'Input for the function',
                  },
                },
                required: ['input'],
              },
            },
          ],
        }),
      });

      const data = await response.json();
      if (response.ok) {
        onRegistered();
        onClose();
      } else {
        setError(data.error || 'Registration failed');
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
          <h2 className="skills-title">Register External Skill</h2>
        </div>

        <div className="register-skill-form">
          {error && <div className="register-skill-error">{error}</div>}

          <label className="register-skill-label">Skill Name *</label>
          <input
            className="register-skill-input"
            placeholder="my-skill"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className="register-skill-label">Description</label>
          <textarea
            className="register-skill-input register-skill-textarea"
            placeholder="What does this skill do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />

          <label className="register-skill-label">Endpoint URL *</label>
          <input
            className="register-skill-input"
            placeholder="https://my-server.com/api/skill"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
          />

          <div className="register-skill-section-title">Function Definition</div>

          <label className="register-skill-label">Function Name *</label>
          <input
            className="register-skill-input"
            placeholder="do_something"
            value={funcName}
            onChange={(e) => setFuncName(e.target.value)}
          />

          <label className="register-skill-label">Function Description</label>
          <input
            className="register-skill-input"
            placeholder="Describe what this function does"
            value={funcDesc}
            onChange={(e) => setFuncDesc(e.target.value)}
          />

          <div className="register-skill-hint">
            Your endpoint will receive POST requests with {'{ "function": "<name>", "args": {...} }'} and should return a JSON response.
          </div>

          <button
            className="register-skill-submit"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Registering...' : 'Register Skill'}
          </button>
        </div>
      </div>
    </div>
  );
}
