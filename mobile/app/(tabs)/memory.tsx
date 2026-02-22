import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useTranslation } from '../../src/i18n';
import { getMemory, putMemory } from '../../src/services/memoryApi';

export default function MemoryScreen() {
  const t = useTranslation();
  const router = useRouter();
  const { isLoggedIn, authToken } = useAuthStore();
  const { serverUrl, mode } = useSettingsStore();
  const isBuiltinMode = mode === 'builtin' || mode === 'byok';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  const loadMemory = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await getMemory(authToken, serverUrl);
      if (res.ok && res.data) {
        setContent(res.data.content);
        setUpdatedAt(res.data.updatedAt);
      } else {
        setContent('');
        setUpdatedAt('');
      }
    } catch {
      // Silently fail on load — user sees empty state
    } finally {
      setLoading(false);
    }
  }, [authToken, serverUrl]);

  useEffect(() => {
    if (isLoggedIn && isBuiltinMode) {
      loadMemory();
    } else {
      setLoading(false);
    }
  }, [isLoggedIn, isBuiltinMode, loadMemory]);

  const handleEdit = useCallback(() => {
    setEditContent(content);
    setEditing(true);
  }, [content]);

  const handleCancel = useCallback(() => {
    setEditing(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!authToken) return;
    setSaving(true);
    try {
      const res = await putMemory(editContent, authToken, serverUrl);
      if (res.ok) {
        setContent(editContent);
        setUpdatedAt(res.data?.updatedAt || new Date().toISOString());
        setEditing(false);
        if (Platform.OS === 'android') {
          ToastAndroid.show('Saved', ToastAndroid.SHORT);
        }
      } else {
        Alert.alert('', res.error || 'Save failed');
      }
    } catch {
      Alert.alert('', 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [authToken, editContent, serverUrl]);

  const formatUpdatedAt = useCallback((iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString();
  }, []);

  // Not logged in
  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="lock-closed-outline" size={48} color="#666" />
          <Text style={styles.loginText}>{t('memory.loginRequired')}</Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginButtonText}>{t('settings.loginOrRegister')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Non-builtin mode: memory managed by external agent
  if (!isBuiltinMode) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="cloud-outline" size={48} color="#666" />
          <Text style={styles.loginText}>{t('memory.externalAgent')}</Text>
        </View>
      </View>
    );
  }

  // Loading
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#6c63ff" />
        </View>
      </View>
    );
  }

  // Editing mode
  if (editing) {
    return (
      <View style={styles.container}>
        <View style={styles.editHeader}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerBtn}>
            <Text style={styles.cancelText}>{t('memory.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('memory.title')}</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={saving}>
            <Text style={[styles.saveText, saving && styles.saveTextDisabled]}>
              {saving ? t('memory.saving') : t('memory.save')}
            </Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.editInput}
          value={editContent}
          onChangeText={setEditContent}
          multiline
          maxLength={2000}
          autoFocus
          placeholder={t('memory.empty')}
          placeholderTextColor="#666"
        />
        <Text style={styles.charCount}>
          {t('memory.charCount').replace('{{count}}', String(editContent.length))}
        </Text>
      </View>
    );
  }

  // View mode
  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {!content ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="bulb-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>{t('memory.empty')}</Text>
          </View>
        ) : (
          <>
            <Text selectable style={styles.memoryContent}>{content}</Text>
            {updatedAt ? (
              <Text style={styles.metaText}>
                {t('memory.updatedAt').replace('{{time}}', formatUpdatedAt(updatedAt))}
              </Text>
            ) : null}
            <Text style={styles.metaText}>
              {t('memory.charCount').replace('{{count}}', String(content.length))}
            </Text>
          </>
        )}
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
          <Ionicons name="create-outline" size={18} color="#ffffff" />
          <Text style={styles.editButtonText}>{t('memory.edit')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  loginText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 22,
  },
  loginButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 80,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: '#666',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },
  memoryContent: {
    color: '#e0e0e0',
    fontSize: 15,
    lineHeight: 24,
  },
  metaText: {
    color: '#666',
    fontSize: 12,
    marginTop: 12,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2d2d44',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 12,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  headerBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelText: {
    color: '#888',
    fontSize: 15,
  },
  saveText: {
    color: '#6c63ff',
    fontSize: 15,
    fontWeight: '600',
  },
  saveTextDisabled: {
    opacity: 0.5,
  },
  editInput: {
    flex: 1,
    color: '#e0e0e0',
    fontSize: 15,
    lineHeight: 24,
    padding: 20,
    textAlignVertical: 'top',
  },
  charCount: {
    color: '#666',
    fontSize: 12,
    textAlign: 'right',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
});
