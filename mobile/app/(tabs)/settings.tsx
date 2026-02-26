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
import { getSetting, setSetting } from '../../src/services/storage';
import { activateHostedAccess, getHostedStatus } from '../../src/services/hostedApi';
import type { ConnectionMode, LLMProvider } from '../../src/types/protocol';
import Constants from 'expo-constants';

const MODES: { key: ConnectionMode; titleKey: string; descKey: string }[] = [
  { key: 'builtin', titleKey: 'settings.builtin', descKey: 'settings.builtinDesc' },
  { key: 'openclaw', titleKey: 'settings.openclaw', descKey: 'settings.openclawDesc' },
  { key: 'copaw', titleKey: 'settings.copaw', descKey: 'settings.copawDesc' },
];

const MODE_COLORS: Record<string, string> = {
  builtin: '#2d7d46',
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
  { key: 'moonshot', label: 'Kimi' },
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
  const [formMode, setFormMode] = useState<ConnectionMode>(store.mode);
  const [formBuiltinSubMode, setFormBuiltinSubMode] = useState<'free' | 'byok'>(store.builtinSubMode);
  const [formProvider, setFormProvider] = useState<LLMProvider>(store.provider);
  const [formApiKey, setFormApiKey] = useState(store.apiKey);
  const [formOpenclawUrl, setFormOpenclawUrl] = useState(store.openclawUrl);
  const [formOpenclawToken, setFormOpenclawToken] = useState(store.openclawToken);
  const [formLocale, setFormLocale] = useState(store.locale);
  const [formModel, setFormModel] = useState(store.selectedModel);
  const [formSubMode, setFormSubMode] = useState<'hosted' | 'selfhosted'>(store.openclawSubMode);
  const [formCopawSubMode, setFormCopawSubMode] = useState<'hosted' | 'selfhosted'>(store.copawSubMode);
  const [formCopawUrl, setFormCopawUrl] = useState(store.copawUrl);
  const [formCopawToken, setFormCopawToken] = useState(store.copawToken);
  const [invitationCode, setInvitationCode] = useState('');
  const [activating, setActivating] = useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      try {
        const mode = await getSetting('mode');
        const provider = await getSetting('provider');
        const apiKey = await getSetting('apiKey');
        const openclawUrl = await getSetting('openclawUrl');
        const openclawToken = await getSetting('openclawToken');
        const serverUrl = await getSetting('serverUrl');
        const locale = await getSetting('locale');
        const selectedModel = await getSetting('selectedModel');
        const openclawSubMode = await getSetting('openclawSubMode');
        const hostedActivated = await getSetting('hostedActivated');
        const copawSubMode = await getSetting('copawSubMode');
        const copawUrl = await getSetting('copawUrl');
        const copawToken = await getSetting('copawToken');
        const builtinSubMode = await getSetting('builtinSubMode');

        // Migration: old 'byok' top-level mode → builtin + builtinSubMode='byok'
        if (mode === 'byok') {
          store.setMode('builtin'); setFormMode('builtin');
          store.setBuiltinSubMode('byok'); setFormBuiltinSubMode('byok');
          setSetting('mode', 'builtin');
          setSetting('builtinSubMode', 'byok');
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
          const csm = copawSubMode as 'hosted' | 'selfhosted';
          store.setCopawSubMode(csm);
          setFormCopawSubMode(csm);
        }
        if (copawUrl) { store.setCopawUrl(copawUrl); setFormCopawUrl(copawUrl); }
        if (copawToken) { store.setCopawToken(copawToken); setFormCopawToken(copawToken); }
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
        const currentServerUrl = store.serverUrl || 'ws://43.154.188.177:3100/ws';
        if (dbAuthToken) {
          try {
            const status = await getHostedStatus(dbAuthToken, currentServerUrl);
            if (status.activated && status.account) {
              store.setHostedActivated(true);
              store.setHostedQuota(status.account.quotaUsed, status.account.quotaTotal);
              store.setHostedInstanceStatus(status.account.instanceStatus);
              await setSetting('hostedActivated', 'true');
            } else {
              // Server says not activated — clear local cached state
              store.setHostedActivated(false);
              store.setHostedInstanceStatus('pending');
              await setSetting('hostedActivated', '');
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
            setSetting('hostedActivated', '');
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
    // Update Zustand store
    store.setMode(formMode);
    store.setBuiltinSubMode(formBuiltinSubMode);
    store.setProvider(formProvider);
    store.setApiKey(formApiKey);
    store.setOpenclawUrl(formOpenclawUrl);
    store.setOpenclawToken(formOpenclawToken);
    store.setCopawSubMode(formCopawSubMode);
    store.setCopawUrl(formCopawUrl);
    store.setCopawToken(formCopawToken);
    store.setLocale(formLocale);
    store.setSelectedModel(formModel);
    store.setOpenclawSubMode(formSubMode);
    setI18nLocale(formLocale);

    // Persist to SQLite
    try {
      await Promise.all([
        setSetting('mode', formMode),
        setSetting('builtinSubMode', formBuiltinSubMode),
        setSetting('provider', formProvider),
        setSetting('apiKey', formApiKey),
        setSetting('openclawUrl', formOpenclawUrl),
        setSetting('openclawToken', formOpenclawToken),
        setSetting('copawSubMode', formCopawSubMode),
        setSetting('copawUrl', formCopawUrl),
        setSetting('copawToken', formCopawToken),
        setSetting('locale', formLocale),
        setSetting('selectedModel', formModel),
        setSetting('openclawSubMode', formSubMode),
      ]);
    } catch {
      // ignore persistence errors
    }

    Alert.alert(t('settings.saved'));
  }, [formMode, formBuiltinSubMode, formProvider, formApiKey, formOpenclawUrl, formOpenclawToken, formCopawSubMode, formCopawUrl, formCopawToken, formLocale, formModel, formSubMode, store, t]);

  const handleLogout = useCallback(() => {
    authStore.logout();
    router.replace('/login');
  }, [authStore, router]);

  const appVersion = Constants.expoConfig?.version || '0.1.0';

  // Determine the actual active mode (from store, not form)
  const activeModeInfo = MODES.find((m) => m.key === store.mode);
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

      {/* OpenClaw sub-mode options */}
      {formMode === 'openclaw' && (
        <View style={styles.subModeContainer}>
          {/* Hosted sub-option */}
          <TouchableOpacity
            style={[styles.subModeCard, formSubMode === 'hosted' && styles.subModeCardSelected]}
            onPress={() => setFormSubMode('hosted')}
          >
            <View style={styles.cardRow}>
              <View style={[styles.subRadio, formSubMode === 'hosted' && styles.radioSelected]}>
                {formSubMode === 'hosted' && <View style={styles.subRadioDot} />}
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.subModeTitle}>{t('settings.openclawHosted')}</Text>
                <Text style={styles.cardDesc}>{t('settings.openclawHostedDesc')}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Hosted mode details */}
          {formSubMode === 'hosted' && (
            <View style={styles.subModeDetails}>
              {!authStore.isLoggedIn ? (
                <TouchableOpacity onPress={() => router.push('/login')}>
                  <Text style={styles.hostedLoginHint}>{t('settings.hostedLoginRequired')}</Text>
                </TouchableOpacity>
              ) : store.hostedActivated ? (
                <View>
                  {store.hostedInstanceStatus === 'provisioning' && (
                    <Text style={styles.hostedProvisioningBadge}>{t('settings.hostedProvisioning')}</Text>
                  )}
                  {store.hostedInstanceStatus === 'error' && (
                    <Text style={styles.hostedErrorBadge}>{t('settings.hostedError')}</Text>
                  )}
                  {store.hostedInstanceStatus === 'ready' && (
                    <Text style={styles.hostedQuotaBadge}>
                      {t('settings.hostedQuota', { used: String(store.hostedQuotaUsed), total: String(store.hostedQuotaTotal) })}
                    </Text>
                  )}
                  {store.hostedInstanceStatus !== 'provisioning' && store.hostedInstanceStatus !== 'error' && store.hostedInstanceStatus !== 'ready' && (
                    <Text style={styles.hostedProvisioningBadge}>{t('settings.hostedProvisioning')}</Text>
                  )}
                </View>
              ) : (
                <View style={styles.activateRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1, marginRight: 10 }]}
                    value={invitationCode}
                    onChangeText={setInvitationCode}
                    placeholder={t('settings.hostedInvitationCodePlaceholder')}
                    placeholderTextColor="#888888"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[styles.activateButton, activating && { opacity: 0.5 }]}
                    disabled={activating || !invitationCode.trim()}
                    onPress={async () => {
                      setActivating(true);
                      try {
                        const res = await activateHostedAccess(invitationCode.trim(), authStore.authToken, store.serverUrl);
                        if (res.success) {
                          store.setHostedActivated(true);
                          store.setHostedInstanceStatus(res.account?.instanceStatus || 'provisioning');
                          if (res.account) store.setHostedQuota(res.account.quotaUsed, res.account.quotaTotal);
                          await setSetting('hostedActivated', 'true');
                          Alert.alert(t('settings.hostedActivated'));
                        } else {
                          Alert.alert(t('settings.hostedActivateFailed'), res.error || '');
                        }
                      } catch {
                        Alert.alert(t('settings.hostedActivateFailed'));
                      } finally {
                        setActivating(false);
                      }
                    }}
                  >
                    <Text style={styles.activateButtonText}>{t('settings.hostedActivate')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Self-hosted sub-option */}
          <TouchableOpacity
            style={[styles.subModeCard, formSubMode === 'selfhosted' && styles.subModeCardSelected]}
            onPress={() => setFormSubMode('selfhosted')}
          >
            <View style={styles.cardRow}>
              <View style={[styles.subRadio, formSubMode === 'selfhosted' && styles.radioSelected]}>
                {formSubMode === 'selfhosted' && <View style={styles.subRadioDot} />}
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.subModeTitle}>{t('settings.openclawSelfhosted')}</Text>
                <Text style={styles.cardDesc}>{t('settings.openclawSelfhostedDesc')}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Self-hosted fields */}
          {formSubMode === 'selfhosted' && (
            <>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('settings.openclawUrl')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={formOpenclawUrl}
                  onChangeText={setFormOpenclawUrl}
                  placeholder={t('settings.openclawUrlPlaceholder')}
                  placeholderTextColor="#888888"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={styles.fieldHint}>{t('settings.openclawUrlHint')}</Text>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('settings.openclawToken')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={formOpenclawToken}
                  onChangeText={setFormOpenclawToken}
                  placeholder={t('settings.openclawTokenPlaceholder')}
                  placeholderTextColor="#888888"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.fieldHint}>{t('settings.openclawTokenHint')}</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* CoPaw sub-mode options */}
      {formMode === 'copaw' && (
        <View style={styles.subModeContainer}>
          {/* Hosted sub-option */}
          <TouchableOpacity
            style={[styles.subModeCard, formCopawSubMode === 'hosted' && styles.subModeCardSelected]}
            onPress={() => setFormCopawSubMode('hosted')}
          >
            <View style={styles.cardRow}>
              <View style={[styles.subRadio, formCopawSubMode === 'hosted' && styles.radioSelected]}>
                {formCopawSubMode === 'hosted' && <View style={styles.subRadioDot} />}
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.subModeTitle}>{t('settings.copawHosted')}</Text>
                <Text style={styles.cardDesc}>{t('settings.copawHostedDesc')}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Self-hosted sub-option */}
          <TouchableOpacity
            style={[styles.subModeCard, formCopawSubMode === 'selfhosted' && styles.subModeCardSelected]}
            onPress={() => setFormCopawSubMode('selfhosted')}
          >
            <View style={styles.cardRow}>
              <View style={[styles.subRadio, formCopawSubMode === 'selfhosted' && styles.radioSelected]}>
                {formCopawSubMode === 'selfhosted' && <View style={styles.subRadioDot} />}
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.subModeTitle}>{t('settings.copawSelfhosted')}</Text>
                <Text style={styles.cardDesc}>{t('settings.copawSelfhostedDesc')}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Self-hosted fields */}
          {formCopawSubMode === 'selfhosted' && (
            <>
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('settings.copawUrl')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={formCopawUrl}
                  onChangeText={setFormCopawUrl}
                  placeholder={t('settings.copawUrlPlaceholder')}
                  placeholderTextColor="#888888"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={styles.fieldHint}>{t('settings.copawUrlHint')}</Text>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{t('settings.copawToken')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={formCopawToken}
                  onChangeText={setFormCopawToken}
                  placeholder={t('settings.copawTokenPlaceholder')}
                  placeholderTextColor="#888888"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.fieldHint}>{t('settings.copawTokenHint')}</Text>
              </View>
            </>
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
});
