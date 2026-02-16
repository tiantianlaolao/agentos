import { Tabs } from 'expo-router';
import { useTranslation } from '../../src/i18n';

export default function TabLayout() {
  const t = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#ffffff',
        tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#2d2d44' },
        tabBarActiveTintColor: '#6c63ff',
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.chat'),
          tabBarLabel: t('tabs.chat'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarLabel: t('tabs.settings'),
        }}
      />
    </Tabs>
  );
}
