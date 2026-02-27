import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../stores/settingsStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { useTranslation } from '../i18n/index.ts';

interface StatusInfo {
  running: boolean;
  pid: number | null;
  port: number;
  version: string;
}

export function LocalOpenclawStatus() {
  const t = useTranslation();
  const store = useSettingsStore();
  const auth = useAuthStore();

  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [loading, setLoading] = useState(false);

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

      {/* Info */}
      <div className="local-openclaw-info">
        <span className="settings-hint">{t('settings.localStatusPort')}: {port}</span>
        {status?.version && (
          <span className="settings-hint">{t('settings.localStatusVersion')}: {status.version}</span>
        )}
      </div>
    </div>
  );
}
