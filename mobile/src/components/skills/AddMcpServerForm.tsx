/**
 * AddMcpServerForm — Modal form for managing MCP servers (mobile).
 * Lists existing servers and allows adding / deleting.
 */

import React, { useState, useEffect, useCallback } from 'react';
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

interface McpServer {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  connected: boolean;
  tools: string[];
}

interface Props {
  serverUrl: string;
  authToken: string;
  onClose: () => void;
  onAdded: () => void;
}

function deriveHttpBaseUrl(serverUrl: string): string {
  return serverUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/ws$/, '');
}

export default function AddMcpServerForm({ serverUrl, authToken, onClose, onAdded }: Props) {
  const insets = useSafeAreaInsets();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [adding, setAdding] = useState(false);

  const baseUrl = deriveHttpBaseUrl(serverUrl);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${baseUrl}/mcp/servers`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      setServers(json.servers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, authToken]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleAdd = async () => {
    if (!name.trim() || !command.trim()) return;
    setAdding(true);
    setError('');
    try {
      const argsArray = args.trim()
        ? args.split(',').map((a) => a.trim()).filter(Boolean)
        : [];
      const res = await fetch(`${baseUrl}/mcp/servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name: name.trim(), command: command.trim(), args: argsArray }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add server');
      }
      setName('');
      setCommand('');
      setArgs('');
      setShowAddForm(false);
      await fetchServers();
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (serverName: string) => {
    Alert.alert('Delete Server', `Remove "${serverName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError('');
          try {
            await fetch(`${baseUrl}/mcp/servers/${encodeURIComponent(serverName)}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${authToken}` },
            });
            await fetchServers();
            onAdded();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#888" />
        </TouchableOpacity>
        <Text style={styles.title}>MCP Servers</Text>
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
        <Text style={styles.hint}>
          Connect local MCP servers to expose their tools as skills.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator size="large" color="#6c63ff" style={{ marginVertical: 24 }} />
        ) : (
          <>
            {servers.map((server) => (
              <View key={server.name} style={styles.serverCard}>
                <View style={styles.serverHeader}>
                  <View style={styles.serverNameRow}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: server.connected ? '#22c55e' : '#ef4444' },
                      ]}
                    />
                    <Text style={styles.serverName}>{server.name}</Text>
                    {server.tools && server.tools.length > 0 && (
                      <View style={styles.toolsBadge}>
                        <Text style={styles.toolsBadgeText}>
                          {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(server.name)}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.serverCommand}>
                  {server.command} {server.args?.join(' ')}
                </Text>
              </View>
            ))}

            {servers.length === 0 && (
              <Text style={styles.emptyText}>No MCP servers configured</Text>
            )}
          </>
        )}

        {showAddForm ? (
          <View style={styles.addForm}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. filesystem"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Command</Text>
            <TextInput
              style={styles.input}
              placeholder="npx"
              placeholderTextColor="#666"
              value={command}
              onChangeText={setCommand}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Args</Text>
            <TextInput
              style={styles.input}
              placeholder="--server, filesystem  (comma-separated)"
              placeholderTextColor="#666"
              value={args}
              onChangeText={setArgs}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.argsHint}>Comma-separated list of arguments</Text>

            <View style={styles.addFormButtons}>
              <TouchableOpacity
                style={[styles.submitBtn, (adding || !name.trim() || !command.trim()) && styles.submitBtnDisabled]}
                onPress={handleAdd}
                disabled={adding || !name.trim() || !command.trim()}
              >
                {adding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Add Server</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowAddForm(false); setName(''); setCommand(''); setArgs(''); }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.addServerBtn} onPress={() => setShowAddForm(true)}>
            <Ionicons name="add-circle-outline" size={18} color="#888" />
            <Text style={styles.addServerText}>+ Add MCP Server</Text>
          </TouchableOpacity>
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
  error: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 12,
  },
  serverCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  serverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serverName: {
    fontWeight: '600',
    fontSize: 14,
    color: '#e0e0e0',
  },
  toolsBadge: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  toolsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6c63ff',
  },
  serverCommand: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#888',
  },
  emptyText: {
    textAlign: 'center',
    padding: 16,
    color: '#666',
    fontSize: 13,
  },
  addForm: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  label: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#2d2d44',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  argsHint: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  addFormButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  submitBtn: {
    flex: 1,
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: '#333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: '#ccc',
    fontSize: 13,
  },
  addServerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#2d2d44',
    borderRadius: 10,
    paddingVertical: 12,
  },
  addServerText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
});
