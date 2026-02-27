import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../stores/settingsStore.ts';
import { useTranslation } from '../i18n/index.ts';

type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'moonshot';

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

const PROVIDERS: { key: LLMProvider; label: string }[] = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'moonshot', label: 'Moonshot (Kimi)' },
];

interface Props {
  onInstalled: () => void;
}

export function LocalOpenclawSetup({ onInstalled }: Props) {
  const t = useTranslation();
  const store = useSettingsStore();

  const [checking, setChecking] = useState(true);
  const [prereqs, setPrereqs] = useState<PrerequisiteStatus | null>(null);
  const [provider, setProvider] = useState<LLMProvider>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
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
    if (!apiKey.trim()) {
      setInstallError(t('settings.localSetupApiKeyPlaceholder'));
      return;
    }
    setInstalling(true);
    setInstallError('');
    setPhase('installing');

    try {
      const registry = useMirror ? 'https://registry.npmmirror.com' : undefined;
      const result = await invoke<InstallResult>('install_openclaw', {
        provider,
        apiKey: apiKey.trim(),
        model: model.trim(),
        port: store.localOpenclawPort || 18789,
        registry,
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
      store.setLocalOpenclawApiKey(apiKey.trim());
      store.setLocalOpenclawModel(model.trim());
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

  // Phase: config form
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

      <div className="settings-field">
        <label className="settings-label">{t('settings.localSetupProvider')}</label>
        <select
          className="settings-select"
          value={provider}
          onChange={(e) => setProvider(e.target.value as LLMProvider)}
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
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t('settings.localSetupApiKeyPlaceholder')}
        />
      </div>

      <div className="settings-field">
        <label className="settings-label">{t('settings.localSetupModel')}</label>
        <input
          className="settings-input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={t('settings.localSetupModelPlaceholder')}
        />
      </div>

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
        disabled={installing || !apiKey.trim()}
        style={{ marginTop: '8px' }}
      >
        {t('settings.localSetupInstallBtn')}
      </button>
    </div>
  );
}
