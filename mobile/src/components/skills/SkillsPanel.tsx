/**
 * SkillsPanel — Skill management UI with Install/Uninstall support.
 *
 * Two tabs:
 *   1. "Installed" — user's installed skills with uninstall button
 *   2. "Library"   — full skill catalog with install/installed status
 *
 * Supports three data sources:
 *   1. AgentOS server via wsClient (builtin, byok, hosted openclaw, copaw)
 *   2. OpenClaw Gateway direct via openclawClient (self-hosted openclaw)
 *   3. Module-level cache for instant re-opens
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { MessageType } from '../../types/protocol';
import type {
  ClientMessage,
  ConnectionMode,
  ServerMessage,
  SkillListResponseMessage,
  SkillLibraryResponseMessage,
  SkillManifestInfo,
  SkillLibraryItem,
} from '../../types/protocol';
import type { OpenClawDirectClient } from '../../services/openclawDirect';

interface SkillsPanelProps {
  wsClient: {
    send: (message: ClientMessage) => void;
    on: (type: string, handler: (message: ServerMessage) => void) => () => void;
    isConnected: boolean;
  } | null;
  onClose: () => void;
  mode?: ConnectionMode;
  openclawSubMode?: 'hosted' | 'selfhosted';
  openclawClient?: OpenClawDirectClient | null;
}

type TabKey = 'installed' | 'library';

const AUDIT_BADGES: Record<string, { label: string; color: string; icon: string }> = {
  platform: { label: 'Official', color: '#22c55e', icon: 'shield-checkmark' },
  ecosystem: { label: 'Reviewed', color: '#eab308', icon: 'shield-half' },
  unreviewed: { label: 'Unreviewed', color: '#9ca3af', icon: 'shield-outline' },
};

const ENV_ICONS: Record<string, { icon: string; label: string }> = {
  cloud: { icon: 'cloud-outline', label: 'Cloud' },
  desktop: { icon: 'desktop-outline', label: 'Desktop' },
  mobile: { icon: 'phone-portrait-outline', label: 'Mobile' },
};

// Module-level caches
const skillsCache = new Map<string, SkillManifestInfo[]>();
const libraryCache = new Map<string, SkillLibraryItem[]>();

function getCacheKey(mode?: ConnectionMode, openclawSubMode?: string): string {
  if (mode === 'openclaw' && openclawSubMode === 'selfhosted') return 'openclaw-selfhosted';
  if (mode === 'openclaw') return 'openclaw-hosted';
  if (mode === 'copaw') return 'copaw';
  return 'builtin';
}

/** Whether this is a builtin/byok mode where install/uninstall works */
function canManageSkills(mode?: ConnectionMode): boolean {
  return !mode || mode === 'builtin' || mode === 'byok';
}

