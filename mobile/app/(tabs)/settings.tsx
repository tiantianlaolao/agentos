import { View, Text, StyleSheet } from 'react-native';

/**
 * Settings screen.
 * TODO: Implement in Step 1 (frontend agent):
 * - Connection mode selector (builtin/openclaw/byok)
 * - OpenClaw WebSocket URL input
 * - BYOK: Provider selector + API key input
 * - Language selector
 * - About section
 */
export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Settings</Text>
      <Text style={styles.hint}>Settings UI will be built here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    color: '#6c63ff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  hint: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
});
