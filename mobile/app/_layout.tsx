import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { initI18n } from '../src/i18n';
import { initDatabase, getSetting, setSetting } from '../src/services/storage';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useAuthStore } from '../src/stores/authStore';
import { getHostedStatus } from '../src/services/hostedApi';
import type { ConnectionMode, LLMProvider } from '../src/types/protocol';

export default function RootLayout() {
  const store = useSettingsStore();
  const authStore = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    initI18n();
    initDatabase()
      .then(async () => {
        // Load persisted settings into store before any screen mounts
        const [mode, provider, apiKey, serverUrl, locale, selectedModel, openclawUrl, openclawToken, openclawSubMode, hostedActivated] = await Promise.all([
          getSetting('mode'),
          getSetting('provider'),
          getSetting('apiKey'),
          getSetting('serverUrl'),
          getSetting('locale'),
          getSetting('selectedModel'),
          getSetting('openclawUrl'),
          getSetting('openclawToken'),
          getSetting('openclawSubMode'),
          getSetting('hostedActivated'),
        ]);
        if (mode) store.setMode(mode as ConnectionMode);
        if (provider) store.setProvider(provider as LLMProvider);
        if (apiKey) store.setApiKey(apiKey);
        if (serverUrl) {
          // Migrate old server URL to new CVM
          const migratedUrl = serverUrl.replace('150.109.157.27', '43.154.188.177');
          if (migratedUrl !== serverUrl) {
            await setSetting('serverUrl', migratedUrl);
          }
          store.setServerUrl(migratedUrl);
        }
        if (locale) store.setLocale(locale);
        if (selectedModel) store.setSelectedModel(selectedModel);
        if (openclawUrl) store.setOpenclawUrl(openclawUrl);
        if (openclawToken) store.setOpenclawToken(openclawToken);
        if (openclawSubMode) store.setOpenclawSubMode(openclawSubMode as 'hosted' | 'selfhosted');
        if (hostedActivated === 'true') store.setHostedActivated(true);
        store.setSettingsLoaded(true);

        // Load auth state, then sync hosted status from server
        await authStore.loadAuth();
        const { authToken, isLoggedIn } = useAuthStore.getState();
        if (isLoggedIn && authToken) {
          try {
            const status = await getHostedStatus(authToken, store.serverUrl);
            if (status.activated && status.account) {
              store.setHostedActivated(true);
              store.setHostedQuota(status.account.quotaUsed, status.account.quotaTotal);
              store.setHostedInstanceStatus(status.account.instanceStatus);
              await setSetting('hostedActivated', 'true');
            } else {
              store.setHostedActivated(false);
              store.setHostedInstanceStatus('pending');
              await setSetting('hostedActivated', '');
            }
          } catch {
            // Network error — keep local cached value
          }
        }
      })
      .catch((err) => {
        console.error('[DB] Failed to initialize database:', err);
      });
  }, []);

  // Auth gate: redirect to login if not authenticated
  useEffect(() => {
    if (!authStore.authLoaded || !store.settingsLoaded) return;

    const inLoginPage = segments[0] === 'login';
    const needsAuth = !authStore.isLoggedIn && !authStore.loginSkipped;

    if (needsAuth && !inLoginPage) {
      router.replace('/login');
    } else if (authStore.isLoggedIn && inLoginPage) {
      router.replace('/(tabs)');
    }
  }, [authStore.authLoaded, authStore.isLoggedIn, authStore.loginSkipped, store.settingsLoaded, segments, router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
      </Stack>
    </>
  );
}
