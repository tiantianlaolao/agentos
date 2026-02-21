/**
 * SkillsPanel — Skill management UI.
 * Shows all registered skills with enable/disable toggle (builtin/byok only)
 * and read-only list for OpenClaw/CoPaw agents.
 *
 * Supports three data sources:
 * 1. AgentOS server via wsClient (builtin, byok, hosted openclaw, copaw)
 * 2. OpenClaw Gateway direct via openclawClient (self-hosted openclaw)
 * 3. Module-level cache for instant re-opens
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { MessageType } from '../../types/protocol';
import type { ClientMessage, ConnectionMode, ServerMessage, SkillListResponseMessage, SkillManifestInfo } from '../../types/protocol';
import type { OpenClawDirectClient } from '../../services/openclawDirect';

interface SkillsPanelProps {
  wsClient: {
    send: (message: ClientMessage) => void;
    on: (type: string, handler: (message: ServerMessage) => void) => () => void;
    isConnected: boolean;
  } | null;
  onClose: () => void;
  /** Current connection mode — toggle only shown for builtin/byok */
  mode?: ConnectionMode;
  /** Self-hosted OpenClaw sub-mode */
  openclawSubMode?: 'hosted' | 'selfhosted';
  /** Direct OpenClaw client for self-hosted mode */
  openclawClient?: OpenClawDirectClient | null;
}

const AUDIT_BADGES: Record<string, { label: string; color: string; icon: string }> = {
  platform: { label: 'Official', color: '#22c55e', icon: 'shield-checkmark' },
  ecosystem: { label: 'Reviewed', color: '#eab308', icon: 'shield-half' },
  unreviewed: { label: 'Unreviewed', color: '#9ca3af', icon: 'shield-outline' },
};

// Module-level cache keyed by source type to avoid mixing skills from different modes
const skillsCache = new Map<string, SkillManifestInfo[]>();

function getCacheKey(mode?: ConnectionMode, openclawSubMode?: string): string {
  if (mode === 'openclaw' && openclawSubMode === 'selfhosted') return 'openclaw-selfhosted';
  if (mode === 'openclaw') return 'openclaw-hosted';
  if (mode === 'copaw') return 'copaw';
  return 'builtin'; // builtin & byok share
}

/** Whether the toggle switch should be shown (only for modes where toggle actually works) */
function canToggle(mode?: ConnectionMode): boolean {
  return !mode || mode === 'builtin' || mode === 'byok';
}

