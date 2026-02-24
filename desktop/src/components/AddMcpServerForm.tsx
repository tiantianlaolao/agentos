/**
 * AddMcpServerForm — Overlay for managing MCP servers (desktop).
 * Lists existing servers and allows adding / deleting.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface McpServer {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  connected: boolean;
  system: boolean;
  tools: Array<{ name: string; description: string }> | string[];
}

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onAdded: () => void;
}

function deriveHttpBaseUrl(serverUrl: string): string {
  return serverUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/ws$/, '');
}

export function AddMcpServerForm({ serverUrl, authToken, onClose, onAdded }: Props) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const baseUrl = deriveHttpBaseUrl(serverUrl);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const raw = await invoke<string>('http_fetch', {
        url: `${baseUrl}/mcp/servers`,
        method: 'GET',
        authToken,
      });
      const json = JSON.parse(raw);
      setServers(json.servers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, authToken]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleAdd = async () => {
    if (!name.trim() || !command.trim()) return;
    setAdding(true);
    setError('');
    try {
      const argsArray = args.trim()
        ? args.split(',').map((a) => a.trim()).filter(Boolean)
        : [];
      await invoke<string>('http_fetch', {
        url: `${baseUrl}/mcp/servers`,
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), command: command.trim(), args: argsArray }),
        authToken,
      });
      setName('');
      setCommand('');
      setArgs('');
      setShowAddForm(false);
      await fetchServers();
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (serverName: string) => {
    setError('');
    try {
      await invoke<string>('http_fetch', {
        url: `${baseUrl}/mcp/servers/${encodeURIComponent(serverName)}`,
        method: 'DELETE',
        authToken,
      });
      setDeleteConfirm(null);
      await fetchServers();
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="register-skill-overlay">
      <div className="register-skill-panel">
        <div className="register-skill-header">
          <button className="skills-back-btn" onClick={onClose}>&larr; Back</button>
          <h2 className="skills-title">MCP Servers</h2>
        </div>

        <div className="register-skill-form">
          <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888' }}>
            Connect local MCP servers to expose their tools as skills.
          </p>

          {error && <div className="register-skill-error">{error}</div>}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#888', fontSize: '13px' }}>
              Loading MCP servers...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {servers.map((server) => (
                <div
                  key={server.name}
                  style={{
                    background: '#1a1a2e',
                    border: '1px solid #2d2d44',
                    borderRadius: '10px',
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: server.connected ? '#22c55e' : '#ef4444',
                          flexShrink: 0,
                        }}
                        title={server.connected ? 'Connected' : 'Disconnected'}
                      />
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#e0e0e0' }}>
                        {server.name}
                      </span>
                      {server.tools && server.tools.length > 0 && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#6c63ff',
                            background: 'rgba(108, 99, 255, 0.15)',
                            borderRadius: '6px',
                            padding: '1px 6px',
                          }}
                        >
                          {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {server.system && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: '#22c55e',
                            background: 'rgba(34, 197, 94, 0.15)',
                            borderRadius: '6px',
                            padding: '1px 6px',
                          }}
                        >
                          System
                        </span>
                      )}
                    </div>
                    {!server.system && deleteConfirm === server.name ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#ef4444' }}>Delete?</span>
                        <button
                          onClick={() => handleDelete(server.name)}
                          style={{
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          style={{
                            background: '#333',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            color: '#ccc',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          No
                        </button>
                      </div>
                    ) : !server.system ? (
                      <button
                        onClick={() => setDeleteConfirm(server.name)}
                        title="Remove server"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '2px 4px',
                          lineHeight: 1,
                        }}
                      >
                        &#x274C;
                      </button>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: '#888',
                      wordBreak: 'break-all',
                    }}
                  >
                    {server.command} {server.args?.join(' ')}
                  </div>
                </div>
              ))}

              {servers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '12px 0', color: '#666', fontSize: '13px' }}>
                  No MCP servers configured
                </div>
              )}
            </div>
          )}

          {showAddForm ? (
            <div
              style={{
                background: '#1a1a2e',
                border: '1px solid #2d2d44',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <label className="register-skill-label">Name</label>
              <input
                className="register-skill-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. filesystem"
              />
              <label className="register-skill-label">Command</label>
              <input
                className="register-skill-input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx"
              />
              <label className="register-skill-label">Args</label>
              <input
                className="register-skill-input"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="--server, filesystem  (comma-separated)"
              />
              <div style={{ fontSize: '11px', color: '#666', marginTop: '-4px' }}>
                Comma-separated list of arguments
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  className="register-skill-submit"
                  onClick={handleAdd}
                  disabled={adding || !name.trim() || !command.trim()}
                  style={{ flex: 1 }}
                >
                  {adding ? 'Adding...' : 'Add Server'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setName(''); setCommand(''); setArgs(''); }}
                  style={{
                    background: '#333',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: '#ccc',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                background: '#16213e',
                border: '1.5px dashed #2d2d44',
                borderRadius: '10px',
                padding: '10px',
                color: '#888',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center',
                width: '100%',
              }}
            >
              + Add MCP Server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
