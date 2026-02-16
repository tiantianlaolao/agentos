import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { initI18n } from '../src/i18n';
import { initDatabase } from '../src/services/storage';

export default function RootLayout() {
  useEffect(() => {
    initI18n();
    initDatabase().catch((err) => {
      console.error('[DB] Failed to initialize database:', err);
    });
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
