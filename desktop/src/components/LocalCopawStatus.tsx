import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../stores/settingsStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { useTranslation } from '../i18n/index.ts';

interface StatusInfo {
  running: boolean;
  pid: number | null;
  port: number;
}

export function LocalCopawStatus() {
  const t = useTranslation();
  const store = useSettingsStore();
  const auth = useAuthStore();

  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const port = store.localCopawPort || 8088;

  const refreshStatus = useCallback(async () => {
    try {
      const s = await invoke<StatusInfo>('get_local_copaw_status', { port });
      setStatus(s);
    } catch (e) {
      console.error('Failed to get CoPaw status:', e);
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
      await invoke('start_local_copaw', { port });
      await refreshStatus();
    } catch (e) {
      console.error('CoPaw start failed:', e);
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await invoke('stop_local_copaw', { port });
      await refreshStatus();
    } catch (e) {
      console.error('CoPaw stop failed:', e);
    }
    setLoading(false);
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await invoke('stop_local_copaw', { port });
      await new Promise((r) => setTimeout(r, 1000));
      await invoke('start_local_copaw', { port });
      await refreshStatus();
    } catch (e) {
      console.error('CoPaw restart failed:', e);
    }
    setLoading(false);
  };

  const isRunning = status?.running ?? false;

  return (
    <div className="local-openclaw-status">
      <h4 className="settings-section-subtitle">{t('settings.copawLocalStatusTitle')}</h4>

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
          checked={store.localCopawAutoStart}
          onChange={(e) => store.setLocalCopawAutoStart(e.target.checked)}
        />
        <span>{t('settings.localStatusAutoStart')}</span>
      </label>

      {auth.isLoggedIn && (
        <>
          <label className="local-openclaw-checkbox">
            <input
              type="checkbox"
              checked={store.localCopawAutoBridge}
              onChange={(e) => store.setLocalCopawAutoBridge(e.target.checked)}
            />
            <span>{t('settings.localStatusAutoBridge')}</span>
          </label>

          {/* Bridge toggle */}
          <button
            className={`settings-auth-btn ${store.copawBridgeEnabled ? 'settings-bridge-active' : ''}`}
            onClick={() => store.setCopawBridgeEnabled(!store.copawBridgeEnabled)}
            style={{ marginTop: '4px' }}
          >
            {store.copawBridgeEnabled ? t('bridge.disable') : t('bridge.enable')}
          </button>
          <span className="settings-hint">{t('settings.copawBridgeHint')}</span>
        </>
      )}
      {!auth.isLoggedIn && (
        <p className="settings-hosted-note">{t('bridge.needLogin')}</p>
      )}

      {/* Info */}
      <div className="local-openclaw-info">
        <span className="settings-hint">{t('settings.localStatusPort')}: {port}</span>
      </div>
    </div>
  );
}
