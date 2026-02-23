/**
 * RegisterSkillForm — Modal form for registering external HTTP skills.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onRegistered: () => void;
}

export default function RegisterSkillForm({ serverUrl, authToken, onClose, onRegistered }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [funcName, setFuncName] = useState('');
  const [funcDesc, setFuncDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !endpointUrl.trim() || !funcName.trim()) {
      Alert.alert('Missing Fields', 'Name, endpoint URL, and at least one function are required.');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      Alert.alert('Invalid Name', 'Skill name must contain only lowercase letters, digits, and hyphens.');
      return;
    }

    setLoading(true);
    try {
      const baseUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
      const response = await fetch(`${baseUrl}/skills/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          endpointUrl: endpointUrl.trim(),
          functions: [
            {
              name: funcName.trim(),
              description: funcDesc.trim() || funcName.trim(),
              parameters: {
                type: 'object',
                properties: {
                  input: {
                    type: 'string',
                    description: 'Input for the function',
                  },
                },
                required: ['input'],
              },
            },
          ],
        }),
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', `Skill "${data.skill.name}" registered successfully!`);
        onRegistered();
        onClose();
      } else {
        Alert.alert('Error', data.error || 'Registration failed');
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
        <Text style={styles.title}>Register External Skill</Text>
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        <Text style={styles.label}>Skill Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="my-skill"
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="What does this skill do?"
          placeholderTextColor="#666"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Endpoint URL *</Text>
        <TextInput
          style={styles.input}
          placeholder="https://my-server.com/api/skill"
          placeholderTextColor="#666"
          value={endpointUrl}
          onChangeText={setEndpointUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.sectionTitle}>Function Definition</Text>

        <Text style={styles.label}>Function Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="do_something"
          placeholderTextColor="#666"
          value={funcName}
          onChangeText={setFuncName}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Function Description</Text>
        <TextInput
          style={styles.input}
          placeholder="Describe what this function does"
          placeholderTextColor="#666"
          value={funcDesc}
          onChangeText={setFuncDesc}
        />

        <Text style={styles.hint}>
          Your endpoint will receive POST requests with {`{ "function": "<name>", "args": {...} }`} and should return a JSON response.
        </Text>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitText}>Register Skill</Text>
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
  label: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  sectionTitle: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 4,
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
    minHeight: 70,
    textAlignVertical: 'top',
  },
  hint: {
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