export default function SkillsPanel({ wsClient, onClose, mode, openclawSubMode, openclawClient }: SkillsPanelProps) {
  const cacheKey = getCacheKey(mode, openclawSubMode);
  const manageable = canManageSkills(mode);
  const [activeTab, setActiveTab] = useState<TabKey>('installed');
  const [skills, setSkills] = useState<SkillManifestInfo[]>(skillsCache.get(cacheKey) || []);
  const [library, setLibrary] = useState<SkillLibraryItem[]>(libraryCache.get(cacheKey) || []);
  const [loading, setLoading] = useState(!skillsCache.has(cacheKey));
  const [libraryLoading, setLibraryLoading] = useState(false);

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
        installed: true,
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

  // Server-based: request installed skills via WS
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

  // Request library catalog
  const requestLibrary = useCallback((forceRefresh = false) => {
    if (!wsClient?.isConnected) return;
    if (forceRefresh) {
      libraryCache.delete(cacheKey);
    }
    setLibraryLoading(true);
    wsClient.send({
      id: randomUUID(),
      type: MessageType.SKILL_LIBRARY_REQUEST,
      timestamp: Date.now(),
    });
  }, [wsClient, cacheKey]);

  // Install a skill
  const installSkill = useCallback((skillName: string) => {
    if (!wsClient?.isConnected) return;
    wsClient.send({
      id: randomUUID(),
      type: MessageType.SKILL_INSTALL,
      timestamp: Date.now(),
      payload: { skillName },
    });
    // Optimistic update for library
    setLibrary((prev) => {
      const updated = prev.map((s) =>
        s.name === skillName ? { ...s, installed: true } : s
      );
      libraryCache.set(cacheKey, updated);
      return updated;
    });
  }, [wsClient, cacheKey]);

  // Uninstall a skill
  const uninstallSkill = useCallback((skillName: string) => {
    if (!wsClient?.isConnected) return;
    wsClient.send({
      id: randomUUID(),
      type: MessageType.SKILL_UNINSTALL,
      timestamp: Date.now(),
      payload: { skillName },
    });
    // Optimistic update
    setSkills((prev) => {
      const updated = prev.filter((s) => s.name !== skillName);
      skillsCache.set(cacheKey, updated);
      return updated;
    });
    setLibrary((prev) => {
      const updated = prev.map((s) =>
        s.name === skillName ? { ...s, installed: false } : s
      );
      libraryCache.set(cacheKey, updated);
      return updated;
    });
  }, [wsClient, cacheKey]);

  const handleRefresh = useCallback(() => {
    if (mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient) {
      fetchDirectSkills(true);
    } else {
      requestSkillList(true);
      if (activeTab === 'library') {
        requestLibrary(true);
      }
    }
  }, [mode, openclawSubMode, openclawClient, fetchDirectSkills, requestSkillList, requestLibrary, activeTab]);

  useEffect(() => {
    const isSelfhosted = mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient;

    if (isSelfhosted) {
      if (!skillsCache.has(cacheKey)) {
        fetchDirectSkills();
      }
      return;
    }

    if (!wsClient) return;

    const unsubList = wsClient.on(MessageType.SKILL_LIST_RESPONSE, (msg: ServerMessage) => {
      const response = msg as SkillListResponseMessage;
      skillsCache.set(cacheKey, response.payload.skills);
      setSkills(response.payload.skills);
      setLoading(false);
    });

    const unsubLibrary = wsClient.on(MessageType.SKILL_LIBRARY_RESPONSE, (msg: ServerMessage) => {
      const response = msg as SkillLibraryResponseMessage;
      libraryCache.set(cacheKey, response.payload.skills);
      setLibrary(response.payload.skills);
      setLibraryLoading(false);
    });

    if (!skillsCache.has(cacheKey)) {
      requestSkillList();
    }

    return () => {
      unsubList();
      unsubLibrary();
    };
  }, [wsClient, mode, openclawSubMode, openclawClient, cacheKey, requestSkillList, fetchDirectSkills]);

  // Load library when tab switches to it
  useEffect(() => {
    if (activeTab === 'library' && !libraryCache.has(cacheKey) && manageable) {
      requestLibrary();
    }
  }, [activeTab, cacheKey, manageable, requestLibrary]);

  const renderInstalledSkill = useCallback(({ item }: { item: SkillManifestInfo }) => {
    const badge = AUDIT_BADGES[item.audit] || AUDIT_BADGES.unreviewed;
    const isPrivate = item.visibility === 'private';

    return (
      <View style={styles.skillCard}>
        <View style={styles.skillHeader}>
          <View style={styles.skillNameRow}>
            {item.emoji ? <Text style={styles.skillEmoji}>{item.emoji}</Text> : null}
            <Text style={styles.skillName}>{item.name}</Text>
            {item.version ? <Text style={styles.skillVersion}>v{item.version}</Text> : null}
            {isPrivate && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={10} color="#f59e0b" />
                <Text style={styles.privateText}>Private</Text>
              </View>
            )}
          </View>
          {manageable ? (
            <TouchableOpacity
              style={styles.uninstallBtn}
              onPress={() => uninstallSkill(item.name)}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={styles.uninstallText}>Uninstall</Text>
            </TouchableOpacity>
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
          {item.environments && item.environments.length > 0 && (
            <View style={styles.envRow}>
              {item.environments.map((env) => {
                const info = ENV_ICONS[env] || { icon: 'help-circle-outline', label: env };
                return (
                  <View key={env} style={styles.envTag}>
                    <Ionicons name={info.icon as keyof typeof Ionicons.glyphMap} size={11} color="#888" />
                    <Text style={styles.envText}>{info.label}</Text>
                  </View>
                );
              })}
            </View>
          )}
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
  }, [manageable, uninstallSkill]);

  const renderLibrarySkill = useCallback(({ item }: { item: SkillLibraryItem }) => {
    const badge = AUDIT_BADGES[item.audit] || AUDIT_BADGES.unreviewed;
    const isPrivate = item.visibility === 'private';

    return (
      <View style={styles.skillCard}>
        <View style={styles.skillHeader}>
          <View style={styles.skillNameRow}>
            <Text style={styles.skillName}>{item.name}</Text>
            {item.version ? <Text style={styles.skillVersion}>v{item.version}</Text> : null}
            {isPrivate && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={10} color="#f59e0b" />
                <Text style={styles.privateText}>Private</Text>
              </View>
            )}
          </View>
          {item.installed ? (
            <View style={styles.installedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={styles.installedText}>Installed</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.installBtn}
              onPress={() => installSkill(item.name)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#6c63ff" />
              <Text style={styles.installText}>Install</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.skillDesc} numberOfLines={2}>{item.description}</Text>

        <View style={styles.skillMeta}>
          <View style={[styles.auditBadge, { borderColor: badge.color }]}>
            <Ionicons name={badge.icon as keyof typeof Ionicons.glyphMap} size={12} color={badge.color} />
            <Text style={[styles.auditText, { color: badge.color }]}>
              {badge.label}
            </Text>
          </View>
          {item.environments && item.environments.length > 0 && (
            <View style={styles.envRow}>
              {item.environments.map((env) => {
                const info = ENV_ICONS[env] || { icon: 'help-circle-outline', label: env };
                return (
                  <View key={env} style={styles.envTag}>
                    <Ionicons name={info.icon as keyof typeof Ionicons.glyphMap} size={11} color="#888" />
                    <Text style={styles.envText}>{info.label}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {item.category && item.category !== 'general' && (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
          )}
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
  }, [installSkill]);

  // For agent adapter modes (openclaw, copaw), only show installed tab
  const showTabs = manageable;

  const installedSkills = skills.filter((s) =>
    s.installed !== false // show all for agent modes, filter for builtin/byok
  );

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

      {showTabs && (
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'installed' && styles.activeTab]}
            onPress={() => setActiveTab('installed')}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={activeTab === 'installed' ? '#6c63ff' : '#888'} />
            <Text style={[styles.tabText, activeTab === 'installed' && styles.activeTabText]}>
              Installed ({installedSkills.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'library' && styles.activeTab]}
            onPress={() => setActiveTab('library')}
          >
            <Ionicons name="grid-outline" size={16} color={activeTab === 'library' ? '#6c63ff' : '#888'} />
            <Text style={[styles.tabText, activeTab === 'library' && styles.activeTabText]}>
              Library
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'installed' ? (
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6c63ff" />
            <Text style={styles.loadingText}>Loading skills...</Text>
          </View>
        ) : installedSkills.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="extension-puzzle-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>No skills installed</Text>
            {manageable && (
              <TouchableOpacity onPress={() => setActiveTab('library')} style={styles.browseBtn}>
                <Text style={styles.browseText}>Browse Library</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={installedSkills}
            keyExtractor={(item) => item.name}
            renderItem={renderInstalledSkill}
            contentContainerStyle={styles.listContent}
          />
        )
      ) : (
        libraryLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6c63ff" />
            <Text style={styles.loadingText}>Loading library...</Text>
          </View>
        ) : library.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="storefront-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>No skills available</Text>
          </View>
        ) : (
          <FlatList
            data={library}
            keyExtractor={(item) => item.name}
            renderItem={renderLibrarySkill}
            contentContainerStyle={styles.listContent}
          />
        )
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
    paddingHorizontal: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#6c63ff',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#6c63ff',
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
  browseBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#6c63ff',
    borderRadius: 8,
  },
  browseText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    flexWrap: 'wrap',
    gap: 8,
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
  envRow: {
    flexDirection: 'row',
    gap: 4,
  },
  envTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#252540',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  envText: {
    color: '#888',
    fontSize: 10,
  },
  categoryTag: {
    backgroundColor: '#252540',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryText: {
    color: '#888',
    fontSize: 10,
    textTransform: 'capitalize',
  },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6c63ff',
  },
  installText: {
    color: '#6c63ff',
    fontSize: 13,
    fontWeight: '600',
  },
  uninstallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  uninstallText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  installedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  installedText: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '600',
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  privateText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '600',
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
