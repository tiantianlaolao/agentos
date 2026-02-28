import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation, setLocale as setI18nLocale } from '../../src/i18n';
import { getSetting, setSetting, userKey } from '../../src/services/storage';
import { getHostedStatus } from '../../src/services/hostedApi';
import type { ConnectionMode, LLMProvider } from '../../src/types/protocol';
import Constants from 'expo-constants';

const MODES: { key: ConnectionMode; titleKey: string; descKey: string }[] = [
  { key: 'builtin', titleKey: 'settings.builtin', descKey: 'settings.builtinDesc' },
  { key: 'agent', titleKey: 'settings.agent', descKey: 'settings.agentDesc' },
];

const MODE_COLORS: Record<string, string> = {
  builtin: '#2d7d46',
  agent: '#1b6bc2',
  openclaw: '#c26a1b',
  copaw: '#1b6bc2',
};

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

const LANGUAGES = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
];

// Reusable dropdown selector
function Dropdown<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value);

  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text style={styles.dropdownText}>{selected?.label || value}</Text>
        <Ionicons name="chevron-down" size={18} color="#888" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.dropdownOverlay} onPress={() => setOpen(false)}>
          <View style={styles.dropdownMenu}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.dropdownItem, opt.key === value && styles.dropdownItemSelected]}
                onPress={() => { onChange(opt.key); setOpen(false); }}
              >
                <Text style={[styles.dropdownItemText, opt.key === value && styles.dropdownItemTextSelected]}>
                  {opt.label}
                </Text>
                {opt.key === value && <Ionicons name="checkmark" size={18} color="#6c63ff" />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function SettingsScreen() {
  const t = useTranslation();
  const store = useSettingsStore();
  const authStore = useAuthStore();
  const router = useRouter();
  // Local form state
  // Map openclaw/copaw to 'agent' for UI display (they share the agent visual group)
  const [formMode, setFormMode] = useState<ConnectionMode>(
    store.mode === 'openclaw' || store.mode === 'copaw' ? 'agent' : store.mode
  );
  const [formBuiltinSubMode, setFormBuiltinSubMode] = useState<'free' | 'byok'>(store.builtinSubMode);
  const [formProvider, setFormProvider] = useState<LLMProvider>(store.provider);
  const [formApiKey, setFormApiKey] = useState(store.apiKey);
  const [formOpenclawUrl, setFormOpenclawUrl] = useState(store.openclawUrl);
  const [formOpenclawToken, setFormOpenclawToken] = useState(store.openclawToken);
  const [formLocale, setFormLocale] = useState(store.locale);
  const [formModel, setFormModel] = useState(store.selectedModel);
  const [formSubMode, setFormSubMode] = useState<'hosted' | 'selfhosted'>(store.openclawSubMode);
  const [formCopawSubMode, setFormCopawSubMode] = useState<'deploy' | 'selfhosted'>(store.copawSubMode);
  const [formCopawUrl, setFormCopawUrl] = useState(store.copawUrl);
  const [formCopawToken, setFormCopawToken] = useState(store.copawToken);
  const [formCopawDeployType, setFormCopawDeployType] = useState<'cloud' | 'local'>(store.copawDeployType);
  const [formCopawSelfhostedType, setFormCopawSelfhostedType] = useState<'remote' | 'local'>(store.copawSelfhostedType);
  const [formCopawDeployModelMode, setFormCopawDeployModelMode] = useState<'default' | 'custom'>(store.copawDeployModelMode);
  const [formCopawDeployProvider, setFormCopawDeployProvider] = useState(store.copawDeployProvider);
  const [formCopawDeployApiKey, setFormCopawDeployApiKey] = useState(store.copawDeployApiKey);
  const [formCopawDeployModel, setFormCopawDeployModel] = useState(store.copawDeployModel);
  const [formAgentSubMode, setFormAgentSubMode] = useState<'direct' | 'deploy'>(store.agentSubMode);
  const [formAgentId, setFormAgentId] = useState<'openclaw' | 'copaw' | 'custom'>(store.agentId);
  const [formAgentUrl, setFormAgentUrl] = useState(store.agentUrl);
  const [formAgentToken, setFormAgentToken] = useState(store.agentToken);
  const [formDirectTarget, setFormDirectTarget] = useState<'local' | 'remote'>(
    !store.agentUrl || store.agentUrl.includes('localhost') || store.agentUrl.includes('127.0.0.1') ? 'local' : 'remote'
  );
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      try {
        const uid = authStore.userId || '';
        const uk = (k: string) => userKey(uid, k);

        // Helper: migrate old global key to user-scoped key
        const migrate = async (key: string) => {
          if (!uid) return;
          const oldVal = await getSetting(key);
          const newVal = await getSetting(uk(key));
          if (oldVal && !newVal) {
            await setSetting(uk(key), oldVal);
            await setSetting(key, '');
          }
        };

        // Migrate all user-scoped keys
        const userScopedKeys = [
          'mode', 'provider', 'apiKey', 'openclawUrl', 'openclawToken',
          'serverUrl', 'selectedModel', 'openclawSubMode', 'hostedActivated',
          'copawSubMode', 'copawUrl', 'copawToken', 'builtinSubMode',
          'copawDeployType', 'copawSelfhostedType', 'copawDeployModelMode',
          'copawDeployProvider', 'copawDeployApiKey', 'copawDeployModel',
          'agentSubMode', 'agentId', 'agentUrl', 'agentToken',
        ];
        await Promise.all(userScopedKeys.map(migrate));

        const mode = await getSetting(uk('mode'));
        const provider = await getSetting(uk('provider'));
        const apiKey = await getSetting(uk('apiKey'));
        const openclawUrl = await getSetting(uk('openclawUrl'));
        const openclawToken = await getSetting(uk('openclawToken'));
        const serverUrl = await getSetting(uk('serverUrl'));
        const locale = await getSetting('locale'); // global — no userKey
        const selectedModel = await getSetting(uk('selectedModel'));
        const openclawSubMode = await getSetting(uk('openclawSubMode'));
        const hostedActivated = await getSetting(uk('hostedActivated'));
        const copawSubMode = await getSetting(uk('copawSubMode'));
        const copawUrl = await getSetting(uk('copawUrl'));
        const copawToken = await getSetting(uk('copawToken'));
        const builtinSubMode = await getSetting(uk('builtinSubMode'));
        const copawDeployType = await getSetting(uk('copawDeployType'));
        const copawSelfhostedType = await getSetting(uk('copawSelfhostedType'));
        const copawDeployModelMode = await getSetting(uk('copawDeployModelMode'));
        const copawDeployProvider = await getSetting(uk('copawDeployProvider'));
        const copawDeployApiKey = await getSetting(uk('copawDeployApiKey'));
        const copawDeployModel = await getSetting(uk('copawDeployModel'));
        const agentSubMode = await getSetting(uk('agentSubMode'));
        const agentId = await getSetting(uk('agentId'));
        const agentUrl = await getSetting(uk('agentUrl'));
        const agentToken = await getSetting(uk('agentToken'));

        // Migration: old 'byok' top-level mode → builtin + builtinSubMode='byok'
        if (mode === 'byok') {
          store.setMode('builtin'); setFormMode('builtin');
          store.setBuiltinSubMode('byok'); setFormBuiltinSubMode('byok');
          setSetting(uk('mode'), 'builtin');
          setSetting(uk('builtinSubMode'), 'byok');
        } else if (mode) {
          store.setMode(mode as ConnectionMode); setFormMode(mode as ConnectionMode);
        }
        if (builtinSubMode) {
          const bsm = builtinSubMode as 'free' | 'byok';
          store.setBuiltinSubMode(bsm); setFormBuiltinSubMode(bsm);
        }
        if (provider) { store.setProvider(provider as LLMProvider); setFormProvider(provider as LLMProvider); }
        if (apiKey) { store.setApiKey(apiKey); setFormApiKey(apiKey); }
        if (openclawUrl) { store.setOpenclawUrl(openclawUrl); setFormOpenclawUrl(openclawUrl); }
        if (openclawToken) { store.setOpenclawToken(openclawToken); setFormOpenclawToken(openclawToken); }
        if (copawSubMode) {
          // Migrate 'hosted' → 'deploy' (hosted mode removed)
          const csm = (copawSubMode === 'hosted' ? 'deploy' : copawSubMode) as 'deploy' | 'selfhosted';
          store.setCopawSubMode(csm);
          setFormCopawSubMode(csm);
        }
        if (copawUrl) { store.setCopawUrl(copawUrl); setFormCopawUrl(copawUrl); }
        if (copawToken) { store.setCopawToken(copawToken); setFormCopawToken(copawToken); }
        if (copawDeployType) {
          const v = copawDeployType as 'cloud' | 'local';
          store.setCopawDeployType(v); setFormCopawDeployType(v);
        }
        if (copawSelfhostedType) {
          const v = copawSelfhostedType as 'remote' | 'local';
          store.setCopawSelfhostedType(v); setFormCopawSelfhostedType(v);
        }
        if (copawDeployModelMode) {
          const v = copawDeployModelMode as 'default' | 'custom';
          store.setCopawDeployModelMode(v); setFormCopawDeployModelMode(v);
        }
        if (copawDeployProvider) { store.setCopawDeployProvider(copawDeployProvider); setFormCopawDeployProvider(copawDeployProvider); }
        if (copawDeployApiKey) { store.setCopawDeployApiKey(copawDeployApiKey); setFormCopawDeployApiKey(copawDeployApiKey); }
        if (copawDeployModel) { store.setCopawDeployModel(copawDeployModel); setFormCopawDeployModel(copawDeployModel); }
        if (agentSubMode) {
          const v = agentSubMode as 'direct' | 'deploy';
          store.setAgentSubMode(v); setFormAgentSubMode(v);
        }
        if (agentId) {
          const v = agentId as 'openclaw' | 'copaw' | 'custom';
          store.setAgentId(v); setFormAgentId(v);
        }
        if (agentUrl) { store.setAgentUrl(agentUrl); setFormAgentUrl(agentUrl); }
        if (agentToken) { store.setAgentToken(agentToken); setFormAgentToken(agentToken); }

        // Populate unified agent fields from legacy openclaw/copaw modes (without changing mode)
        // The runtime mode stays as 'openclaw' or 'copaw' for conversation isolation & skills routing.
        // Only the UI formMode is set to 'agent' for visual grouping.
        if (mode === 'openclaw') {
          setFormMode('agent'); // UI display only
          store.setAgentId('openclaw'); setFormAgentId('openclaw');
          store.setAgentSubMode('direct'); setFormAgentSubMode('direct');
          if (openclawUrl && !agentUrl) { store.setAgentUrl(openclawUrl); setFormAgentUrl(openclawUrl); }
          if (openclawToken && !agentToken) { store.setAgentToken(openclawToken); setFormAgentToken(openclawToken); }
        } else if (mode === 'copaw') {
          setFormMode('agent'); // UI display only
          store.setAgentId('copaw'); setFormAgentId('copaw');
          const csm = copawSubMode === 'deploy' ? 'deploy' : 'direct';
          store.setAgentSubMode(csm as 'direct' | 'deploy'); setFormAgentSubMode(csm as 'direct' | 'deploy');
          if (copawUrl && !agentUrl) { store.setAgentUrl(copawUrl); setFormAgentUrl(copawUrl); }
          if (copawToken && !agentToken) { store.setAgentToken(copawToken); setFormAgentToken(copawToken); }
        }
        if (serverUrl) { store.setServerUrl(serverUrl); }
        if (locale) { store.setLocale(locale); setFormLocale(locale); setI18nLocale(locale); }
        if (selectedModel) { store.setSelectedModel(selectedModel); setFormModel(selectedModel); }
        if (openclawSubMode) {
          const sm = openclawSubMode as 'hosted' | 'selfhosted';
          store.setOpenclawSubMode(sm);
          setFormSubMode(sm);
        }
        if (hostedActivated === 'true') { store.setHostedActivated(true); }

        // Always fetch hosted status from server for logged-in users
        // Read token directly from DB (not from Zustand closure) to avoid stale value
        const dbAuthToken = await getSetting('auth_token');
        const currentServerUrl = store.serverUrl || 'ws://43.155.104.45:3100/ws';
        if (dbAuthToken) {
          try {
            const status = await getHostedStatus(dbAuthToken, currentServerUrl);
            if (status.activated && status.account) {
              store.setHostedActivated(true);
              store.setHostedQuota(status.account.quotaUsed, status.account.quotaTotal);
              store.setHostedInstanceStatus(status.account.instanceStatus);
              await setSetting(uk('hostedActivated'), 'true');
            } else {
              // Server says not activated — clear local cached state
              store.setHostedActivated(false);
              store.setHostedInstanceStatus('pending');
              await setSetting(uk('hostedActivated'), '');
            }
          } catch { /* ignore */ }
        }
      } catch {
        // DB may not be ready
      }
    })();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll hosted status while instance is provisioning
  useEffect(() => {
    if (store.hostedActivated && store.hostedInstanceStatus === 'provisioning' && authStore.authToken) {
      pollRef.current = setInterval(async () => {
        try {
          const status = await getHostedStatus(authStore.authToken, store.serverUrl);
          if (status.activated && status.account) {
            store.setHostedInstanceStatus(status.account.instanceStatus);
            store.setHostedQuota(status.account.quotaUsed, status.account.quotaTotal);
            if (status.account.instanceStatus !== 'provisioning' && pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          } else {
            // Server says not activated — stop polling and clear state
            store.setHostedActivated(false);
            store.setHostedInstanceStatus('pending');
            setSetting(userKey(authStore.userId, 'hostedActivated'), '');
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          }
        } catch { /* ignore */ }
      }, 3000);
      return () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      };
    }
  }, [store.hostedActivated, store.hostedInstanceStatus, authStore.authToken, store.serverUrl, store]);

  const handleSave = useCallback(async () => {
    const uid = authStore.userId || '';
    const uk = (k: string) => userKey(uid, k);

    // Map formMode 'agent' back to actual runtime mode based on agentId
    const actualMode: ConnectionMode = formMode === 'agent'
      ? (formAgentId === 'openclaw' ? 'openclaw' : formAgentId === 'copaw' ? 'copaw' : 'agent')
      : formMode;

    // Update Zustand store
    store.setMode(actualMode);
    store.setBuiltinSubMode(formBuiltinSubMode);
    store.setProvider(formProvider);
    store.setApiKey(formApiKey);
    store.setOpenclawUrl(formOpenclawUrl);
    store.setOpenclawToken(formOpenclawToken);
    store.setCopawSubMode(formCopawSubMode);
    store.setCopawUrl(formCopawUrl);
    store.setCopawToken(formCopawToken);
    store.setCopawDeployType(formCopawDeployType);
    store.setCopawSelfhostedType(formCopawSelfhostedType);
    store.setCopawDeployModelMode(formCopawDeployModelMode);
    store.setCopawDeployProvider(formCopawDeployProvider);
    store.setCopawDeployApiKey(formCopawDeployApiKey);
    store.setCopawDeployModel(formCopawDeployModel);
    store.setAgentSubMode(formAgentSubMode);
    store.setAgentId(formAgentId);
    store.setAgentUrl(formAgentUrl);
    store.setAgentToken(formAgentToken);
    store.setLocale(formLocale);
    store.setSelectedModel(formModel);
    store.setOpenclawSubMode(formSubMode);
    setI18nLocale(formLocale);

    // Persist to SQLite
    try {
      await Promise.all([
        setSetting(uk('mode'), actualMode),
        setSetting(uk('builtinSubMode'), formBuiltinSubMode),
        setSetting(uk('provider'), formProvider),
        setSetting(uk('apiKey'), formApiKey),
        setSetting(uk('openclawUrl'), formOpenclawUrl),
        setSetting(uk('openclawToken'), formOpenclawToken),
        setSetting(uk('copawSubMode'), formCopawSubMode),
        setSetting(uk('copawUrl'), formCopawUrl),
        setSetting(uk('copawToken'), formCopawToken),
        setSetting(uk('copawDeployType'), formCopawDeployType),
        setSetting(uk('copawSelfhostedType'), formCopawSelfhostedType),
        setSetting(uk('copawDeployModelMode'), formCopawDeployModelMode),
        setSetting(uk('copawDeployProvider'), formCopawDeployProvider),
        setSetting(uk('copawDeployApiKey'), formCopawDeployApiKey),
        setSetting(uk('copawDeployModel'), formCopawDeployModel),
        setSetting(uk('agentSubMode'), formAgentSubMode),
        setSetting(uk('agentId'), formAgentId),
        setSetting(uk('agentUrl'), formAgentUrl),
        setSetting(uk('agentToken'), formAgentToken),
        setSetting('locale', formLocale), // global — no userKey
        setSetting(uk('selectedModel'), formModel),
        setSetting(uk('openclawSubMode'), formSubMode),
      ]);
    } catch {
      // ignore persistence errors
    }

    Alert.alert(t('settings.saved'));
  }, [formMode, formBuiltinSubMode, formProvider, formApiKey, formOpenclawUrl, formOpenclawToken, formCopawSubMode, formCopawUrl, formCopawToken, formCopawDeployType, formCopawSelfhostedType, formCopawDeployModelMode, formCopawDeployProvider, formCopawDeployApiKey, formCopawDeployModel, formAgentSubMode, formAgentId, formAgentUrl, formAgentToken, formLocale, formModel, formSubMode, store, authStore.userId, t]);

  const handleLogout = useCallback(() => {
    authStore.logout();
    router.replace('/login');
  }, [authStore, router]);

  const appVersion = Constants.expoConfig?.version || '0.1.0';

  // Determine the actual active mode (from store, not form)
  // openclaw/copaw map to the 'agent' visual group
  const displayMode = (store.mode === 'openclaw' || store.mode === 'copaw') ? 'agent' : store.mode;
  const activeModeInfo = MODES.find((m) => m.key === displayMode);
  const activeModeColor = MODE_COLORS[store.mode] || '#2d7d46';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Current active mode indicator */}
      <View style={[styles.currentModeBar, { borderColor: activeModeColor + '66' }]}>
        <View style={[styles.currentModeDot, { backgroundColor: activeModeColor }]} />
        <Text style={styles.currentModeLabel}>{t('settings.currentMode')}</Text>
        <Text style={[styles.currentModeValue, { color: activeModeColor }]}>
          {activeModeInfo ? t(activeModeInfo.titleKey) : store.mode}
          {store.mode === 'builtin' && store.builtinSubMode === 'byok' ? ` (${t('settings.builtinByok')})` : ''}
          {(store.mode === 'openclaw' || store.mode === 'copaw' || store.mode === 'agent') ? ` (${store.mode === 'openclaw' ? 'OpenClaw' : store.mode === 'copaw' ? 'CoPaw' : store.agentId})` : ''}
        </Text>
      </View>

      {/* Account info */}
      {authStore.isLoggedIn ? (
        <Text style={styles.loggedInText}>
          {t('settings.loggedInAs', { phone: authStore.phone })}
        </Text>
      ) : (
        <TouchableOpacity style={styles.loginPrompt} onPress={() => router.push('/login')}>
          <Text style={styles.loginPromptText}>{t('settings.loginOrRegister')}</Text>
        </TouchableOpacity>
      )}

      {/* Connection Mode */}
      <Text style={styles.sectionTitle}>{t('settings.connectionMode')}</Text>
      {MODES.map((m) => (
        <TouchableOpacity
          key={m.key}
          style={[styles.card, formMode === m.key && styles.cardSelected]}
          onPress={() => setFormMode(m.key)}
        >
          <View style={styles.cardRow}>
            <View style={[styles.radio, formMode === m.key && styles.radioSelected]}>
              {formMode === m.key && <View style={styles.radioDot} />}
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>{t(m.titleKey)}</Text>
              <Text style={styles.cardDesc}>{t(m.descKey)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {/* Builtin sub-mode: Free / BYOK */}
      {formMode === 'builtin' && (
        <View style={styles.subModeContainer}>
          <TouchableOpacity
            style={[styles.subModeCard, formBuiltinSubMode === 'free' && styles.subModeCardSelected]}
            onPress={() => setFormBuiltinSubMode('free')}
          >
            <View style={styles.cardRow}>
              <View style={[styles.subRadio, formBuiltinSubMode === 'free' && styles.radioSelected]}>
                {formBuiltinSubMode === 'free' && <View style={styles.subRadioDot} />}
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.subModeTitle}>{t('settings.builtinFree')}</Text>
                <Text style={styles.cardDesc}>{t('settings.builtinDesc')}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Free mode: model selection */}
          {formBuiltinSubMode === 'free' && (
            <View style={{ marginLeft: 26, marginBottom: 8 }}>
              <Dropdown
                label={t('settings.model')}
                options={MODELS}
                value={formModel}
                onChange={setFormModel}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.subModeCard, formBuiltinSubMode === 'byok' && styles.subModeCardSelected]}
            onPress={() => setFormBuiltinSubMode('byok')}
          >
            <View style={styles.cardRow}>
              <View style={[styles.subRadio, formBuiltinSubMode === 'byok' && styles.radioSelected]}>
                {formBuiltinSubMode === 'byok' && <View style={styles.subRadioDot} />}
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.subModeTitle}>{t('settings.builtinByok')}</Text>
                <Text style={styles.cardDesc}>{t('settings.byokDesc')}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* BYOK mode: provider + API key */}
          {formBuiltinSubMode === 'byok' && (
            <View style={{ marginLeft: 26, marginBottom: 8 }}>
              <Dropdown
                label={t('settings.provider')}
                options={PROVIDERS}
                value={formProvider}
                onChange={setFormProvider}
              />
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('settings.apiKey')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={formApiKey}
                  onChangeText={setFormApiKey}
                  placeholder={t('settings.apiKeyPlaceholder')}
                  placeholderTextColor="#888888"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}
        </View>
      )}

      {/* Agent unified mode options */}
      {formMode === 'agent' && (
        <View style={styles.subModeContainer}>
          {/* Sub-mode: Direct / Deploy */}
          <View style={styles.providerRow}>
            <TouchableOpacity
              style={[styles.providerChip, formAgentSubMode === 'direct' && styles.providerChipSelected]}
              onPress={() => setFormAgentSubMode('direct')}
            >
              <Text style={[styles.providerChipText, formAgentSubMode === 'direct' && styles.providerChipTextSelected]}>
                {t('settings.agentDirect')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.providerChip, formAgentSubMode === 'deploy' && styles.providerChipSelected]}
              onPress={() => setFormAgentSubMode('deploy')}
            >
              <Text style={[styles.providerChipText, formAgentSubMode === 'deploy' && styles.providerChipTextSelected]}>
                {t('settings.agentDeploy')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Direct sub-mode: Agent selection + config */}
          {formAgentSubMode === 'direct' && (
            <>
              {/* Agent card selection */}
              <Text style={styles.fieldLabel}>{t('settings.agentSelectAgent')}</Text>
              <View style={styles.providerRow}>
                <TouchableOpacity
                  style={[styles.providerChip, formAgentId === 'openclaw' && styles.providerChipSelected]}
                  onPress={() => setFormAgentId('openclaw')}
                >
                  <Text style={[styles.providerChipText, formAgentId === 'openclaw' && styles.providerChipTextSelected]}>
                    {t('settings.agentOpenClaw')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.providerChip, formAgentId === 'copaw' && styles.providerChipSelected]}
                  onPress={() => setFormAgentId('copaw')}
                >
                  <Text style={[styles.providerChipText, formAgentId === 'copaw' && styles.providerChipTextSelected]}>
                    {t('settings.agentCoPaw')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.providerChip, formAgentId === 'custom' && styles.providerChipSelected]}
                  onPress={() => setFormAgentId('custom')}
                >
                  <Text style={[styles.providerChipText, formAgentId === 'custom' && styles.providerChipTextSelected]}>
                    {t('settings.agentCustom')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Custom: coming soon */}
              {formAgentId === 'custom' ? (
                <View style={{ marginTop: 8, marginBottom: 8 }}>
                  <Text style={styles.disabledHint}>{t('settings.agentCustomComingSoon')}</Text>
                </View>
              ) : (
                <>
                  {/* Direct target: local computer vs remote server */}
                  <View style={[styles.providerRow, { marginTop: 8 }]}>
                    <TouchableOpacity
                      style={[styles.providerChip, formDirectTarget === 'local' && styles.providerChipSelected]}
                      onPress={() => setFormDirectTarget('local')}
                    >
                      <Text style={[styles.providerChipText, formDirectTarget === 'local' && styles.providerChipTextSelected]}>
                        {t('settings.directLocalComputer')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.providerChip, formDirectTarget === 'remote' && styles.providerChipSelected]}
                      onPress={() => setFormDirectTarget('remote')}
                    >
                      <Text style={[styles.providerChipText, formDirectTarget === 'remote' && styles.providerChipTextSelected]}>
                        {t('settings.directRemoteServer')}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {formDirectTarget === 'local' ? (
                    <View style={{ marginTop: 8, marginBottom: 8, padding: 12, backgroundColor: '#1a1a2e', borderRadius: 8 }}>
                      <Text style={[styles.fieldHint, { color: '#aaa', fontSize: 14, lineHeight: 20 }]}>
                        {t('settings.directLocalMobileHint')}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>
                          {formAgentId === 'openclaw' ? 'WebSocket URL' : 'HTTP URL'}
                        </Text>
                        <TextInput
                          style={styles.textInput}
                          value={formAgentUrl}
                          onChangeText={setFormAgentUrl}
                          placeholder={formAgentId === 'openclaw' ? t('settings.agentOpenClawUrlPlaceholder') : t('settings.agentCoPawUrlPlaceholder')}
                          placeholderTextColor="#888888"
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="url"
                        />
                      </View>
                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>
                          Token {formAgentId === 'openclaw' ? '' : `(${t('settings.optional')})`}
                        </Text>
                        <TextInput
                          style={styles.textInput}
                          value={formAgentToken}
                          onChangeText={setFormAgentToken}
                          placeholder={t('settings.accessTokenPlaceholder')}
                          placeholderTextColor="#888888"
                          secureTextEntry
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* Deploy sub-mode: hint to use desktop */}
          {formAgentSubMode === 'deploy' && (
            <View style={{ marginTop: 4, marginBottom: 8 }}>
              <Text style={styles.fieldHint}>{t('settings.agentDeployDesc')}</Text>
            </View>
          )}
        </View>
      )}

      {/* (BYOK fields now nested under Builtin sub-mode above) */}

      {/* Language */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('settings.language')}</Text>
      <View style={styles.providerRow}>
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang.key}
            style={[styles.providerChip, formLocale === lang.key && styles.providerChipSelected]}
            onPress={() => setFormLocale(lang.key)}
          >
            <Text
              style={[
                styles.providerChipText,
                formLocale === lang.key && styles.providerChipTextSelected,
              ]}
            >
              {lang.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save Button */}
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>{t('settings.save')}</Text>
      </TouchableOpacity>

      {/* About */}
      <View style={styles.aboutSection}>
        <Text style={styles.aboutTitle}>{t('settings.about')}</Text>
        <Text style={styles.aboutText}>{t('settings.version')}: {appVersion}</Text>
      </View>

      {/* Logout Button */}
      {authStore.isLoggedIn && (
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: '#6c63ff',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#888888',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: {
    borderColor: '#6c63ff',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6c63ff',
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cardDesc: {
    color: '#888888',
    fontSize: 13,
    marginTop: 2,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 15,
  },
  fieldHint: {
    color: '#666666',
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  dropdown: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dropdownText: {
    color: '#ffffff',
    fontSize: 15,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  dropdownMenu: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  dropdownItemSelected: {
    backgroundColor: '#252540',
  },
  dropdownItemText: {
    color: '#cccccc',
    fontSize: 15,
  },
  dropdownItemTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  providerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  providerChip: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  providerChipSelected: {
    borderColor: '#6c63ff',
    backgroundColor: '#252540',
  },
  providerChipText: {
    color: '#888888',
    fontSize: 14,
  },
  providerChipTextSelected: {
    color: '#ffffff',
  },
  saveButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  aboutSection: {
    marginTop: 32,
    alignItems: 'center',
  },
  aboutTitle: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
  },
  aboutText: {
    color: '#666666',
    fontSize: 13,
    marginTop: 4,
  },
  loggedInText: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  loginPrompt: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  loginPromptText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  logoutButton: {
    borderWidth: 1.5,
    borderColor: '#ff4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '700',
  },
  currentModeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 8,
  },
  currentModeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  currentModeLabel: {
    color: '#888',
    fontSize: 13,
  },
  currentModeValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  subModeContainer: {
    marginLeft: 16,
    marginTop: 4,
  },
  subModeCard: {
    backgroundColor: '#151528',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subModeCardSelected: {
    borderColor: '#6c63ff',
  },
  subRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#888888',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  subRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6c63ff',
  },
  subModeTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  subModeDetails: {
    marginLeft: 26,
    marginBottom: 8,
  },
  hostedLoginHint: {
    color: '#6c63ff',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  hostedQuotaBadge: {
    color: '#4caf50',
    fontSize: 13,
    fontWeight: '600',
  },
  hostedProvisioningBadge: {
    color: '#ff9800',
    fontSize: 13,
    fontWeight: '600',
  },
  hostedErrorBadge: {
    color: '#ff4444',
    fontSize: 13,
    fontWeight: '600',
  },
  activateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activateButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  activateButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledHint: {
    color: '#666666',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 26,
  },
});
