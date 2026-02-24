/**
 * SkillDetail — Full detail view for a Skill in the desktop app.
 * Includes configuration form for skills that have config fields.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n/index.ts';
import { useSettingsStore } from '../stores/settingsStore.ts';
import type { useWebSocket } from '../hooks/useWebSocket.ts';

type WsHandle = ReturnType<typeof useWebSocket>;

interface SkillLibraryItem {
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  emoji?: string;
  environments: string[];
  permissions: string[];
  audit: string;
  auditSource?: string;
  visibility: string;
  installed: boolean;
  isDefault: boolean;
  installCount: number;
  functions: Array<{ name: string; description: string }>;
  locales?: Record<string, { displayName?: string; description?: string; functions?: Record<string, string> }>;
}

interface ConfigField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  secret?: boolean;
  description?: string;
}

interface Props {
  skill: SkillLibraryItem;
  onClose: () => void;
  onInstall: (name: string) => void;
  onUninstall: (name: string) => void;
  ws?: WsHandle | null;
}

function getAuditInfo(t: (key: string) => string): Record<string, { label: string; color: string; desc: string }> {
  return {
    platform: { label: t('skillDetail.auditOfficial'), color: '#22c55e', desc: t('skillDetail.auditOfficialDesc') },
    ecosystem: { label: t('skillDetail.auditReviewed'), color: '#eab308', desc: t('skillDetail.auditReviewedDesc') },
    unreviewed: { label: t('skillDetail.auditUnreviewed'), color: '#9ca3af', desc: t('skillDetail.auditUnreviewedDesc') },
  };
}

function getPermInfo(t: (key: string) => string): Record<string, { label: string; desc: string }> {
  return {
    network: { label: t('skillDetail.permNetwork'), desc: t('skillDetail.permNetworkDesc') },
    filesystem: { label: t('skillDetail.permFilesystem'), desc: t('skillDetail.permFilesystemDesc') },
    browser: { label: t('skillDetail.permBrowser'), desc: t('skillDetail.permBrowserDesc') },
    exec: { label: t('skillDetail.permExec'), desc: t('skillDetail.permExecDesc') },
    system: { label: t('skillDetail.permSystem'), desc: t('skillDetail.permSystemDesc') },
    contacts: { label: t('skillDetail.permContacts'), desc: t('skillDetail.permContactsDesc') },
    location: { label: t('skillDetail.permLocation'), desc: t('skillDetail.permLocationDesc') },
    camera: { label: t('skillDetail.permCamera'), desc: t('skillDetail.permCameraDesc') },
  };
}

export function SkillDetail({ skill, onClose, onInstall, onUninstall, ws }: Props) {
  const t = useTranslation();
  const locale = useSettingsStore((s) => s.locale);
  const AUDIT_INFO = getAuditInfo(t);
  const PERM_INFO = getPermInfo(t);
  const displayName = skill.locales?.[locale]?.displayName ?? skill.name;
  const displayDesc = skill.locales?.[locale]?.description ?? skill.description;
  const fnDesc = (fnName: string, fallback: string) => skill.locales?.[locale]?.functions?.[fnName] ?? fallback;
  const badge = AUDIT_INFO[skill.audit] || AUDIT_INFO.unreviewed;

  // Config state
  const [configFields, setConfigFields] = useState<ConfigField[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Fetch config on mount
  useEffect(() => {
    if (!ws || !skill.installed) return;

    setConfigLoading(true);
    ws.setOnSkillConfig((data: { skillName: string; config: Record<string, unknown>; fields: ConfigField[] }) => {
      if (data.skillName === skill.name) {
        setConfigFields(data.fields || []);
        setConfigValues(data.config || {});
        setConfigDraft(data.config || {});
        setConfigLoading(false);
      }
    });

    ws.requestSkillConfig(skill.name);

    return () => {
      ws.setOnSkillConfig(null);
    };
  }, [ws, skill.name, skill.installed]);

  const handleConfigChange = useCallback((key: string, value: string) => {
    setConfigDraft((prev) => ({ ...prev, [key]: value }));
    setConfigSaved(false);
  }, []);

  const handleConfigSave = useCallback(() => {
    if (!ws) return;
    ws.saveSkillConfig(skill.name, configDraft);
    setConfigValues(configDraft);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
  }, [ws, skill.name, configDraft]);

  const toggleSecretVisibility = useCallback((key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const hasConfigChanges = JSON.stringify(configDraft) !== JSON.stringify(configValues);

  return (
    <div className="skill-detail-panel">
      <div className="skill-detail-header">
        <button className="skills-back-btn" onClick={onClose}>
          {'\u2190 ' + t('skillDetail.back')}
        </button>
        <h2 className="skills-title">{t('skillDetail.title')}</h2>
      </div>

      <div className="skill-detail-content">
        {/* Hero */}
        <div className="skill-detail-hero">
          <span className="skill-detail-emoji">{skill.emoji || '🔧'}</span>
          <h3 className="skill-detail-name">{displayName}</h3>
          <span className="skill-detail-version">v{skill.version}</span>
          <span className="skill-detail-author">by {skill.author}</span>
        </div>

        <p className="skill-detail-desc">{displayDesc}</p>

        {/* Action */}
        <div className="skill-detail-action">
          {skill.installed ? (
            <button className="skill-uninstall-btn" onClick={() => onUninstall(skill.name)}>
              {t('skillDetail.uninstall')}
            </button>
          ) : (
            <button className="skill-install-btn-lg" onClick={() => onInstall(skill.name)}>
              {t('skillDetail.install')}
            </button>
          )}
        </div>

        {/* Configuration */}
        {skill.installed && configFields.length > 0 && (
          <div className="skill-detail-section">
            <h4>{t('skillDetail.configuration')}</h4>
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
              {t('skillDetail.configDesc')}
            </p>
            {configLoading ? (
              <p style={{ color: '#666', fontSize: '13px' }}>Loading...</p>
            ) : (
              <>
                {configFields.map((field) => (
                  <div key={field.key} style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', color: '#ccc', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                      {field.label}
                      {field.required && (
                        <span style={{ color: '#ef4444', marginLeft: '4px', fontSize: '11px' }}>
                          {t('skillDetail.configRequired')}
                        </span>
                      )}
                    </label>
                    {field.description && (
                      <p style={{ color: '#666', fontSize: '11px', margin: '0 0 4px 0' }}>{field.description}</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type={field.secret && !showSecrets[field.key] ? 'password' : 'text'}
                        value={String(configDraft[field.key] ?? '')}
                        onChange={(e) => handleConfigChange(field.key, e.target.value)}
                        placeholder={field.label}
                        style={{
                          flex: 1,
                          background: '#1a1a2e',
                          border: '1px solid #2d2d44',
                          borderRadius: '8px',
                          color: '#fff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none',
                        }}
                      />
                      {field.secret && (
                        <button
                          onClick={() => toggleSecretVisibility(field.key)}
                          style={{
                            background: 'none',
                            border: '1px solid #2d2d44',
                            borderRadius: '6px',
                            color: '#888',
                            padding: '6px 8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          {showSecrets[field.key] ? '🙈' : '👁'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleConfigSave}
                  disabled={!hasConfigChanges && !configSaved}
                  style={{
                    background: configSaved ? '#22c55e' : hasConfigChanges ? '#6c63ff' : '#333',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 24px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: hasConfigChanges ? 'pointer' : 'default',
                    opacity: hasConfigChanges || configSaved ? 1 : 0.5,
                    transition: 'all 0.2s',
                  }}
                >
                  {configSaved ? t('skillDetail.configSaved') : t('skillDetail.configSave')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Audit */}
        <div className="skill-detail-section">
          <h4>{t('skillDetail.trustSafety')}</h4>
          <div className="skill-detail-audit" style={{ borderColor: badge.color }}>
            <span style={{ color: badge.color, fontWeight: 700 }}>{badge.label}</span>
            <span className="skill-detail-audit-desc">{badge.desc}</span>
          </div>
        </div>

        {/* Permissions */}
        {skill.permissions && skill.permissions.length > 0 && (
          <div className="skill-detail-section">
            <h4>{t('skillDetail.permissions')}</h4>
            {skill.permissions.map((perm) => {
              const info = PERM_INFO[perm] || { label: perm, desc: '' };
              return (
                <div key={perm} className="skill-detail-perm">
                  <span className="skill-detail-perm-label">{info.label}</span>
                  <span className="skill-detail-perm-desc">{info.desc}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Functions */}
        {skill.functions.length > 0 && (
          <div className="skill-detail-section">
            <h4>{t('skillDetail.functions')} ({skill.functions.length})</h4>
            {skill.functions.map((fn) => (
              <div key={fn.name} className="skill-detail-fn">
                <code className="skill-detail-fn-name">{fn.name}</code>
                <span className="skill-detail-fn-desc">{fnDesc(fn.name, fn.description)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="skill-detail-section">
          <h4>{t('skillDetail.info')}</h4>
          <div className="skill-detail-meta-row">
            <span>{t('skillDetail.category')}</span>
            <span>{skill.category || 'general'}</span>
          </div>
          <div className="skill-detail-meta-row">
            <span>{t('skillDetail.environments')}</span>
            <span>{skill.environments.join(', ')}</span>
          </div>
          {skill.installCount > 0 && (
            <div className="skill-detail-meta-row">
              <span>{t('skillDetail.installs')}</span>
              <span>{skill.installCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
