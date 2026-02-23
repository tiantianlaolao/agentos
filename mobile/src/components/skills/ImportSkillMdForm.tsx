/**
 * ImportSkillMdForm — Modal form for importing a SKILL.md definition (mobile).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportSkillMdForm({ serverUrl, authToken, onClose, onImported }: Props) {
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('Missing Content', 'Please paste the SKILL.md content.');
      return;
    }

    setLoading(true);
    try {
      const baseUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const response = await fetch(`${baseUrl}/skills/md/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content: content.trim() }),
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', 'SKILL.md imported successfully!');
        onImported();
        onClose();
      } else {
        Alert.alert('Error', data.error || 'Import failed');
      }
    } catch (err) {
      Alert.alert('Error', `Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#888" />
        </TouchableOpacity>
        <Text style={styles.title}>Import SKILL.md</Text>
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        <Text style={styles.hint}>
          Paste the contents of a SKILL.md file to register it as a skill.
        </Text>

        <Text style={styles.label}>SKILL.md Content *</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder={'# skill-name\n\nDescription...\n\n## functions\n\n### my_function\n\nWhat it does...'}
          placeholderTextColor="#666"
          value={content}
          onChangeText={setContent}
          multiline
          numberOfLines={12}
          textAlignVertical="top"
        />

        <Text style={styles.infoText}>
          SKILL.md uses a markdown format to define skills. The heading defines the skill name,
          and ## functions sections define callable functions.
        </Text>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitText}>Import Skill</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  closeBtn: {
    padding: 6,
    marginRight: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: 16,
  },
  hint: {
    color: '#888',
    fontSize: 12,
    marginBottom: 16,
  },
  label: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2d2d44',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  multiline: {
    minHeight: 200,
    textAlignVertical: 'top',
  },
  infoText: {
    color: '#666',
    fontSize: 11,
    marginTop: 16,
    lineHeight: 16,
  },
  submitBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
