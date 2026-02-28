import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore, KNOWN_AGENTS } from '../stores/settingsStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { login as apiLogin, register as apiRegister, sendCode as apiSendCode } from '../services/authApi.ts';
import { getHostedStatus, updateHostedModel } from '../services/hostedApi.ts';
import { useTranslation } from '../i18n/index.ts';
import { LocalOpenclawSetup } from './LocalOpenclawSetup.tsx';
import { LocalOpenclawStatus } from './LocalOpenclawStatus.tsx';
import { LocalCopawSetup } from './LocalCopawSetup.tsx';
import { LocalCopawStatus } from './LocalCopawStatus.tsx';
import type { AgentMode } from '../types/index.ts';

import type { LLMProvider } from '../stores/settingsStore.ts';

const MODE_COLORS: Record<string, string> = {
  builtin: '#2d7d46',
  agent: '#c26a1b',
  openclaw: '#c26a1b',
  copaw: '#1b6bc2',
};

const MODES: { value: AgentMode; label: string; labelKey: string; descKey: string }[] = [
  { value: 'builtin', label: 'Built-in', labelKey: 'modes.builtin', descKey: 'modes.builtinDesc' },
  { value: 'agent', label: 'External Agent', labelKey: 'modes.agent', descKey: 'modes.agentDesc' },
];

const MODELS: { key: string; label: string }[] = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'moonshot', label: 'Kimi (Moonshot)' },
  { key: 'anthropic', label: 'Claude (Anthropic)' },
];

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

const LANGUAGES: { key: 'zh' | 'en'; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
];

