import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../stores/settingsStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { useTranslation } from '../i18n/index.ts';

import type { LLMProvider } from '../stores/settingsStore.ts';

interface StatusInfo {
  running: boolean;
  pid: number | null;
  port: number;
  version: string;
}

const PROVIDERS: { key: LLMProvider; label: string }[] = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'gemini', label: 'Google Gemini' },
  { key: 'moonshot', label: 'Moonshot (Kimi)' },
  { key: 'qwen', label: 'Qwen (通义千问)' },
  { key: 'zhipu', label: 'Z.AI (智谱 GLM)' },
  { key: 'openrouter', label: 'OpenRouter' },
];

export function LocalOpenclawStatus() {
  const t = useTranslation();
  const store = useSettingsStore();
  const auth = useAuthStore();

  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editProvider, setEditProvider] = useState<LLMProvider>(store.localOpenclawProvider);
  const [editApiKey, setEditApiKey] = useState(store.localOpenclawApiKey);
  const [editModel, setEditModel] = useState(store.localOpenclawModel);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState('');
  const [logs, setLogs] = useState<string[] | null>(null);

  const port = store.localOpenclawPort || 18789;

  const refreshStatus = useCallback(async () => {
    try {
      const s = await invoke<StatusInfo>('get_local_openclaw_status', { port });
      setStatus(s);
    } catch (e) {
      console.error('Failed to get openclaw status:', e);
    }
  }, [port]);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handleStart = async () => {
    setLoading(true);
    try {
      await invoke('start_local_openclaw', { port });
      await refreshStatus();
    } catch (e) {
      console.error('Start failed:', e);
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await invoke('stop_local_openclaw');
      await refreshStatus();
    } catch (e) {
      console.error('Stop failed:', e);
    }
    setLoading(false);
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await invoke('stop_local_openclaw');
      await new Promise((r) => setTimeout(r, 1000));
      await invoke('start_local_openclaw', { port });
      await refreshStatus();
    } catch (e) {
      console.error('Restart failed:', e);
    }
    setLoading(false);
  };

  const isDefaultMode = store.deployModelMode === 'default';

  /** Derive the LLM proxy URL from the AgentOS WS server URL */
  const getLLMProxyBaseUrl = (): string => {
    const httpUrl = store.serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
    return `${httpUrl}/api/llm-proxy/v1`;
  };

  const handleSaveConfig = async () => {
    try {
      const provider = isDefaultMode ? 'deepseek' : editProvider;
      const apiKey = isDefaultMode ? (auth.authToken || '') : editApiKey;
      const model = isDefaultMode ? '' : editModel;
      const baseUrl = isDefaultMode ? getLLMProxyBaseUrl() : undefined;

      await invoke('update_local_openclaw_config', {
        provider,
        apiKey,
        model,
        baseUrl,
      });
      store.setLocalOpenclawProvider(provider);
      store.setLocalOpenclawApiKey(apiKey);
      store.setLocalOpenclawModel(model);
      setEditing(false);
      // Restart if running
      if (status?.running) {
        await handleRestart();
      }
    } catch (e) {
      console.error('Config update failed:', e);
    }
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    setUpgradeMsg('');
    try {
      const registry = store.locale === 'zh' ? 'https://registry.npmmirror.com' : undefined;
      const newVer = await invoke<string>('upgrade_openclaw', { registry });
      setUpgradeMsg(t('settings.localStatusUpgraded').replace('%{version}', newVer));
      await refreshStatus();
    } catch (e) {
      setUpgradeMsg(e instanceof Error ? e.message : String(e));
    }
    setUpgrading(false);
  };

  const handleViewLogs = async () => {
    if (logs !== null) {
      setLogs(null);
      return;
    }
    try {
      const lines = await invoke<string[]>('get_agent_logs', { name: 'local-openclaw', lines: 50 });
      setLogs(lines);
    } catch {
      setLogs(['(no logs available)']);
    }
  };

  const isRunning = status?.running ?? false;

  return (
    <div className="local-openclaw-status">
      <h4 className="settings-section-subtitle">{t('settings.localStatusTitle')}</h4>

      {/* Status indicator */}
      <div className="local-openclaw-status-row">
        <span
          className="local-openclaw-dot"
          style={{ background: isRunning ? '#4caf50' : '#888' }}
        />
        <span className="local-openclaw-status-text">
          {isRunning ? t('settings.localStatusRunning') : t('settings.localStatusStopped')}
        </span>
        {status?.pid && <span className="settings-hint" style={{ marginLeft: '8px' }}>PID: {status.pid}</span>}
      </div>

      {/* Action buttons */}
      <div className="local-openclaw-actions">
        {!isRunning ? (
          <button className="settings-auth-btn" onClick={handleStart} disabled={loading}>
            {t('settings.localStatusStart')}
          </button>
        ) : (
          <>
            <button className="settings-auth-btn" onClick={handleStop} disabled={loading}>
              {t('settings.localStatusStop')}
            </button>
            <button className="settings-auth-btn" onClick={handleRestart} disabled={loading}>
              {t('settings.localStatusRestart')}
            </button>
          </>
        )}
      </div>

      {/* Toggles */}
      <label className="local-openclaw-checkbox">
        <input
          type="checkbox"
          checked={store.localOpenclawAutoStart}
          onChange={(e) => store.setLocalOpenclawAutoStart(e.target.checked)}
        />
        <span>{t('settings.localStatusAutoStart')}</span>
      </label>

      {auth.isLoggedIn && (
        <>
          <label className="local-openclaw-checkbox">
            <input
              type="checkbox"
              checked={store.localOpenclawAutoBridge}
              onChange={(e) => store.setLocalOpenclawAutoBridge(e.target.checked)}
            />
            <span>{t('settings.localStatusAutoBridge')}</span>
          </label>

          {/* Bridge toggle */}
          <button
            className={`settings-auth-btn ${store.bridgeEnabled ? 'settings-bridge-active' : ''}`}
            onClick={() => store.setBridgeEnabled(!store.bridgeEnabled)}
            style={{ marginTop: '4px' }}
          >
            {store.bridgeEnabled ? t('bridge.disable') : t('bridge.enable')}
          </button>
          <span className="settings-hint">{t('settings.localBridgeHint')}</span>
        </>
      )}
      {!auth.isLoggedIn && (
        <p className="settings-hosted-note">{t('bridge.needLogin')}</p>
      )}

      {/* Config editing */}
      {!editing ? (
        <button
          className="settings-auth-btn"
          onClick={() => {
            setEditProvider(store.localOpenclawProvider);
            setEditApiKey(store.localOpenclawApiKey);
            setEditModel(store.localOpenclawModel);
            setEditing(true);
          }}
          style={{ marginTop: '8px' }}
        >
          {t('settings.localStatusEditConfig')}
        </button>
      ) : (
        <div className="local-openclaw-edit-config">
          {isDefaultMode ? (
            <div className="settings-field">
              <label className="settings-label">{t('settings.localSetupProvider')}</label>
              <span className="settings-hint">{t('settings.deployModelProxy')}</span>
            </div>
          ) : (
            <>
              <div className="settings-field">
                <label className="settings-label">{t('settings.localSetupProvider')}</label>
                <select
                  className="settings-select"
                  value={editProvider}
                  onChange={(e) => setEditProvider(e.target.value as LLMProvider)}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="settings-field">
                <label className="settings-label">{t('settings.localSetupApiKey')}</label>
                <input
                  className="settings-input"
                  type="password"
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">{t('settings.localSetupModel')}</label>
                <input
                  className="settings-input"
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="local-openclaw-actions">
            <button className="settings-auth-btn" onClick={handleSaveConfig}>
              {t('settings.localStatusSaveConfig')}
            </button>
            <button className="settings-auth-btn" onClick={() => setEditing(false)}>
              {t('settings.localStatusCancelEdit')}
            </button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="local-openclaw-info">
        <span className="settings-hint">{t('settings.localStatusPort')}: {port}</span>
        {status?.version && (
          <span className="settings-hint">{t('settings.localStatusVersion')}: {status.version}</span>
        )}
      </div>

      {/* Upgrade */}
      <button
        className="settings-auth-btn"
        onClick={handleUpgrade}
        disabled={upgrading}
        style={{ marginTop: '4px' }}
      >
        {upgrading ? t('settings.localStatusUpgrading') : t('settings.localStatusUpgrade')}
      </button>
      {upgradeMsg && <span className="settings-hint">{upgradeMsg}</span>}

      {/* Logs */}
      <button
        className="settings-auth-btn"
        onClick={handleViewLogs}
        style={{ marginTop: '4px' }}
      >
        {t('settings.localStatusViewLogs')}
      </button>
      {logs && (
        <div className="local-openclaw-logs">
          {logs.map((line, i) => (
            <div key={i} className="local-openclaw-log-line">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
