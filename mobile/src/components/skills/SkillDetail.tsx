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
import { useTranslation } from '../../i18n';
import { useSettingsStore } from '../../stores/settingsStore';
import type { SkillLibraryItem } from '../../types/protocol';

interface Props {
  skill: SkillLibraryItem;
  onClose: () => void;
  onInstall: (name: string) => void;
  onUninstall: (name: string) => void;
}

function getAuditBadges(t: (key: string) => string): Record<string, { label: string; color: string; desc: string }> {
  return {
    platform: { label: t('skillDetail.auditOfficial'), color: '#22c55e', desc: t('skillDetail.auditOfficialDesc') },
    ecosystem: { label: t('skillDetail.auditReviewed'), color: '#eab308', desc: t('skillDetail.auditReviewedDesc') },
    unreviewed: { label: t('skillDetail.auditUnreviewed'), color: '#9ca3af', desc: t('skillDetail.auditUnreviewedDesc') },
  };
}

function getPermissionLabels(t: (key: string) => string): Record<string, { icon: string; label: string; desc: string }> {
  return {
    network: { icon: 'globe-outline', label: t('skillDetail.permNetwork'), desc: t('skillDetail.permNetworkDesc') },
    filesystem: { icon: 'folder-outline', label: t('skillDetail.permFilesystem'), desc: t('skillDetail.permFilesystemDesc') },
    browser: { icon: 'browsers-outline', label: t('skillDetail.permBrowser'), desc: t('skillDetail.permBrowserDesc') },
    exec: { icon: 'terminal-outline', label: t('skillDetail.permExec'), desc: t('skillDetail.permExecDesc') },
    system: { icon: 'settings-outline', label: t('skillDetail.permSystem'), desc: t('skillDetail.permSystemDesc') },
    contacts: { icon: 'people-outline', label: t('skillDetail.permContacts'), desc: t('skillDetail.permContactsDesc') },
    location: { icon: 'location-outline', label: t('skillDetail.permLocation'), desc: t('skillDetail.permLocationDesc') },
    camera: { icon: 'camera-outline', label: t('skillDetail.permCamera'), desc: t('skillDetail.permCameraDesc') },
  };
}

export default function SkillDetail({ skill, onClose, onInstall, onUninstall }: Props) {
  const t = useTranslation();
  const locale = useSettingsStore((s) => s.locale);
  const AUDIT_BADGES = getAuditBadges(t);
  const PERMISSION_LABELS = getPermissionLabels(t);
  const badge = AUDIT_BADGES[skill.audit] || AUDIT_BADGES.unreviewed;
  const displayName = skill.locales?.[locale]?.displayName ?? skill.name;
  const displayDesc = skill.locales?.[locale]?.description ?? skill.description;
  const fnDesc = (fnName: string, fallback: string) => skill.locales?.[locale]?.functions?.[fnName] ?? fallback;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="arrow-back" size={22} color="#6c63ff" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('skillDetail.title')}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{skill.emoji || '🔧'}</Text>
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.heroVersion}>v{skill.version}</Text>
          <Text style={styles.heroAuthor}>by {skill.author}</Text>
        </View>

        {/* Description */}
        <Text style={styles.description}>{displayDesc}</Text>

        {/* Action Button */}
        <View style={styles.actionRow}>
          {skill.installed ? (
            <TouchableOpacity
              style={styles.uninstallBtn}
              onPress={() => onUninstall(skill.name)}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={styles.uninstallText}>{t('skillDetail.uninstall')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.installBtn}
              onPress={() => onInstall(skill.name)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.installText}>{t('skillDetail.install')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Audit Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('skillDetail.trustSafety')}</Text>
          <View style={[styles.auditCard, { borderColor: badge.color }]}>
            <Text style={[styles.auditLabel, { color: badge.color }]}>{badge.label}</Text>
            <Text style={styles.auditDesc}>{badge.desc}</Text>
            {skill.auditSource && (
              <Text style={styles.auditSource}>{t('skillDetail.source')}: {skill.auditSource}</Text>
            )}
          </View>
        </View>

        {/* Permissions */}
        {skill.permissions && skill.permissions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('skillDetail.permissions')}</Text>
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
            <Text style={styles.sectionTitle}>{t('skillDetail.functions')} ({skill.functions.length})</Text>
            {skill.functions.map((fn) => (
              <View key={fn.name} style={styles.fnCard}>
                <Text style={styles.fnName}>{fn.name}</Text>
                <Text style={styles.fnDesc}>{fnDesc(fn.name, fn.description)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Meta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('skillDetail.info')}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('skillDetail.category')}</Text>
            <Text style={styles.metaValue}>{skill.category || 'general'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('skillDetail.environments')}</Text>
            <Text style={styles.metaValue}>{skill.environments.join(', ')}</Text>
          </View>
          {skill.installCount > 0 && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('skillDetail.installs')}</Text>
              <Text style={styles.metaValue}>{skill.installCount}</Text>
            </View>
          )}
          {skill.isDefault && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('skillDetail.defaultSkill')}</Text>
              <Text style={styles.metaValue}>{t('skillDetail.defaultDesc')}</Text>
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
