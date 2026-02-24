/**
 * GenerateSkillForm — Modal form for AI-generating a SKILL.md definition (mobile).
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
import { useTranslation } from '../../i18n';

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onGenerated: () => void;
}

interface GenerateResult {
  content: string;
  parsed: { name: string; description: string; emoji: string };
}

export default function GenerateSkillForm({ serverUrl, authToken, onClose, onGenerated }: Props) {
  const insets = useSafeAreaInsets();
  const t = useTranslation();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const handleGenerate = async () => {
    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please describe the skill you want.');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const baseUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const response = await fetch(`${baseUrl}/skills/md/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ description: description.trim() }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(data as GenerateResult);
      } else {
        Alert.alert('Error', data.error || 'Generation failed');
      }
    } catch (err) {
      Alert.alert('Error', `Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!result) return;

    setImporting(true);
    try {
      const baseUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const response = await fetch(`${baseUrl}/skills/md/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content: result.content }),
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', 'Skill imported successfully!');
        onGenerated();
        onClose();
      } else {
        Alert.alert('Error', data.error || 'Import failed');
      }
    } catch (err) {
      Alert.alert('Error', `Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#888" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('skills.aiGenerate')}</Text>
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        <Text style={styles.hint}>
          {t('skills.aiGenerateDesc')}
        </Text>

        <Text style={styles.label}>{t('skills.description')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder={t('skills.generatePromptPlaceholder')}
          placeholderTextColor="#666"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleGenerate}
          disabled={loading}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.submitText}>{t('skills.generating')}</Text>
            </>
          ) : (
            <Text style={styles.submitText}>{t('skills.generateBtn')}</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View style={styles.previewContainer}>
            <Text style={styles.previewTitle}>{t('skills.previewTitle')}</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewEmoji}>{result.parsed.emoji || ''}</Text>
              <Text style={styles.previewName}>{result.parsed.name}</Text>
              <Text style={styles.previewDesc}>{result.parsed.description}</Text>
            </View>

            <Text style={styles.label}>SKILL.md</Text>
            <View style={styles.contentPreview}>
              <Text style={styles.contentPreviewText} numberOfLines={20}>
                {result.content}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, importing && styles.submitBtnDisabled]}
              onPress={handleConfirmImport}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText}>{t('skills.confirmImport')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
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
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  previewContainer: {
    marginTop: 24,
  },
  previewTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  previewCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d2d44',
    marginBottom: 16,
    alignItems: 'center',
  },
  previewEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  previewName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  previewDesc: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
  },
  contentPreview: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2d2d44',
    borderRadius: 10,
    padding: 12,
    maxHeight: 200,
  },
  contentPreviewText: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  confirmBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 40,
  },
});
