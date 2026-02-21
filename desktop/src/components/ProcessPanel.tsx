import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from '../i18n/index.ts';

interface AgentStatus {
  name: string;
  status: string;
  pid: number | null;
}

export function ProcessPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslation();
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingLogs, setViewingLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const refreshAgents = useCallback(async () => {
    try {
      const list = await invoke<AgentStatus[]>('list_agents');
      setAgents(list);
    } catch (e) {
      console.error('Failed to list agents:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAgents();
    const interval = setInterval(refreshAgents, 3000);
    return () => clearInterval(interval);
  }, [refreshAgents]);

  const handleLaunch = useCallback(async () => {
    if (!name.trim() || !command.trim()) return;
    setLaunching(true);
    setError(null);
    try {
      const argsList = args.trim() ? args.trim().split(/\s+/) : [];
      const pid = await invoke<number>('launch_agent', {
        name: name.trim(),
        command: command.trim(),
        args: argsList,
      });
      setName('');
      setCommand('');
      setArgs('');
      await refreshAgents();
      console.log(`Launched ${name} with PID ${pid}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLaunching(false);
    }
  }, [name, command, args, refreshAgents]);

  const handleStop = useCallback(async (agentName: string) => {
    try {
      await invoke('stop_agent', { name: agentName });
      await refreshAgents();
    } catch (e) {
      console.error('Failed to stop agent:', e);
    }
  }, [refreshAgents]);

  const handleViewLogs = useCallback(async (agentName: string) => {
    setViewingLogs(agentName);
    setLogsLoading(true);
    try {
      const logLines = await invoke<string[]>('get_agent_logs', {
        name: agentName,
        lines: 200,
      });
      setLogs(logLines);
    } catch (e) {
      setLogs([`Error loading logs: ${e}`]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const handleRefreshLogs = useCallback(async () => {
    if (!viewingLogs) return;
    setLogsLoading(true);
    try {
      const logLines = await invoke<string[]>('get_agent_logs', {
        name: viewingLogs,
        lines: 200,
      });
      setLogs(logLines);
    } catch (e) {
      setLogs([`Error loading logs: ${e}`]);
    } finally {
      setLogsLoading(false);
    }
  }, [viewingLogs]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Log viewer sub-panel
  if (viewingLogs) {
    return (
      <div className="process-panel">
        <div className="process-header">
          <button className="process-back-btn" onClick={() => setViewingLogs(null)}>
            &larr;
          </button>
          <h2 className="process-title">{viewingLogs} — {t('process.logs')}</h2>
          <button className="process-refresh-btn" onClick={handleRefreshLogs} disabled={logsLoading}>
            {logsLoading ? '...' : t('process.refresh')}
          </button>
        </div>
        <div className="process-logs">
          {logs.length === 0 ? (
            <div className="process-logs-empty">{t('process.noLogs')}</div>
          ) : (
            <pre className="process-logs-pre">
              {logs.join('\n')}
              <div ref={logEndRef} />
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="process-panel">
      <div className="process-header">
        <button className="process-back-btn" onClick={onClose}>&larr;</button>
        <h2 className="process-title">{t('process.title')}</h2>
        <button className="process-refresh-btn" onClick={refreshAgents}>
          {t('process.refresh')}
        </button>
      </div>

      <div className="process-content">
        {/* Launch form */}
        <div className="process-launch-form">
          <h3 className="process-section-title">{t('process.launch')}</h3>
          <div className="process-form-row">
            <input
              className="process-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('process.namePlaceholder')}
            />
            <input
              className="process-input process-input-wide"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t('process.commandPlaceholder')}
            />
          </div>
          <div className="process-form-row">
            <input
              className="process-input process-input-wide"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder={t('process.argsPlaceholder')}
            />
            <button
              className="process-launch-btn"
              onClick={handleLaunch}
              disabled={launching || !name.trim() || !command.trim()}
            >
              {launching ? '...' : t('process.launchBtn')}
            </button>
          </div>
          {error && <p className="process-error">{error}</p>}
        </div>

        {/* Agent list */}
        <div className="process-agent-list">
          <h3 className="process-section-title">
            {t('process.running')} ({agents.length})
          </h3>
          {loading ? (
            <div className="process-loading">
              <div className="spinner" />
            </div>
          ) : agents.length === 0 ? (
            <div className="process-empty">{t('process.noAgents')}</div>
          ) : (
            agents.map((agent) => (
              <div key={agent.name} className="process-agent-card">
                <div className="process-agent-info">
                  <div className="process-agent-name-row">
                    <span
                      className="process-agent-dot"
                      style={{
                        background: agent.status === 'running' ? '#4caf50' : '#f44336',
                      }}
                    />
                    <span className="process-agent-name">{agent.name}</span>
                  </div>
                  <span className="process-agent-meta">
                    PID: {agent.pid ?? '—'} · {agent.status}
                  </span>
                </div>
                <div className="process-agent-actions">
                  <button
                    className="process-action-btn"
                    onClick={() => handleViewLogs(agent.name)}
                  >
                    {t('process.viewLogs')}
                  </button>
                  <button
                    className="process-action-btn process-stop-btn"
                    onClick={() => handleStop(agent.name)}
                  >
                    {t('process.stop')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