/** Check if a URL points to localhost */
function isLocalUrl(url: string): boolean {
  try {
    const lower = url.toLowerCase();
    return lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('0.0.0.0');
  } catch {
    return false;
  }
}

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const store = useSettingsStore();
  const auth = useAuthStore();
  const t = useTranslation();

  const [formMode, setFormMode] = useState<AgentMode>(store.mode === 'openclaw' || store.mode === 'copaw' ? 'agent' : store.mode);
  const [formBuiltinSubMode, setFormBuiltinSubMode] = useState<'free' | 'byok'>(store.builtinSubMode);
  const [formProvider, setFormProvider] = useState<LLMProvider>(store.provider);
  const [formApiKey, setFormApiKey] = useState(store.apiKey);
  const [formServerUrl] = useState(store.serverUrl);
  const [formSelectedModel, setFormSelectedModel] = useState(store.selectedModel);
  const [formLocale, setFormLocale] = useState(store.locale);
  const [saved, setSaved] = useState(false);

  // Unified agent form state
  const [formAgentSubMode, setFormAgentSubMode] = useState<'direct' | 'deploy'>(store.agentSubMode);
  const [formAgentId, setFormAgentId] = useState(store.agentId);
  const [formAgentUrl, setFormAgentUrl] = useState(store.agentUrl);
  const [formAgentToken, setFormAgentToken] = useState(store.agentToken);
  const [formDeployTemplateId, setFormDeployTemplateId] = useState(store.deployTemplateId);
  const [formDeployModelMode, setFormDeployModelMode] = useState(store.deployModelMode);
  const [formDeployProvider, setFormDeployProvider] = useState<LLMProvider>(store.deployProvider);
  const [formDeployApiKey, setFormDeployApiKey] = useState(store.deployApiKey);
  const [formDeployModel, setFormDeployModel] = useState(store.deployModel);

  // Auth form state
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authCountdown, setAuthCountdown] = useState(0);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');



  // Hosted model update state
  const [hostedModelUpdating, setHostedModelUpdating] = useState(false);
  const [hostedModelMsg, setHostedModelMsg] = useState('');

  const selectedAgent = KNOWN_AGENTS.find(a => a.id === formAgentId);


  const handleUpdateHostedModel = useCallback(async () => {
    if (!formDeployApiKey.trim()) return;
    setHostedModelUpdating(true);
    setHostedModelMsg('');
    try {
      const serverUrl = formServerUrl || store.serverUrl;
      const result = await updateHostedModel(
        formDeployProvider,
        formDeployApiKey,
        formDeployModel || undefined,
        auth.authToken,
        serverUrl,
      );
      if (result.success) {
        setHostedModelMsg('OK');
        setTimeout(() => setHostedModelMsg(''), 2000);
      } else {
        setHostedModelMsg(result.error || 'Failed');
      }
    } catch (e) {
      setHostedModelMsg(e instanceof Error ? e.message : String(e));
    }
    setHostedModelUpdating(false);
  }, [formDeployProvider, formDeployApiKey, formDeployModel, formServerUrl, store.serverUrl, auth.authToken]);

  const handleSave = useCallback(async () => {
    store.setMode(formMode);
    store.setBuiltinSubMode(formBuiltinSubMode);
    store.setProvider(formProvider);
    store.setApiKey(formApiKey);
    store.setServerUrl(formServerUrl);
    store.setSelectedModel(formSelectedModel);
    store.setLocale(formLocale);

    // Unified agent fields
    store.setAgentSubMode(formAgentSubMode);
    store.setAgentId(formAgentId);
    store.setAgentUrl(formAgentUrl);
    store.setAgentToken(formAgentToken);
    store.setDeployTemplateId(formDeployTemplateId);
    store.setDeployModelMode(formDeployModelMode);
    store.setDeployProvider(formDeployProvider);
    store.setDeployApiKey(formDeployApiKey);
    store.setDeployModel(formDeployModel);

    // Also sync to legacy fields for backward compat with App.tsx (until refactored)
    if (formAgentId === 'openclaw') {
      store.setOpenclawUrl(formAgentUrl);
      store.setOpenclawToken(formAgentToken);
      store.setOpenclawSubMode(formAgentSubMode === 'deploy' ? 'deploy' : 'selfhosted');
      store.setSelfhostedType(isLocalUrl(formAgentUrl) ? 'local' : 'remote');
      store.setDeployType('local');
      store.setBridgeEnabled(store.agentBridgeEnabled);
    } else if (formAgentId === 'copaw') {
      store.setCopawUrl(formAgentUrl);
      store.setCopawToken(formAgentToken);
      store.setCopawSubMode(formAgentSubMode === 'deploy' ? 'deploy' : 'selfhosted');
    }

    // Auto-sync model config to local openclaw.json if installed
    if (store.localAgentInstalled && formMode === 'agent' && formAgentSubMode === 'deploy' && formDeployTemplateId === 'openclaw') {
      try {
        const isDefault = formDeployModelMode === 'default';
        const provider = isDefault ? 'deepseek' : formDeployProvider;
        const apiKey = isDefault ? (auth.authToken || '') : formDeployApiKey;
        const model = isDefault ? '' : formDeployModel;
        const httpUrl = formServerUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
        const baseUrl = isDefault ? `${httpUrl}/api/llm-proxy/v1` : undefined;

        const userId = auth.userId || undefined;
        await invoke('update_local_openclaw_config', { provider, apiKey, model, baseUrl, userId });

        // Restart if running
        const port = store.localAgentPort || 18789;
        const status = await invoke<{ running: boolean }>('get_local_openclaw_status', { port });
        if (status?.running) {
          await invoke('stop_local_openclaw');
          await new Promise((r) => setTimeout(r, 1000));
          await invoke('start_local_openclaw', { port, userId });
        }
      } catch (e) {
        console.error('Auto-sync openclaw config failed:', e);
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [
    store, auth.authToken, auth.userId, formMode, formBuiltinSubMode, formProvider, formApiKey, formServerUrl,
    formSelectedModel, formLocale,
    formAgentSubMode, formAgentId, formAgentUrl, formAgentToken,
    formDeployTemplateId, formDeployModelMode, formDeployProvider, formDeployApiKey, formDeployModel,
  ]);

  const handleSendCode = useCallback(async () => {
    setAuthError('');
    if (!authPhone.trim()) {
      setAuthError(t('settings.phoneRequired'));
      return;
    }

    const serverUrl = formServerUrl || store.serverUrl;
    const result = await apiSendCode(authPhone.trim(), serverUrl);
    if (!result.ok) {
      setAuthError(result.error || 'Failed to send code');
      return;
    }

    setAuthCountdown(60);
    const timer = setInterval(() => {
      setAuthCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [authPhone, formServerUrl, store.serverUrl, t]);

  const handleAuth = useCallback(async () => {
    setAuthError('');
    setAuthSuccess('');

    if (!authPhone.trim()) {
      setAuthError(t('settings.phoneRequired'));
      return;
    }
    if (!authPassword) {
      setAuthError(t('settings.passwordRequired'));
      return;
    }
    if (authTab === 'register' && authPassword !== authConfirmPassword) {
      setAuthError(t('settings.passwordMismatch'));
      return;
    }

    setAuthLoading(true);
    const serverUrl = formServerUrl || store.serverUrl;
    const result = authTab === 'login'
      ? await apiLogin(authPhone, authPassword, serverUrl)
      : await apiRegister(authPhone, authPassword, authCode, serverUrl);
    setAuthLoading(false);

    if (result.ok && result.data) {
      try {
        await invoke('stop_local_openclaw');
      } catch { /* ignore */ }
      auth.login(result.data.userId, result.data.phone, result.data.token);
      try {
        const installed = await invoke<boolean>('check_local_openclaw_installed', { userId: result.data.userId });
        store.setLocalOpenclawInstalled(installed);
        store.setLocalAgentInstalled(installed);
      } catch { /* ignore */ }
      setAuthSuccess(authTab === 'login' ? t('settings.loginSuccess') : t('settings.registerSuccess'));
      setAuthPhone('');
      setAuthPassword('');
      setAuthConfirmPassword('');
      setAuthCode('');
      setTimeout(() => setAuthSuccess(''), 2000);
    } else {
      setAuthError(result.error || 'Unknown error');
    }
  }, [authTab, authPhone, authPassword, authConfirmPassword, authCode, formServerUrl, store.serverUrl, auth, store, t]);

  const handleLogout = useCallback(async () => {
    try {
      await invoke('stop_local_openclaw');
    } catch { /* ignore */ }
    auth.logout();
    store.setHostedActivated(false);
    store.setHostedQuota(0, 0);
    store.setHostedInstanceStatus('');
    store.setLocalOpenclawInstalled(false);
    store.setLocalAgentInstalled(false);
  }, [auth, store]);

  const handleRefreshHostedStatus = useCallback(async () => {
    try {
      const serverUrl = formServerUrl || store.serverUrl;
      const result = await getHostedStatus(auth.authToken, serverUrl);
      if (result.activated && result.account) {
        store.setHostedActivated(true);
        store.setHostedQuota(result.account.quotaUsed, result.account.quotaTotal);
        store.setHostedInstanceStatus(result.account.instanceStatus);
      }
    } catch { /* ignore */ }
  }, [auth.authToken, formServerUrl, store]);

  const activeModeColor = MODE_COLORS[store.mode] || '#c26a1b';
  const activeModeLabel = t(`modes.${store.mode}`);

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2 className="settings-title">{t('settings.title')}</h2>
        <button className="settings-close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="settings-body">
        {/* Account section */}
        <div className="settings-section">
          <h3 className="settings-section-title">{t('settings.account')}</h3>
          {auth.isLoggedIn ? (
            <div className="settings-account-info">
              <span className="settings-account-phone">{auth.phone}</span>
              <button className="settings-logout-btn" onClick={handleLogout}>
                {t('settings.logout')}
              </button>
            </div>
          ) : (
            <div className="settings-auth-form">
              <div className="settings-submode-row">
                <button
                  className={`settings-submode-btn ${authTab === 'login' ? 'active' : ''}`}
                  onClick={() => { setAuthTab('login'); setAuthError(''); }}
                >
                  {t('settings.login')}
                </button>
                <button
                  className={`settings-submode-btn ${authTab === 'register' ? 'active' : ''}`}
                  onClick={() => { setAuthTab('register'); setAuthError(''); }}
                >
                  {t('settings.register')}
                </button>
              </div>
              <div className="settings-field">
                <label className="settings-label">{t('settings.phone')}</label>
                <input
                  className="settings-input"
                  value={authPhone}
                  onChange={(e) => setAuthPhone(e.target.value)}
                  placeholder={t('settings.phonePlaceholder')}
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">{t('settings.password')}</label>
                <input
                  className="settings-input"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder={t('settings.passwordPlaceholder')}
                />
              </div>
              {authTab === 'register' && (
                <>
                  <div className="settings-field">
                    <label className="settings-label">{t('settings.confirmPassword')}</label>
                    <input
                      className="settings-input"
                      type="password"
                      value={authConfirmPassword}
                      onChange={(e) => setAuthConfirmPassword(e.target.value)}
                      placeholder={t('settings.confirmPasswordPlaceholder')}
                    />
                  </div>
                  <div className="settings-field">
                    <label className="settings-label">{t('settings.verificationCode')}</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        className="settings-input"
                        style={{ flex: 1 }}
                        value={authCode}
                        onChange={(e) => setAuthCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                      />
                      <button
                        className="settings-auth-btn"
                        style={{ whiteSpace: 'nowrap', minWidth: '110px', marginTop: 0 }}
                        onClick={handleSendCode}
                        disabled={authCountdown > 0}
                      >
                        {authCountdown > 0
                          ? t('settings.resendIn').replace('%{seconds}', String(authCountdown))
                          : t('settings.sendCode')}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {authError && <p className="settings-auth-error">{authError}</p>}
              {authSuccess && <p className="settings-auth-success">{authSuccess}</p>}
              <button
                className="settings-auth-btn"
                onClick={handleAuth}
                disabled={authLoading}
              >
                {authLoading
                  ? (authTab === 'login' ? t('settings.loggingIn') : t('settings.registering'))
                  : (authTab === 'login' ? t('settings.login') : t('settings.register'))
                }
              </button>
            </div>
          )}
        </div>

        {/* Current active mode bar */}
        <div className="settings-current-mode" style={{ borderColor: activeModeColor + '66' }}>
          <span className="settings-current-dot" style={{ background: activeModeColor }} />
          <span className="settings-current-label">{t('settings.currentMode')}</span>
          <span className="settings-current-value" style={{ color: activeModeColor }}>
            {activeModeLabel}
          </span>
        </div>

        {/* Connection Mode — only 2 options: builtin | agent */}
        <div className="settings-section">
          <h3 className="settings-section-title">{t('settings.connectionMode')}</h3>
          <div className="settings-mode-list">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={`settings-mode-card ${formMode === m.value ? 'active' : ''}`}
                onClick={() => setFormMode(m.value)}
                style={formMode === m.value ? { borderColor: MODE_COLORS[m.value] } : undefined}
              >
                <div className="settings-mode-radio">
                  <span
                    className={`settings-radio-outer ${formMode === m.value ? 'selected' : ''}`}
                    style={formMode === m.value ? { borderColor: MODE_COLORS[m.value] } : undefined}
                  >
                    {formMode === m.value && (
                      <span
                        className="settings-radio-inner"
                        style={{ background: MODE_COLORS[m.value] }}
                      />
                    )}
                  </span>
                </div>
                <div className="settings-mode-text">
                  <span className="settings-mode-name">{t(m.labelKey)}</span>
                  <span className="settings-mode-desc">{t(m.descKey)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Built-in settings: free / BYOK sub-mode */}
        {formMode === 'builtin' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.model')}</h3>
            <div className="settings-submode-row">
              <button
                className={`settings-submode-btn ${formBuiltinSubMode === 'free' ? 'active' : ''}`}
                onClick={() => setFormBuiltinSubMode('free')}
              >
                {t('modes.builtinFree')}
              </button>
              <button
                className={`settings-submode-btn ${formBuiltinSubMode === 'byok' ? 'active' : ''}`}
                onClick={() => setFormBuiltinSubMode('byok')}
              >
                {t('modes.builtinByok')}
              </button>
            </div>
            {formBuiltinSubMode === 'free' && (
              <select
                className="settings-select"
                value={formSelectedModel}
                onChange={(e) => setFormSelectedModel(e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            )}
            {formBuiltinSubMode === 'byok' && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t('settings.provider')}</label>
                  <select
                    className="settings-select"
                    value={formProvider}
                    onChange={(e) => setFormProvider(e.target.value as LLMProvider)}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t('settings.apiKey')}</label>
                  <input
                    className="settings-input"
                    type="password"
                    value={formApiKey}
                    onChange={(e) => setFormApiKey(e.target.value)}
                    placeholder={t('settings.apiKeyPlaceholder')}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ========= External Agent settings ========= */}
        {formMode === 'agent' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.agentConfig')}</h3>

            {/* Sub-mode: Direct | Deploy */}
            <div className="settings-submode-row">
              <button
                className={`settings-submode-btn ${formAgentSubMode === 'direct' ? 'active' : ''}`}
                onClick={() => setFormAgentSubMode('direct')}
              >
                {t('settings.directConnect')}
              </button>
              <button
                className={`settings-submode-btn ${formAgentSubMode === 'deploy' ? 'active' : ''}`}
                onClick={() => setFormAgentSubMode('deploy')}
              >
                {t('settings.deploy')}
              </button>
            </div>

            {/* ── Direct Connect ── */}
            {formAgentSubMode === 'direct' && (
              <>
                {/* Agent card selection */}
                <div className="settings-field" style={{ marginTop: '8px' }}>
                  <label className="settings-label">{t('settings.selectAgent')}</label>
                  <div className="settings-mode-list" style={{ gap: '6px' }}>
                    {KNOWN_AGENTS.map((agent) => (
                      <button
                        key={agent.id}
                        className={`settings-mode-card ${formAgentId === agent.id ? 'active' : ''}`}
                        onClick={() => setFormAgentId(agent.id)}
                        style={formAgentId === agent.id ? { borderColor: '#c26a1b' } : undefined}
                      >
                        <div className="settings-mode-radio">
                          <span
                            className={`settings-radio-outer ${formAgentId === agent.id ? 'selected' : ''}`}
                            style={formAgentId === agent.id ? { borderColor: '#c26a1b' } : undefined}
                          >
                            {formAgentId === agent.id && (
                              <span className="settings-radio-inner" style={{ background: '#c26a1b' }} />
                            )}
                          </span>
                        </div>
                        <div className="settings-mode-text">
                          <span className="settings-mode-name">{agent.icon} {agent.name}</span>
                          <span className="settings-mode-desc">{agent.protocol === 'openclaw-ws' ? 'WebSocket' : agent.protocol === 'ag-ui' ? 'HTTP/SSE' : t('settings.comingSoon')}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Agent-specific fields */}
                {formAgentId === 'custom' ? (
                  <div className="settings-field" style={{ marginTop: '8px' }}>
                    <span className="settings-hint" style={{ color: '#999' }}>{t('settings.comingSoon')}</span>
                  </div>
                ) : (
                  <>
                    <div className="settings-field">
                      <label className="settings-label">
                        {selectedAgent?.transport === 'ws' ? 'WebSocket URL' : 'HTTP URL'}
                      </label>
                      <input
                        className="settings-input"
                        value={formAgentUrl}
                        onChange={(e) => setFormAgentUrl(e.target.value)}
                        placeholder={selectedAgent?.urlPlaceholder || ''}
                      />
                      <span className="settings-hint">{selectedAgent?.urlHint || ''}</span>
                    </div>
                    <div className="settings-field">
                      <label className="settings-label">
                        Token {selectedAgent?.tokenRequired ? '' : `(${t('settings.optional')})`}
                      </label>
                      <input
                        className="settings-input"
                        type="password"
                        value={formAgentToken}
                        onChange={(e) => setFormAgentToken(e.target.value)}
                        placeholder={t('settings.accessTokenPlaceholder')}
                      />
                    </div>

                    {/* Bridge toggle — only when URL is localhost and user is logged in */}
                    {isLocalUrl(formAgentUrl) && (
                      <>
                        {!auth.isLoggedIn ? (
                          <p className="settings-hosted-note">{t('bridge.needLogin')}</p>
                        ) : (
                          <>
                            <button
                              className={`settings-auth-btn ${store.agentBridgeEnabled ? 'settings-bridge-active' : ''}`}
                              onClick={() => store.setAgentBridgeEnabled(!store.agentBridgeEnabled)}
                            >
                              {store.agentBridgeEnabled ? t('bridge.disable') : t('bridge.enable')}
                            </button>
                            <span className="settings-hint">{t('settings.localBridgeHint')}</span>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── One-click Deploy ── */}
            {formAgentSubMode === 'deploy' && (
              <>
                {/* Template selection */}
                <div className="settings-field" style={{ marginTop: '8px' }}>
                  <label className="settings-label">{t('settings.selectAgent')}</label>
                  <div className="settings-mode-list" style={{ gap: '6px' }}>
                    {KNOWN_AGENTS.filter(a => a.deploy).map((agent) => (
                      <button
                        key={agent.id}
                        className={`settings-mode-card ${formDeployTemplateId === agent.id ? 'active' : ''}`}
                        onClick={() => setFormDeployTemplateId(agent.id)}
                        style={formDeployTemplateId === agent.id ? { borderColor: '#c26a1b' } : undefined}
                      >
                        <div className="settings-mode-radio">
                          <span
                            className={`settings-radio-outer ${formDeployTemplateId === agent.id ? 'selected' : ''}`}
                            style={formDeployTemplateId === agent.id ? { borderColor: '#c26a1b' } : undefined}
                          >
                            {formDeployTemplateId === agent.id && (
                              <span className="settings-radio-inner" style={{ background: '#c26a1b' }} />
                            )}
                          </span>
                        </div>
                        <div className="settings-mode-text">
                          <span className="settings-mode-name">{agent.icon} {agent.name}</span>
                          <span className="settings-mode-desc">{agent.deploy?.runtime === 'node' ? 'Node.js' : 'Python'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model selection — shared across templates */}
                <div className="settings-field" style={{ marginTop: '8px' }}>
                  <label className="settings-label">{t('settings.deployModel')}</label>
                  <div className="settings-submode-row">
                    <button
                      className={`settings-submode-btn ${formDeployModelMode === 'default' ? 'active' : ''}`}
                      onClick={() => setFormDeployModelMode('default')}
                    >
                      {t('settings.deployModelDefault')}
                    </button>
                    <button
                      className={`settings-submode-btn ${formDeployModelMode === 'custom' ? 'active' : ''}`}
                      onClick={() => setFormDeployModelMode('custom')}
                    >
                      {t('settings.deployModelCustom')}
                    </button>
                  </div>
                  <span className="settings-hint">
                    {formDeployModelMode === 'default'
                      ? t('settings.deployModelDefaultHint')
                      : t('settings.deployModelCustomHint')}
                  </span>
                </div>

                {formDeployModelMode === 'custom' && (
                  <>
                    <div className="settings-field">
                      <label className="settings-label">{t('settings.localSetupProvider')}</label>
                      <select
                        className="settings-select"
                        value={formDeployProvider}
                        onChange={(e) => setFormDeployProvider(e.target.value as LLMProvider)}
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
                        value={formDeployApiKey}
                        onChange={(e) => setFormDeployApiKey(e.target.value)}
                        placeholder={t('settings.localSetupApiKeyPlaceholder')}
                      />
                    </div>
                    <div className="settings-field">
                      <label className="settings-label">{t('settings.localSetupModel')}</label>
                      <input
                        className="settings-input"
                        value={formDeployModel}
                        onChange={(e) => setFormDeployModel(e.target.value)}
                        placeholder={t('settings.localSetupModelPlaceholder')}
                      />
                    </div>
                  </>
                )}

                {/* Render Setup/Status based on template */}
                {formDeployTemplateId === 'openclaw' && (
                  <>
                    {store.localAgentInstalled || store.localOpenclawInstalled ? (
                      <LocalOpenclawStatus />
                    ) : (
                      <LocalOpenclawSetup onInstalled={() => {
                        store.setLocalOpenclawInstalled(true);
                        store.setLocalAgentInstalled(true);
                      }} />
                    )}
                  </>
                )}

                {formDeployTemplateId === 'copaw' && (
                  <>
                    {store.localCopawInstalled ? (
                      <LocalCopawStatus />
                    ) : (
                      <LocalCopawSetup onInstalled={() => {
                        store.setLocalCopawInstalled(true);
                        store.setLocalAgentInstalled(true);
                      }} />
                    )}
                  </>
                )}

                {/* Hosted section (legacy, for cloud deploy users) */}
                {formDeployTemplateId === 'openclaw' && store.hostedActivated && (
                  <div className="settings-hosted-section" style={{ marginTop: '8px' }}>
                    <div className="settings-hosted-status">
                      {store.hostedInstanceStatus === 'provisioning' && (
                        <p className="settings-hosted-note">{t('settings.instanceProvisioning')}</p>
                      )}
                      {store.hostedInstanceStatus === 'ready' && (
                        <p className="settings-hosted-ready">
                          {t('settings.instanceReady')} — {t('settings.quotaLabel')}: {store.hostedQuotaUsed}/{store.hostedQuotaTotal}
                        </p>
                      )}
                      {store.hostedInstanceStatus === 'error' && (
                        <p className="settings-auth-error">{t('settings.instanceError')}</p>
                      )}
                      {store.hostedInstanceStatus !== 'ready' && (
                        <button className="settings-auth-btn" onClick={handleRefreshHostedStatus}>
                          Refresh
                        </button>
                      )}
                      {store.hostedInstanceStatus === 'ready' && formDeployModelMode === 'custom' && (
                        <>
                          <button
                            className="settings-auth-btn"
                            onClick={handleUpdateHostedModel}
                            disabled={hostedModelUpdating || !formDeployApiKey.trim()}
                            style={{ marginTop: '4px' }}
                          >
                            {hostedModelUpdating ? '...' : t('settings.save')}
                          </button>
                          {hostedModelMsg && <span className="settings-hint">{hostedModelMsg}</span>}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Language */}
        <div className="settings-section">
          <h3 className="settings-section-title">{t('settings.language')}</h3>
          <div className="settings-lang-row">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.key}
                className={`settings-lang-btn ${formLocale === lang.key ? 'active' : ''}`}
                onClick={() => setFormLocale(lang.key)}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <button className={`settings-save ${saved ? 'saved' : ''}`} onClick={handleSave}>
          {saved ? t('settings.saved') : t('settings.save')}
        </button>

        {/* Version */}
        <div className="settings-about">
          <span className="settings-version">{t('settings.version')}</span>
        </div>
      </div>
    </div>
  );
}
