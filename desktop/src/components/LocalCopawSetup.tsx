import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../stores/settingsStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { useTranslation } from '../i18n/index.ts';

import type { LLMProvider } from '../stores/settingsStore.ts';

interface CopawPrerequisiteStatus {
  python_installed: boolean;
  python_version: string;
  pip_installed: boolean;
}

interface CopawInstallResult {
  success: boolean;
  config_dir: string;
  error: string;
}

/** Derive the LLM proxy URL from the AgentOS WS server URL */
function getLLMProxyBaseUrl(serverUrl: string): string {
  const httpUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
  return `${httpUrl}/api/llm-proxy/v1`;
}

const PROVIDERS: { key: LLMProvider; label: string }[] = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'gemini', label: 'Google Gemini' },
  { key: 'moonshot', label: 'Moonshot (Kimi)' },
  { key: 'qwen', label: 'Qwen (通义千问)' },
  { key: 'zhipu', label: 'Z.AI (智谱 GLM)' },
  { key: 'openrouter', label: 'OpenRouter' },
];

interface Props {
  onInstalled: () => void;
}

export function LocalCopawSetup({ onInstalled }: Props) {
  const t = useTranslation();
  const store = useSettingsStore();
  const auth = useAuthStore();

  const [checking, setChecking] = useState(true);
  const [prereqs, setPrereqs] = useState<CopawPrerequisiteStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [phase, setPhase] = useState<'check' | 'config' | 'installing' | 'starting'>('check');

  useEffect(() => {
    checkPrereqs();
  }, []);

  const checkPrereqs = async () => {
    setChecking(true);
    try {
      const status = await invoke<CopawPrerequisiteStatus>('check_copaw_prerequisites');
      setPrereqs(status);
      if (status.python_installed && status.pip_installed) {
        setPhase('config');
      }
    } catch (e) {
      console.error('Failed to check CoPaw prerequisites:', e);
    }
    setChecking(false);
  };

  const handleInstall = async () => {
    const isDefault = store.copawDeployModelMode === 'default';

    if (!isDefault && !store.copawDeployApiKey.trim()) {
      setInstallError(t('settings.localSetupApiKeyPlaceholder'));
      return;
    }

    if (isDefault && !auth.isLoggedIn) {
      setInstallError(t('settings.hostedNeedLogin'));
      return;
    }

    setInstalling(true);
    setInstallError('');
    setPhase('installing');

    try {
      const provider = isDefault ? 'deepseek' : store.copawDeployProvider;
      const apiKey = isDefault ? (auth.authToken || '') : store.copawDeployApiKey.trim();
      const model = isDefault ? '' : store.copawDeployModel.trim();
      const baseUrl = isDefault ? getLLMProxyBaseUrl(store.serverUrl) : undefined;

      const result = await invoke<CopawInstallResult>('install_copaw', {
        provider,
        apiKey,
        model,
        port: store.localCopawPort || 8088,
        baseUrl,
      });

      if (!result.success) {
        setInstallError(result.error);
        setPhase('config');
        setInstalling(false);
        return;
      }

      store.setLocalCopawInstalled(true);

      // Auto-start
      setPhase('starting');
      try {
        await invoke('start_local_copaw', { port: store.localCopawPort || 8088 });
      } catch (e) {
        console.warn('CoPaw auto-start failed, user can start manually:', e);
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
        <h4 className="settings-section-subtitle">{t('settings.copawLocalSetupTitle')}</h4>
        {checking ? (
          <p className="settings-hint">{t('settings.copawLocalChecking')}</p>
        ) : prereqs && !prereqs.python_installed ? (
          <div>
            <p className="settings-auth-error">
              {prereqs.python_version
                ? t('settings.copawPythonOld').replace('%{version}', prereqs.python_version)
                : t('settings.copawPythonMissing')}
            </p>
            <p className="settings-hint">
              <a href="https://python.org" target="_blank" rel="noopener">python.org</a>
              {' '}/{' '}
              <code>brew install python3</code>
            </p>
            <button className="settings-auth-btn" onClick={checkPrereqs} style={{ marginTop: '8px' }}>
              {t('process.refresh')}
            </button>
          </div>
        ) : prereqs && !prereqs.pip_installed ? (
          <div>
            <p className="settings-auth-error">{t('settings.copawPipMissing')}</p>
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
        <h4 className="settings-section-subtitle">{t('settings.copawLocalSetupTitle')}</h4>
        <p className="settings-hint">
          {phase === 'installing' ? t('settings.copawInstalling') : t('settings.copawStarting')}
        </p>
        <div className="local-openclaw-spinner" />
      </div>
    );
  }

  const isDefault = store.copawDeployModelMode === 'default';
  const canInstall = isDefault
    ? auth.isLoggedIn
    : !!store.copawDeployApiKey.trim();

  // Phase: config form
  return (
    <div className="local-openclaw-setup">
      <h4 className="settings-section-subtitle">{t('settings.copawLocalSetupTitle')}</h4>

      {prereqs && (
        <p className="settings-hint" style={{ color: '#4caf50' }}>
          Python {prereqs.python_version} {t('settings.copawPythonReady')}
        </p>
      )}

      {isDefault && !auth.isLoggedIn && (
        <p className="settings-hosted-note">{t('settings.hostedNeedLogin')}</p>
      )}

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
        {t('settings.copawInstallBtn')}
      </button>
    </div>
  );
}