export default function SkillsPanel({ wsClient, onClose, mode, openclawSubMode, openclawClient }: SkillsPanelProps) {
  const cacheKey = getCacheKey(mode, openclawSubMode);
  const cached = skillsCache.get(cacheKey) || null;
  const [skills, setSkills] = useState<SkillManifestInfo[]>(cached || []);
  const [loading, setLoading] = useState(!cached);
  const showToggle = canToggle(mode);

  // Self-hosted OpenClaw: fetch skills directly from Gateway
  const fetchDirectSkills = useCallback(async (force = false) => {
    if (!openclawClient) return;
    if (!force && skillsCache.has(cacheKey)) return;
    setLoading(true);
    try {
      const result = await openclawClient.listSkills();
      const mapped: SkillManifestInfo[] = result.map((s) => ({
        name: s.name,
        version: '1.0.0',
        description: s.description || '',
        author: s.source || 'OpenClaw',
        audit: 'ecosystem',
        auditSource: 'OpenClaw',
        enabled: s.disabled !== true,
        emoji: s.emoji,
        eligible: s.eligible ?? undefined,
        functions: [],
      }));
      skillsCache.set(cacheKey, mapped);
      setSkills(mapped);
    } catch (err) {
      console.log('[SkillsPanel] direct fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [openclawClient, cacheKey]);

  // Server-based: request via WS
  const requestSkillList = useCallback((forceRefresh = false) => {
    if (!wsClient?.isConnected) return;
    if (forceRefresh) {
      skillsCache.delete(cacheKey);
      setLoading(true);
    }
    wsClient.send({
      id: randomUUID(),
      type: MessageType.SKILL_LIST_REQUEST,
      timestamp: Date.now(),
    });
  }, [wsClient, cacheKey]);

  const toggleSkill = useCallback((skillName: string, enabled: boolean) => {
    if (!wsClient?.isConnected || !showToggle) return;
    // Optimistically update cache
    const current = skillsCache.get(cacheKey);
    if (current) {
      const updated = current.map(s => s.name === skillName ? { ...s, enabled } : s);
      skillsCache.set(cacheKey, updated);
      setSkills(updated);
    }
    wsClient.send({
      id: randomUUID(),
      type: MessageType.SKILL_TOGGLE,
      timestamp: Date.now(),
      payload: { skillName, enabled },
    });
  }, [wsClient, showToggle, cacheKey]);

  const handleRefresh = useCallback(() => {
    if (mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient) {
      fetchDirectSkills(true);
    } else {
      requestSkillList(true);
    }
  }, [mode, openclawSubMode, openclawClient, fetchDirectSkills, requestSkillList]);

  useEffect(() => {
    const isSelfhosted = mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient;

    if (isSelfhosted) {
      // Direct Gateway fetch
      if (!skillsCache.has(cacheKey)) {
        fetchDirectSkills();
      }
      return;
    }

    // Server-based fetch via WS
    if (!wsClient) return;

    const unsub = wsClient.on(MessageType.SKILL_LIST_RESPONSE, (msg: ServerMessage) => {
      const response = msg as SkillListResponseMessage;
      skillsCache.set(cacheKey, response.payload.skills);
      setSkills(response.payload.skills);
      setLoading(false);
    });

    if (!skillsCache.has(cacheKey)) {
      requestSkillList();
    }

    return unsub;
  }, [wsClient, mode, openclawSubMode, openclawClient, cacheKey, requestSkillList, fetchDirectSkills]);

  const renderSkill = useCallback(({ item }: { item: SkillManifestInfo }) => {
    const badge = AUDIT_BADGES[item.audit] || AUDIT_BADGES.unreviewed;

    return (
      <View style={styles.skillCard}>
        <View style={styles.skillHeader}>
          <View style={styles.skillNameRow}>
            {item.emoji ? <Text style={styles.skillEmoji}>{item.emoji}</Text> : null}
            <Text style={styles.skillName}>{item.name}</Text>
            {item.version ? <Text style={styles.skillVersion}>v{item.version}</Text> : null}
          </View>
          {showToggle ? (
            <Switch
              value={item.enabled}
              onValueChange={(val) => toggleSkill(item.name, val)}
              trackColor={{ false: '#3e3e52', true: '#6c63ff' }}
              thumbColor={item.enabled ? '#ffffff' : '#888'}
            />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: item.enabled ? '#22c55e' : '#666' }]} />
          )}
        </View>

        <Text style={styles.skillDesc} numberOfLines={2}>{item.description}</Text>

        <View style={styles.skillMeta}>
          <View style={[styles.auditBadge, { borderColor: badge.color }]}>
            <Ionicons name={badge.icon as keyof typeof Ionicons.glyphMap} size={12} color={badge.color} />
            <Text style={[styles.auditText, { color: badge.color }]}>
              {badge.label}
              {item.auditSource ? ` (${item.auditSource})` : ''}
            </Text>
          </View>
          <Text style={styles.authorText}>by {item.author}</Text>
        </View>

        {item.functions.length > 0 && (
          <View style={styles.functionsSection}>
            {item.functions.map((fn) => (
              <View key={fn.name} style={styles.functionRow}>
                <Ionicons name="code-slash-outline" size={12} color="#888" />
                <Text style={styles.functionName}>{fn.name}</Text>
                <Text style={styles.functionDesc} numberOfLines={1}> - {fn.description}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }, [toggleSkill, showToggle]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#6c63ff" />
        </TouchableOpacity>
        <Text style={styles.title}>Skills</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color="#888" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6c63ff" />
          <Text style={styles.loadingText}>Loading skills...</Text>
        </View>
      ) : skills.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="extension-puzzle-outline" size={48} color="#444" />
          <Text style={styles.emptyText}>No skills registered</Text>
        </View>
      ) : (
        <FlatList
          data={skills}
          keyExtractor={(item) => item.name}
          renderItem={renderSkill}
          contentContainerStyle={styles.listContent}
        />
      )}
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
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  refreshBtn: {
    padding: 6,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    marginTop: 12,
  },
  listContent: {
    padding: 12,
  },
  skillCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  skillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  skillNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flex: 1,
  },
  skillEmoji: {
    fontSize: 18,
    marginRight: 2,
  },
  skillName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  skillVersion: {
    color: '#666',
    fontSize: 12,
  },
  skillDesc: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  skillMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  auditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  auditText: {
    fontSize: 11,
    fontWeight: '600',
  },
  authorText: {
    color: '#666',
    fontSize: 11,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  functionsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2d2d44',
  },
  functionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  functionName: {
    color: '#6c63ff',
    fontSize: 12,
    fontWeight: '600',
  },
  functionDesc: {
    color: '#888',
    fontSize: 11,
    flex: 1,
  },
});
