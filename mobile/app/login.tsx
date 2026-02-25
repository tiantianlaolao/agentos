import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTranslation } from '../src/i18n';

type TabMode = 'login' | 'register';

export default function LoginScreen() {
  const t = useTranslation();
  const authStore = useAuthStore();
  const serverUrl = useSettingsStore((s) => s.serverUrl);

  const [tab, setTab] = useState<TabMode>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const validatePhone = (value: string): boolean => {
    return /^1\d{10}$/.test(value);
  };

  const handleSendCode = useCallback(async () => {
    setError('');
    if (!phone.trim()) {
      setError(t('login.phoneRequired'));
      return;
    }
    if (!validatePhone(phone.trim())) {
      setError(t('login.invalidPhone'));
      return;
    }

    setCountdown(60);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await fetch(`${baseUrl}/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || 'Failed to send code');
      }
    } catch {
      setError('Network error');
    }
  }, [phone, baseUrl, t]);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!phone.trim()) {
      setError(t('login.phoneRequired'));
      return;
    }
    if (!validatePhone(phone.trim())) {
      setError(t('login.invalidPhone'));
      return;
    }

    setLoading(true);
    try {
      const endpoint = tab === 'register' ? '/auth/register' : '/auth/login';
      const body: Record<string, string> = { phone: phone.trim(), password };
      if (tab === 'register') {
        body.code = code;
      }

      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();

      if (!result.ok) {
        setError(result.error || result.message || 'Request failed');
        setLoading(false);
        return;
      }

      authStore.login(result.data.userId, phone.trim(), result.data.token);
      router.replace('/(tabs)');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [tab, phone, password, code, baseUrl, authStore, t]);

  const handleSkip = useCallback(() => {
    authStore.skipLogin();
    router.replace('/(tabs)');
  }, [authStore]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('login.title')}</Text>
        </View>

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'login' && styles.tabActive]}
            onPress={() => { setTab('login'); setError(''); }}
          >
            <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>
              {t('login.loginTab')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'register' && styles.tabActive]}
            onPress={() => { setTab('register'); setError(''); }}
          >
            <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>
              {t('login.registerTab')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Phone input */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>{t('login.phone')}</Text>
          <TextInput
            style={styles.textInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="13800138000"
            placeholderTextColor="#555555"
            keyboardType="phone-pad"
            maxLength={11}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Password input */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>{t('login.password')}</Text>
          <TextInput
            style={styles.textInput}
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            placeholderTextColor="#555555"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Verification code (register only) */}
        {tab === 'register' && (
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('login.code')}</Text>
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.textInput, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor="#555555"
                keyboardType="number-pad"
                maxLength={6}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.codeButton, countdown > 0 && styles.codeButtonDisabled]}
                onPress={handleSendCode}
                disabled={countdown > 0}
              >
                <Text style={styles.codeButtonText}>
                  {countdown > 0
                    ? t('login.resendIn', { seconds: countdown })
                    : t('login.sendCode')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Error message */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {tab === 'register' ? t('login.register') : t('login.submit')}
            </Text>
          )}
        </TouchableOpacity>

        {/* Skip login */}
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>{t('login.skip')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#6c63ff',
  },
  tabText: {
    color: '#888888',
    fontSize: 15,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  fieldContainer: {
    marginBottom: 18,
  },
  fieldLabel: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#ffffff',
    fontSize: 15,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeInput: {
    flex: 1,
  },
  codeButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minWidth: 110,
    alignItems: 'center',
  },
  codeButtonDisabled: {
    backgroundColor: '#3a3a5e',
  },
  codeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 13,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  submitButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 8,
  },
  skipText: {
    color: '#888888',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
