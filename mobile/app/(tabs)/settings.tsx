import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useTranslation, setLocale as setI18nLocale } from '../../src/i18n';
import { getSetting, setSetting } from '../../src/services/storage';
import type { ConnectionMode, LLMProvider } from '../../src/types/protocol';
import Constants from 'expo-constants';

const MODES: { key: ConnectionMode; titleKey: string; descKey: string }[] = [
  { key: 'builtin', titleKey: 'settings.builtin', descKey: 'settings.builtinDesc' },
  { key: 'openclaw', titleKey: 'settings.openclaw', descKey: 'settings.openclawDesc' },
  { key: 'byok', titleKey: 'settings.byok', descKey: 'settings.byokDesc' },
];

const PROVIDERS: { key: LLMProvider; label: string }[] = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
];

const LANGUAGES = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
];

export default function SettingsScreen() {
  const t = useTranslation();
  const store = useSettingsStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Local form state
  const [formMode, setFormMode] = useState<ConnectionMode>(store.mode);
  const [formProvider, setFormProvider] = useState<LLMProvider>(store.provider);
  const [formApiKey, setFormApiKey] = useState(store.apiKey);
  const [formOpenclawUrl, setFormOpenclawUrl] = useState(store.openclawUrl);
  const [formServerUrl, setFormServerUrl] = useState(store.serverUrl);
  const [formLocale, setFormLocale] = useState(store.locale);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      try {
        const mode = await getSetting('mode');
        const provider = await getSetting('provider');
        const apiKey = await getSetting('apiKey');
        const openclawUrl = await getSetting('openclawUrl');
        const serverUrl = await getSetting('serverUrl');
        const locale = await getSetting('locale');

        if (mode) { store.setMode(mode as ConnectionMode); setFormMode(mode as ConnectionMode); }
        if (provider) { store.setProvider(provider as LLMProvider); setFormProvider(provider as LLMProvider); }
        if (apiKey) { store.setApiKey(apiKey); setFormApiKey(apiKey); }
        if (openclawUrl) { store.setOpenclawUrl(openclawUrl); setFormOpenclawUrl(openclawUrl); }
        if (serverUrl) { store.setServerUrl(serverUrl); setFormServerUrl(serverUrl); }
        if (locale) { store.setLocale(locale); setFormLocale(locale); setI18nLocale(locale); }
      } catch {
        // DB may not be ready
      }
    })();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async () => {
    // Update Zustand store
    store.setMode(formMode);
    store.setProvider(formProvider);
    store.setApiKey(formApiKey);
    store.setOpenclawUrl(formOpenclawUrl);
    store.setServerUrl(formServerUrl);
    store.setLocale(formLocale);
    setI18nLocale(formLocale);

    // Persist to SQLite
    try {
      await Promise.all([
        setSetting('mode', formMode),
        setSetting('provider', formProvider),
        setSetting('apiKey', formApiKey),
        setSetting('openclawUrl', formOpenclawUrl),
        setSetting('serverUrl', formServerUrl),
        setSetting('locale', formLocale),
      ]);
    } catch {
      // ignore persistence errors
    }

    Alert.alert(t('settings.saved'));
  }, [formMode, formProvider, formApiKey, formOpenclawUrl, formServerUrl, formLocale, store, t]);

  const appVersion = Constants.expoConfig?.version || '0.1.0';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {/* OpenClaw URL - shown when mode is openclaw */}
      {formMode === 'openclaw' && (
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
          />
        </View>
      )}

      {/* BYOK fields - shown when mode is byok */}
      {formMode === 'byok' && (
        <>
          <Text style={styles.fieldLabel}>{t('settings.provider')}</Text>
          <View style={styles.providerRow}>
            {PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.providerChip, formProvider === p.key && styles.providerChipSelected]}
                onPress={() => setFormProvider(p.key)}
              >
                <Text
                  style={[
                    styles.providerChipText,
                    formProvider === p.key && styles.providerChipTextSelected,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

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
        </>
      )}

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

      {/* Advanced - Server URL */}
      <TouchableOpacity
        style={styles.advancedToggle}
        onPress={() => setShowAdvanced(!showAdvanced)}
      >
        <Text style={styles.advancedToggleText}>Advanced</Text>
        <Ionicons
          name={showAdvanced ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#888888"
        />
      </TouchableOpacity>

      {showAdvanced && (
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Server URL</Text>
          <TextInput
            style={styles.textInput}
            value={formServerUrl}
            onChangeText={setFormServerUrl}
            placeholder="ws://host:port/ws"
            placeholderTextColor="#888888"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {/* Save Button */}
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>{t('settings.save')}</Text>
      </TouchableOpacity>

      {/* About */}
      <View style={styles.aboutSection}>
        <Text style={styles.aboutTitle}>{t('settings.about')}</Text>
        <Text style={styles.aboutText}>{t('settings.version')}: {appVersion}</Text>
      </View>
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
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: 8,
  },
  advancedToggleText: {
    color: '#888888',
    fontSize: 14,
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
});
