/**
 * SkillDetail — Full-screen detail view for a Skill.
 *
 * Shows emoji, description, function list, permissions, audit status, install button.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SkillLibraryItem } from '../../types/protocol';

interface Props {
  skill: SkillLibraryItem;
  onClose: () => void;
  onInstall: (name: string) => void;
  onUninstall: (name: string) => void;
}

const AUDIT_BADGES: Record<string, { label: string; color: string; desc: string }> = {
  platform: { label: 'Official', color: '#22c55e', desc: 'Developed and maintained by AgentOS team' },
  ecosystem: { label: 'Reviewed', color: '#eab308', desc: 'Reviewed by agent ecosystem community' },
  unreviewed: { label: 'Unreviewed', color: '#9ca3af', desc: 'User assumes risk when using this skill' },
};

const PERMISSION_LABELS: Record<string, { icon: string; label: string; desc: string }> = {
  network: { icon: 'globe-outline', label: 'Network', desc: 'Make HTTP/WS requests' },
  filesystem: { icon: 'folder-outline', label: 'File System', desc: 'Read/write files' },
  browser: { icon: 'browsers-outline', label: 'Browser', desc: 'Browser automation' },
  exec: { icon: 'terminal-outline', label: 'Execute', desc: 'Run system commands' },
  system: { icon: 'settings-outline', label: 'System', desc: 'OS-level operations' },
  contacts: { icon: 'people-outline', label: 'Contacts', desc: 'Address book access' },
  location: { icon: 'location-outline', label: 'Location', desc: 'GPS access' },
  camera: { icon: 'camera-outline', label: 'Camera', desc: 'Camera/photo access' },
};

export default function SkillDetail({ skill, onClose, onInstall, onUninstall }: Props) {
  const badge = AUDIT_BADGES[skill.audit] || AUDIT_BADGES.unreviewed;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="arrow-back" size={22} color="#6c63ff" />
        </TouchableOpacity>
        <Text style={styles.title}>Skill Details</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{skill.emoji || '🔧'}</Text>
          <Text style={styles.heroName}>{skill.name}</Text>
          <Text style={styles.heroVersion}>v{skill.version}</Text>
          <Text style={styles.heroAuthor}>by {skill.author}</Text>
        </View>

        {/* Description */}
        <Text style={styles.description}>{skill.description}</Text>

        {/* Action Button */}
        <View style={styles.actionRow}>
          {skill.installed ? (
            <TouchableOpacity
              style={styles.uninstallBtn}
              onPress={() => onUninstall(skill.name)}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={styles.uninstallText}>Uninstall</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.installBtn}
              onPress={() => onInstall(skill.name)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.installText}>Install</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Audit Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trust & Safety</Text>
          <View style={[styles.auditCard, { borderColor: badge.color }]}>
            <Text style={[styles.auditLabel, { color: badge.color }]}>{badge.label}</Text>
            <Text style={styles.auditDesc}>{badge.desc}</Text>
            {skill.auditSource && (
              <Text style={styles.auditSource}>Source: {skill.auditSource}</Text>
            )}
          </View>
        </View>

        {/* Permissions */}
        {skill.permissions && skill.permissions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Required Permissions</Text>
            {skill.permissions.map((perm) => {
              const info = PERMISSION_LABELS[perm] || { icon: 'help-circle-outline', label: perm, desc: '' };
              return (
                <View key={perm} style={styles.permRow}>
                  <Ionicons name={info.icon as keyof typeof Ionicons.glyphMap} size={18} color="#888" />
                  <View style={styles.permInfo}>
                    <Text style={styles.permLabel}>{info.label}</Text>
                    <Text style={styles.permDesc}>{info.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Functions */}
        {skill.functions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Functions ({skill.functions.length})</Text>
            {skill.functions.map((fn) => (
              <View key={fn.name} style={styles.fnCard}>
                <Text style={styles.fnName}>{fn.name}</Text>
                <Text style={styles.fnDesc}>{fn.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Meta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Info</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Category</Text>
            <Text style={styles.metaValue}>{skill.category || 'general'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Environments</Text>
            <Text style={styles.metaValue}>{skill.environments.join(', ')}</Text>
          </View>
          {skill.installCount > 0 && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Installs</Text>
              <Text style={styles.metaValue}>{skill.installCount}</Text>
            </View>
          )}
          {skill.isDefault && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Default</Text>
              <Text style={styles.metaValue}>Auto-installed for new users</Text>
            </View>
          )}
        </View>
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
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 20,
    paddingBottom: 60,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  heroEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  heroName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  heroVersion: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
  },
  heroAuthor: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  description: {
    color: '#bbb',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6c63ff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  installText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  uninstallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  uninstallText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#6c63ff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  auditCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#1a1a2e',
  },
  auditLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  auditDesc: {
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
  },
  auditSource: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  permInfo: {
    flex: 1,
  },
  permLabel: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  permDesc: {
    color: '#666',
    fontSize: 12,
  },
  fnCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  fnName: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  fnDesc: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2d2d44',
  },
  metaLabel: {
    color: '#888',
    fontSize: 13,
  },
  metaValue: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '500',
  },
});
