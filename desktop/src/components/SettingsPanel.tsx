import { useState, useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore.ts';
import { useAuthStore } from '../stores/authStore.ts';
import { login as apiLogin, register as apiRegister, sendCode as apiSendCode } from '../services/authApi.ts';
import { activateHostedAccess, getHostedStatus } from '../services/hostedApi.ts';
import { useTranslation } from '../i18n/index.ts';
import type { AgentMode } from '../types/index.ts';

type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'moonshot';

const MODE_COLORS: Record<AgentMode, string> = {
  builtin: '#2d7d46',
  openclaw: '#c26a1b',
  copaw: '#1b6bc2',
};

const MODES: { value: AgentMode; label: string; description: string }[] = [
  { value: 'builtin', label: 'Built-in', description: 'Server-hosted DeepSeek' },
  { value: 'openclaw', label: 'OpenClaw', description: 'Full agent mode' },
  { value: 'copaw', label: 'CoPaw', description: 'Remote CoPaw agent' },
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
  { key: 'moonshot', label: 'Moonshot' },
];

const LANGUAGES: { key: 'zh' | 'en'; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
];

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const store = useSettingsStore();
  const auth = useAuthStore();
  const t = useTranslation();

  const [formMode, setFormMode] = useState<AgentMode>(store.mode);
  const [formBuiltinSubMode, setFormBuiltinSubMode] = useState<'free' | 'byok'>(store.builtinSubMode);
  const [formProvider, setFormProvider] = useState<LLMProvider>(store.provider);
  const [formApiKey, setFormApiKey] = useState(store.apiKey);
  const [formServerUrl] = useState(store.serverUrl);
  const [formSelectedModel, setFormSelectedModel] = useState(store.selectedModel);
  const [formOpenclawUrl, setFormOpenclawUrl] = useState(store.openclawUrl);
  const [formOpenclawToken, setFormOpenclawToken] = useState(store.openclawToken);
  const [formOpenclawSubMode, setFormOpenclawSubMode] = useState(store.openclawSubMode);
  const [formCopawUrl, setFormCopawUrl] = useState(store.copawUrl);
  const [formCopawToken, setFormCopawToken] = useState(store.copawToken);
  const [formCopawSubMode, setFormCopawSubMode] = useState(store.copawSubMode);
  const [formLocale, setFormLocale] = useState(store.locale);
  const [saved, setSaved] = useState(false);

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

  // Hosted activation state
  const [inviteCode, setInviteCode] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);
  const [activateError, setActivateError] = useState('');

  const handleSave = useCallback(() => {
    store.setMode(formMode);
    store.setBuiltinSubMode(formBuiltinSubMode);
    store.setProvider(formProvider);
    store.setApiKey(formApiKey);
    store.setServerUrl(formServerUrl);
    store.setSelectedModel(formSelectedModel);
    store.setOpenclawUrl(formOpenclawUrl);
    store.setOpenclawToken(formOpenclawToken);
    store.setOpenclawSubMode(formOpenclawSubMode);
    store.setCopawUrl(formCopawUrl);
    store.setCopawToken(formCopawToken);
    store.setCopawSubMode(formCopawSubMode);
    store.setLocale(formLocale);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [
    store, formMode, formBuiltinSubMode, formProvider, formApiKey, formServerUrl,
    formSelectedModel, formOpenclawUrl, formOpenclawToken,
    formOpenclawSubMode, formCopawUrl, formCopawToken, formCopawSubMode, formLocale,
  ]);

  const handleSendCode = useCallback(async () => {
    setAuthError('');
    if (!authPhone.trim()) {
      setAuthError(t('settings.phoneRequired'));
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

    const serverUrl = formServerUrl || store.serverUrl;
    const result = await apiSendCode(authPhone.trim(), serverUrl);
    if (!result.ok) {
      setAuthError(result.error || 'Failed to send code');
    }
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
      auth.login(result.data.userId, result.data.phone, result.data.token);
      setAuthSuccess(authTab === 'login' ? t('settings.loginSuccess') : t('settings.registerSuccess'));
      setAuthPhone('');
      setAuthPassword('');
      setAuthConfirmPassword('');
      setAuthCode('');
      setTimeout(() => setAuthSuccess(''), 2000);
    } else {
      setAuthError(result.error || 'Unknown error');
    }
  }, [authTab, authPhone, authPassword, authConfirmPassword, authCode, formServerUrl, store.serverUrl, auth, t]);

  const handleLogout = useCallback(() => {
    auth.logout();
    store.setHostedActivated(false);
    store.setHostedQuota(0, 0);
    store.setHostedInstanceStatus('');
  }, [auth, store]);

  const handleActivate = useCallback(async () => {
    if (!inviteCode.trim()) return;
    setActivateError('');
    setActivateLoading(true);
    try {
      const serverUrl = formServerUrl || store.serverUrl;
      const result = await activateHostedAccess(inviteCode, auth.authToken, serverUrl);
      if (result.success && result.account) {
        store.setHostedActivated(true);
        store.setHostedQuota(result.account.quotaUsed, result.account.quotaTotal);
        store.setHostedInstanceStatus(result.account.instanceStatus);
        setInviteCode('');
      } else {
        setActivateError(result.error || 'Activation failed');
      }
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : String(e));
    }
    setActivateLoading(false);
  }, [inviteCode, auth.authToken, formServerUrl, store]);

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

  const activeModeColor = MODE_COLORS[store.mode];
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

        {/* Connection Mode */}
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
                  <span className="settings-mode-name">{t(`modes.${m.value}`)}</span>
                  <span className="settings-mode-desc">{t(`modes.${m.value}Desc`)}</span>
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

        {/* OpenClaw settings */}
        {formMode === 'openclaw' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.openclawConfig')}</h3>
            <div className="settings-submode-row">
              <button
                className={`settings-submode-btn ${formOpenclawSubMode === 'hosted' ? 'active' : ''}`}
                onClick={() => setFormOpenclawSubMode('hosted')}
              >
                {t('settings.hosted')}
              </button>
              <button
                className={`settings-submode-btn ${formOpenclawSubMode === 'selfhosted' ? 'active' : ''}`}
                onClick={() => setFormOpenclawSubMode('selfhosted')}
              >
                {t('settings.selfhosted')}
              </button>
            </div>
            {formOpenclawSubMode === 'selfhosted' && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t('settings.openclawUrl')}</label>
                  <input
                    className="settings-input"
                    value={formOpenclawUrl}
                    onChange={(e) => setFormOpenclawUrl(e.target.value)}
                    placeholder={t('settings.openclawUrlPlaceholder')}
                  />
                  <span className="settings-hint">{t('settings.openclawUrlHint')}</span>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t('settings.accessToken')}</label>
                  <input
                    className="settings-input"
                    type="password"
                    value={formOpenclawToken}
                    onChange={(e) => setFormOpenclawToken(e.target.value)}
                    placeholder={t('settings.accessTokenPlaceholder')}
                  />
                  <span className="settings-hint">{t('settings.openclawTokenHint')}</span>
                </div>
              </>
            )}
            {formOpenclawSubMode === 'hosted' && (
              <div className="settings-hosted-section">
                {!auth.isLoggedIn ? (
                  <p className="settings-hosted-note">{t('settings.hostedNeedLogin')}</p>
                ) : !store.hostedActivated ? (
                  <>
                    <p className="settings-hosted-note">{t('settings.hostedNote')}</p>
                    <div className="settings-field">
                      <label className="settings-label">{t('settings.inviteCode')}</label>
                      <input
                        className="settings-input"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder={t('settings.inviteCodePlaceholder')}
                      />
                    </div>
                    {activateError && <p className="settings-auth-error">{activateError}</p>}
                    <button
                      className="settings-auth-btn"
                      onClick={handleActivate}
                      disabled={activateLoading}
                    >
                      {activateLoading ? t('settings.activating') : t('settings.activate')}
                    </button>
                  </>
                ) : (
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
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CoPaw settings */}
        {formMode === 'copaw' && (
          <div className="settings-section">
            <h3 className="settings-section-title">{t('settings.copawConfig')}</h3>
            <div className="settings-submode-row">
              <button
                className={`settings-submode-btn ${formCopawSubMode === 'hosted' ? 'active' : ''}`}
                onClick={() => setFormCopawSubMode('hosted')}
              >
                {t('settings.copawHosted')}
              </button>
              <button
                className={`settings-submode-btn ${formCopawSubMode === 'selfhosted' ? 'active' : ''}`}
                onClick={() => setFormCopawSubMode('selfhosted')}
              >
                {t('settings.copawSelfhosted')}
              </button>
            </div>
            {formCopawSubMode === 'hosted' && (
              <p className="settings-hosted-note">{t('settings.copawHostedDesc')}</p>
            )}
            {formCopawSubMode === 'selfhosted' && (
              <>
                <div className="settings-field">
                  <label className="settings-label">{t('settings.copawUrl')}</label>
                  <input
                    className="settings-input"
                    value={formCopawUrl}
                    onChange={(e) => setFormCopawUrl(e.target.value)}
                    placeholder={t('settings.copawUrlPlaceholder')}
                  />
                  <span className="settings-hint">{t('settings.copawUrlHint')}</span>
                </div>
                <div className="settings-field">
                  <label className="settings-label">{t('settings.accessToken')}</label>
                  <input
                    className="settings-input"
                    type="password"
                    value={formCopawToken}
                    onChange={(e) => setFormCopawToken(e.target.value)}
                    placeholder={t('settings.accessTokenPlaceholder')}
                  />
                  <span className="settings-hint">{t('settings.copawTokenHint')}</span>
                </div>
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
