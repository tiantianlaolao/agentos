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

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
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
import RegisterSkillForm from './RegisterSkillForm';
import SkillDetail from './SkillDetail';
import AddMcpServerForm from './AddMcpServerForm';
import ImportSkillMdForm from './ImportSkillMdForm';
import { useTranslation } from '../../i18n';
import { useSettingsStore } from '../../stores/settingsStore';

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
  serverUrl?: string;
  authToken?: string;
}

type TabKey = 'installed' | 'library';

const CATEGORIES = [
  { key: 'all', label: 'All', emoji: '📦' },
  { key: 'tools', label: 'Tools', emoji: '🛠️' },
  { key: 'knowledge', label: 'Knowledge', emoji: '📚' },
  { key: 'productivity', label: 'Productivity', emoji: '⚡' },
  { key: 'finance', label: 'Finance', emoji: '💰' },
  { key: 'creative', label: 'Creative', emoji: '🎨' },
] as const;

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

export default function SkillsPanel({ wsClient, onClose, mode, openclawSubMode, openclawClient, serverUrl, authToken }: SkillsPanelProps) {
  const t = useTranslation();
  const locale = useSettingsStore((s) => s.locale);
  const cacheKey = getCacheKey(mode, openclawSubMode);
  const manageable = canManageSkills(mode);
  const [activeTab, setActiveTab] = useState<TabKey>('installed');
  const [skills, setSkills] = useState<SkillManifestInfo[]>(skillsCache.get(cacheKey) || []);
  const [library, setLibrary] = useState<SkillLibraryItem[]>(libraryCache.get(cacheKey) || []);
  const [loading, setLoading] = useState(!skillsCache.has(cacheKey));
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedEnvFilter, setSelectedEnvFilter] = useState<'all' | 'desktop'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addSkillMode, setAddSkillMode] = useState<null | 'menu' | 'http' | 'mcp' | 'skillmd'>(null);
  const [detailSkill, setDetailSkill] = useState<SkillLibraryItem | null>(null);

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

  // Install a skill (with permission confirmation for risky skills)
  const doInstall = useCallback((skillName: string) => {
    if (!wsClient?.isConnected) return;
    wsClient.send({
      id: randomUUID(),
      type: MessageType.SKILL_INSTALL,
      timestamp: Date.now(),
      payload: { skillName },
    });
    setLibrary((prev) => {
      const updated = prev.map((s) =>
        s.name === skillName ? { ...s, installed: true } : s
      );
      libraryCache.set(cacheKey, updated);
      return updated;
    });
  }, [wsClient, cacheKey]);

  const HIGH_RISK_PERMISSIONS = ['filesystem', 'exec', 'system', 'browser'];
  const installSkill = useCallback((skillName: string) => {
    const skill = library.find((s) => s.name === skillName);
    const riskyPerms = skill?.permissions?.filter((p) => HIGH_RISK_PERMISSIONS.includes(p)) || [];
    if (riskyPerms.length > 0) {
      Alert.alert(
        'Permission Required',
        `"${skillName}" requires the following permissions:\n\n${riskyPerms.map((p) => `  • ${p}`).join('\n')}\n\nDo you want to install it?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Install', onPress: () => doInstall(skillName) },
        ]
      );
    } else {
      doInstall(skillName);
    }
  }, [library, doInstall]);

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

  // Filter and group library items
  const filteredLibrary = useMemo(() => {
    let items = library;
    if (selectedCategory !== 'all') {
      items = items.filter((s) => s.category === selectedCategory);
    }
    if (selectedEnvFilter === 'desktop') {
      items = items.filter(
        (s) =>
          s.name.startsWith('desktop-') ||
          s.name.startsWith('mcp-') ||
          (s.environments && s.environments.includes('desktop'))
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((s) => {
        if (s.name.toLowerCase().includes(q)) return true;
        if (s.description.toLowerCase().includes(q)) return true;
        if (s.emoji && s.emoji.includes(q)) return true;
        if (s.locales) {
          for (const loc of Object.values(s.locales)) {
            if ((loc.displayName || '').toLowerCase().includes(q)) return true;
            if ((loc.description || '').toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }
    return items;
  }, [library, selectedCategory, selectedEnvFilter, searchQuery]);

  // Group by category for display
  const groupedLibrary = useMemo(() => {
    if (selectedCategory !== 'all') return [{ category: selectedCategory, items: filteredLibrary }];
    const groups = new Map<string, SkillLibraryItem[]>();
    for (const item of filteredLibrary) {
      const cat = item.category || 'general';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [filteredLibrary, selectedCategory]);

  /** Returns a badge config if the skill is a Desktop or MCP skill, or null otherwise. */
  const getSkillTypeBadge = useCallback((name: string): { emoji: string; label: string; bg: string } | null => {
    if (name.startsWith('desktop-')) return { emoji: '\u{1F5A5}\uFE0F', label: 'Desktop', bg: '#6c63ff' };
    if (name.startsWith('mcp-')) return { emoji: '\u{1F50C}', label: 'MCP', bg: '#2d7d46' };
    return null;
  }, []);

  const renderInstalledSkill = useCallback(({ item }: { item: SkillManifestInfo }) => {
    const badge = AUDIT_BADGES[item.audit] || AUDIT_BADGES.unreviewed;
    const isPrivate = item.visibility === 'private';
    const typeBadge = getSkillTypeBadge(item.name);
    const displayName = item.locales?.[locale]?.displayName ?? item.name;
    const displayDesc = item.locales?.[locale]?.description ?? item.description;

    return (
      <View style={styles.skillCard}>
        <View style={styles.skillHeader}>
          <View style={styles.skillNameRow}>
            {item.emoji ? <Text style={styles.skillEmoji}>{item.emoji}</Text> : null}
            <Text style={styles.skillName}>{displayName}</Text>
            {item.version ? <Text style={styles.skillVersion}>v{item.version}</Text> : null}
            {isPrivate && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={10} color="#f59e0b" />
                <Text style={styles.privateText}>{t('skills.private')}</Text>
              </View>
            )}
            {typeBadge && (
              <View style={[styles.typeBadge, { backgroundColor: typeBadge.bg }]}>
                <Text style={styles.typeBadgeEmoji}>{typeBadge.emoji}</Text>
                <Text style={styles.typeBadgeText}>{typeBadge.label}</Text>
              </View>
            )}
          </View>
          {manageable ? (
            <TouchableOpacity
              style={styles.uninstallBtn}
              onPress={() => uninstallSkill(item.name)}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={styles.uninstallText}>{t('skills.uninstall')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.statusDot, { backgroundColor: item.enabled ? '#22c55e' : '#666' }]} />
          )}
        </View>

        <Text style={styles.skillDesc} numberOfLines={2}>{displayDesc}</Text>

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
          <Text style={styles.authorText}>{t('skills.by')} {item.author}</Text>
        </View>

        {item.functions.length > 0 && (
          <View style={styles.functionsSection}>
            {item.functions.map((fn) => (
              <View key={fn.name} style={styles.functionRow}>
                <Ionicons name="code-slash-outline" size={12} color="#888" />
                <Text style={styles.functionName}>{fn.name}</Text>
                <Text style={styles.functionDesc} numberOfLines={1}> - {item.locales?.[locale]?.functions?.[fn.name] ?? fn.description}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }, [manageable, uninstallSkill, getSkillTypeBadge, t, locale]);

  const renderLibrarySkill = useCallback(({ item }: { item: SkillLibraryItem }) => {
    const badge = AUDIT_BADGES[item.audit] || AUDIT_BADGES.unreviewed;
    const isPrivate = item.visibility === 'private';
    const typeBadge = getSkillTypeBadge(item.name);
    const displayName = item.locales?.[locale]?.displayName ?? item.name;
    const displayDesc = item.locales?.[locale]?.description ?? item.description;

    return (
      <TouchableOpacity style={styles.skillCard} onPress={() => setDetailSkill(item)} activeOpacity={0.7}>
        <View style={styles.skillHeader}>
          <View style={styles.skillNameRow}>
            {item.emoji ? <Text style={styles.skillEmoji}>{item.emoji}</Text> : null}
            <Text style={styles.skillName}>{displayName}</Text>
            {item.version ? <Text style={styles.skillVersion}>v{item.version}</Text> : null}
            {isPrivate && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={10} color="#f59e0b" />
                <Text style={styles.privateText}>{t('skills.private')}</Text>
              </View>
            )}
            {typeBadge && (
              <View style={[styles.typeBadge, { backgroundColor: typeBadge.bg }]}>
                <Text style={styles.typeBadgeEmoji}>{typeBadge.emoji}</Text>
                <Text style={styles.typeBadgeText}>{typeBadge.label}</Text>
              </View>
            )}
          </View>
          {item.installed ? (
            <View style={styles.installedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={styles.installedText}>{t('skills.installedBadge')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.installBtn}
              onPress={() => installSkill(item.name)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#6c63ff" />
              <Text style={styles.installText}>{t('skills.install')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.skillDesc} numberOfLines={2}>{displayDesc}</Text>

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
          <Text style={styles.authorText}>{t('skills.by')} {item.author}</Text>
        </View>

        {item.functions.length > 0 && (
          <View style={styles.functionsSection}>
            {item.functions.map((fn) => (
              <View key={fn.name} style={styles.functionRow}>
                <Ionicons name="code-slash-outline" size={12} color="#888" />
                <Text style={styles.functionName}>{fn.name}</Text>
                <Text style={styles.functionDesc} numberOfLines={1}> - {item.locales?.[locale]?.functions?.[fn.name] ?? fn.description}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  }, [installSkill, getSkillTypeBadge, t, locale]);

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
        <Text style={styles.title}>{t('skills.title')}</Text>
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
              {t('skills.installed')} ({installedSkills.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'library' && styles.activeTab]}
            onPress={() => setActiveTab('library')}
          >
            <Ionicons name="grid-outline" size={16} color={activeTab === 'library' ? '#6c63ff' : '#888'} />
            <Text style={[styles.tabText, activeTab === 'library' && styles.activeTabText]}>
              {t('skills.library')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'installed' ? (
        loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6c63ff" />
            <Text style={styles.loadingText}>{t('skills.loadingSkills')}</Text>
          </View>
        ) : installedSkills.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="extension-puzzle-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>{t('skills.noSkillsInstalled')}</Text>
            {manageable && (
              <TouchableOpacity onPress={() => setActiveTab('library')} style={styles.browseBtn}>
                <Text style={styles.browseText}>{t('skills.browseLibrary')}</Text>
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
            <Text style={styles.loadingText}>{t('skills.loadingLibrary')}</Text>
          </View>
        ) : library.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="storefront-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>{t('skills.noSkillsAvailable')}</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={16} color="#888" />
              <TextInput
                style={styles.searchInput}
                placeholder={t('skills.searchPlaceholder')}
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#666" />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Bar */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryBar}
              contentContainerStyle={styles.categoryBarContent}
            >
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat.key && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(cat.key)}
                >
                  <Text style={styles.categoryChipEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === cat.key && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Environment Filter */}
            <View style={styles.envFilterRow}>
              <TouchableOpacity
                style={[
                  styles.envFilterChip,
                  selectedEnvFilter === 'all' && styles.envFilterChipActive,
                ]}
                onPress={() => setSelectedEnvFilter('all')}
              >
                <Text style={[
                  styles.envFilterChipText,
                  selectedEnvFilter === 'all' && styles.envFilterChipTextActive,
                ]}>{t('skills.all')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.envFilterChip,
                  selectedEnvFilter === 'desktop' && styles.envFilterChipActive,
                ]}
                onPress={() => setSelectedEnvFilter('desktop')}
              >
                <Text style={styles.envFilterChipEmoji}>{'\u{1F5A5}\uFE0F'}</Text>
                <Text style={[
                  styles.envFilterChipText,
                  selectedEnvFilter === 'desktop' && styles.envFilterChipTextActive,
                ]}>{t('skills.desktopFilter')}</Text>
              </TouchableOpacity>
            </View>

            {/* Grouped Library */}
            <FlatList
              data={groupedLibrary}
              keyExtractor={(group) => group.category}
              renderItem={({ item: group }) => (
                <View>
                  {selectedCategory === 'all' && (
                    <View style={styles.groupHeader}>
                      <Text style={styles.groupTitle}>
                        {CATEGORIES.find((c) => c.key === group.category)?.emoji || '📦'}{' '}
                        {(group.category.charAt(0).toUpperCase() + group.category.slice(1))}
                      </Text>
                      <Text style={styles.groupCount}>{group.items.length}</Text>
                    </View>
                  )}
                  {group.items.map((skill) => (
                    <View key={skill.name}>
                      {renderLibrarySkill({ item: skill })}
                    </View>
                  ))}
                </View>
              )}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={36} color="#444" />
                  <Text style={styles.emptyText}>{t('skills.noMatch')}</Text>
                </View>
              }
            />
          </View>
        )
      )}

      {/* Add Skill Button */}
      {manageable && authToken && serverUrl && (
        <TouchableOpacity
          style={styles.registerSkillBtn}
          onPress={() => setAddSkillMode('menu')}
        >
          <Ionicons name="add-circle-outline" size={18} color="#6c63ff" />
          <Text style={styles.registerSkillText}>{t('skills.addSkill')}</Text>
        </TouchableOpacity>
      )}

      {/* Skill Detail Modal */}
      <Modal visible={!!detailSkill} animationType="slide" presentationStyle="pageSheet">
        {detailSkill && (
          <SkillDetail
            skill={detailSkill}
            onClose={() => setDetailSkill(null)}
            onInstall={(name) => {
              installSkill(name);
              setDetailSkill((prev) => prev ? { ...prev, installed: true } : null);
            }}
            onUninstall={(name) => {
              uninstallSkill(name);
              setDetailSkill((prev) => prev ? { ...prev, installed: false } : null);
            }}
          />
        )}
      </Modal>

      {/* Add Skill Menu Modal */}
      <Modal visible={addSkillMode === 'menu'} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.addSkillMenuContainer, { paddingTop: 60 }]}>
          <View style={styles.addSkillMenuHeader}>
            <TouchableOpacity onPress={() => setAddSkillMode(null)} style={styles.addSkillMenuClose}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
            <Text style={styles.addSkillMenuTitle}>{t('skills.addSkillTitle')}</Text>
          </View>
          <View style={styles.addSkillMenuBody}>
            <TouchableOpacity style={styles.addSkillOptionCard} onPress={() => setAddSkillMode('http')}>
              <Text style={styles.addSkillOptionEmoji}>{'\u{1F310}'}</Text>
              <View style={styles.addSkillOptionText}>
                <Text style={styles.addSkillOptionTitle}>{t('skills.httpSkill')}</Text>
                <Text style={styles.addSkillOptionDesc}>{t('skills.httpSkillDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addSkillOptionCard} onPress={() => setAddSkillMode('mcp')}>
              <Text style={styles.addSkillOptionEmoji}>{'\u{1F50C}'}</Text>
              <View style={styles.addSkillOptionText}>
                <Text style={styles.addSkillOptionTitle}>{t('skills.mcpServer')}</Text>
                <Text style={styles.addSkillOptionDesc}>{t('skills.mcpServerDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addSkillOptionCard} onPress={() => setAddSkillMode('skillmd')}>
              <Text style={styles.addSkillOptionEmoji}>{'\u{1F4DD}'}</Text>
              <View style={styles.addSkillOptionText}>
                <Text style={styles.addSkillOptionTitle}>{t('skills.skillMd')}</Text>
                <Text style={styles.addSkillOptionDesc}>{t('skills.skillMdDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#666" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* HTTP Skill Form Modal */}
      <Modal visible={addSkillMode === 'http'} animationType="slide" presentationStyle="pageSheet">
        <RegisterSkillForm
          serverUrl={serverUrl || ''}
          authToken={authToken || ''}
          onClose={() => setAddSkillMode(null)}
          onRegistered={() => { handleRefresh(); setAddSkillMode(null); }}
        />
      </Modal>

      {/* MCP Server Form Modal */}
      <Modal visible={addSkillMode === 'mcp'} animationType="slide" presentationStyle="pageSheet">
        <AddMcpServerForm
          serverUrl={serverUrl || ''}
          authToken={authToken || ''}
          onClose={() => setAddSkillMode(null)}
          onAdded={() => handleRefresh()}
        />
      </Modal>

      {/* SKILL.md Import Form Modal */}
      <Modal visible={addSkillMode === 'skillmd'} animationType="slide" presentationStyle="pageSheet">
        <ImportSkillMdForm
          serverUrl={serverUrl || ''}
          authToken={authToken || ''}
          onClose={() => setAddSkillMode(null)}
          onImported={() => { handleRefresh(); setAddSkillMode(null); }}
        />
      </Modal>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 0,
  },
  categoryBar: {
    maxHeight: 44,
    marginTop: 8,
  },
  categoryBarContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  categoryChipActive: {
    backgroundColor: '#6c63ff22',
    borderColor: '#6c63ff',
  },
  categoryChipEmoji: {
    fontSize: 14,
  },
  categoryChipText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#6c63ff',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginTop: 4,
  },
  groupTitle: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '700',
  },
  groupCount: {
    color: '#666',
    fontSize: 12,
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
  registerSkillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2d2d44',
  },
  registerSkillText: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '600',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  typeBadgeEmoji: {
    fontSize: 10,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  envFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 2,
  },
  envFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  envFilterChipActive: {
    backgroundColor: '#6c63ff22',
    borderColor: '#6c63ff',
  },
  envFilterChipEmoji: {
    fontSize: 12,
  },
  envFilterChipText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '500',
  },
  envFilterChipTextActive: {
    color: '#6c63ff',
  },
  addSkillMenuContainer: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  addSkillMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  addSkillMenuClose: {
    padding: 6,
    marginRight: 8,
  },
  addSkillMenuTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  addSkillMenuBody: {
    padding: 16,
    gap: 10,
  },
  addSkillOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d2d44',
    gap: 12,
  },
  addSkillOptionEmoji: {
    fontSize: 24,
  },
  addSkillOptionText: {
    flex: 1,
    gap: 2,
  },
  addSkillOptionTitle: {
    color: '#e0e0e0',
    fontSize: 15,
    fontWeight: '600',
  },
  addSkillOptionDesc: {
    color: '#888',
    fontSize: 12,
  },
});
