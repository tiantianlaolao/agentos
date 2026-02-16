import { View, Text, StyleSheet } from 'react-native';

/**
 * Chat screen - main screen of the app.
 * TODO: Implement in Step 1 (frontend agent):
 * - Message list with FlatList
 * - Input box with send button
 * - Markdown rendering
 * - Streaming response display
 * - Skill invocation cards
 */
export default function ChatScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>AgentOS Chat</Text>
      <Text style={styles.hint}>Chat UI will be built here</Text>
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
