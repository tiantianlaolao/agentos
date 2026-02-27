import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../stores/settingsStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { useTranslation } from '../i18n/index.ts';

interface PrerequisiteStatus {
  node_installed: boolean;
  node_version: string;
  npm_installed: boolean;
  openclaw_installed: boolean;
  openclaw_version: string;
}

interface InstallResult {
  success: boolean;
  token: string;
  config_dir: string;
  error: string;
}

/** Derive the LLM proxy URL from the AgentOS WS server URL */
function getLLMProxyBaseUrl(serverUrl: string): string {
  const httpUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
  return `${httpUrl}/api/llm-proxy/v1`;
}

interface Props {
  onInstalled: () => void;
}

export function LocalOpenclawSetup({ onInstalled }: Props) {
  const t = useTranslation();
  const store = useSettingsStore();
  const auth = useAuthStore();

  const [checking, setChecking] = useState(true);
  const [prereqs, setPrereqs] = useState<PrerequisiteStatus | null>(null);
  const [useMirror, setUseMirror] = useState(store.locale === 'zh');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [phase, setPhase] = useState<'check' | 'config' | 'installing' | 'starting'>('check');

  // Auto-check prerequisites on mount
  useEffect(() => {
    checkPrereqs();
  }, []);

  const checkPrereqs = async () => {
    setChecking(true);
    try {
      const status = await invoke<PrerequisiteStatus>('check_openclaw_prerequisites');
      setPrereqs(status);
      if (status.node_installed && status.npm_installed) {
        setPhase('config');
      }
    } catch (e) {
      console.error('Failed to check prerequisites:', e);
    }
    setChecking(false);
  };

  const handleInstall = async () => {
    const isDefault = store.deployModelMode === 'default';

    // For custom mode, validate API key
    if (!isDefault && !store.deployApiKey.trim()) {
      setInstallError(t('settings.localSetupApiKeyPlaceholder'));
      return;
    }

    // For default mode, validate login
    if (isDefault && !auth.isLoggedIn) {
      setInstallError(t('settings.hostedNeedLogin'));
      return;
    }

    setInstalling(true);
    setInstallError('');
    setPhase('installing');

    try {
      const registry = useMirror ? 'https://registry.npmmirror.com' : undefined;

      // Determine provider, apiKey, model, baseUrl based on mode
      const provider = isDefault ? 'deepseek' : store.deployProvider;
      const apiKey = isDefault ? (auth.authToken || '') : store.deployApiKey.trim();
      const model = isDefault ? '' : store.deployModel.trim();
      const baseUrl = isDefault ? getLLMProxyBaseUrl(store.serverUrl) : undefined;

      const result = await invoke<InstallResult>('install_openclaw', {
        provider,
        apiKey,
        model,
        port: store.localOpenclawPort || 18789,
        registry,
        baseUrl,
      });

      if (!result.success) {
        setInstallError(result.error);
        setPhase('config');
        setInstalling(false);
        return;
      }

      // Save to store
      store.setLocalOpenclawToken(result.token);
      store.setLocalOpenclawProvider(provider);
      store.setLocalOpenclawApiKey(apiKey);
      store.setLocalOpenclawModel(model);
      store.setLocalOpenclawInstalled(true);

      // Auto-start
      setPhase('starting');
      try {
        await invoke('start_local_openclaw', { port: store.localOpenclawPort || 18789 });
      } catch (e) {
        console.warn('Auto-start failed, user can start manually:', e);
      }

      setInstalling(false);
      onInstalled();
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
      setPhase('config');
      setInstalling(false);
    }
  };

  // Phase: checking prerequisites
  if (checking || phase === 'check') {
    return (
      <div className="local-openclaw-setup">
        <h4 className="settings-section-subtitle">{t('settings.localSetupTitle')}</h4>
        {checking ? (
          <p className="settings-hint">{t('settings.localSetupChecking')}</p>
        ) : prereqs && !prereqs.node_installed ? (
          <div>
            <p className="settings-auth-error">
              {prereqs.node_version
                ? t('settings.localSetupNodeOld').replace('%{version}', prereqs.node_version)
                : t('settings.localSetupNodeMissing')}
            </p>
            <p className="settings-hint">
              <a href="https://nodejs.org" target="_blank" rel="noopener">nodejs.org</a>
              {' '}/{' '}
              <code>brew install node</code>
            </p>
            <button className="settings-auth-btn" onClick={checkPrereqs} style={{ marginTop: '8px' }}>
              {t('process.refresh')}
            </button>
          </div>
        ) : (
          <button className="settings-auth-btn" onClick={checkPrereqs}>
            {t('process.refresh')}
          </button>
        )}
      </div>
    );
  }

  // Phase: installing / starting
  if (phase === 'installing' || phase === 'starting') {
    return (
      <div className="local-openclaw-setup">
        <h4 className="settings-section-subtitle">{t('settings.localSetupTitle')}</h4>
        <p className="settings-hint">
          {phase === 'installing' ? t('settings.localSetupInstalling') : t('settings.localSetupStarting')}
        </p>
        <div className="local-openclaw-spinner" />
      </div>
    );
  }

  const isDefault = store.deployModelMode === 'default';
  const canInstall = isDefault
    ? auth.isLoggedIn
    : !!store.deployApiKey.trim();

  // Phase: config form (provider/apiKey/model now in SettingsPanel)
  return (
    <div className="local-openclaw-setup">
      <h4 className="settings-section-subtitle">{t('settings.localSetupTitle')}</h4>

      {prereqs && (
        <p className="settings-hint" style={{ color: '#4caf50' }}>
          {prereqs.openclaw_installed
            ? t('settings.localSetupOcExists').replace('%{version}', prereqs.openclaw_version)
            : t('settings.localSetupReady')}
        </p>
      )}

      {isDefault && !auth.isLoggedIn && (
        <p className="settings-hosted-note">{t('settings.hostedNeedLogin')}</p>
      )}

      <label className="local-openclaw-checkbox">
        <input
          type="checkbox"
          checked={useMirror}
          onChange={(e) => setUseMirror(e.target.checked)}
        />
        <span>{t('settings.localSetupNpmMirror')}</span>
      </label>

      {installError && (
        <p className="settings-auth-error">
          {t('settings.localSetupInstallError').replace('%{error}', installError)}
        </p>
      )}

      <button
        className="settings-auth-btn"
        onClick={handleInstall}
        disabled={installing || !canInstall}
        style={{ marginTop: '8px' }}
      >
        {t('settings.localSetupInstallBtn')}
      </button>
    </div>
  );
}
