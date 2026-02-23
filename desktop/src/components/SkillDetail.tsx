/**
 * SkillDetail — Full detail view for a Skill in the desktop app.
 */

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

import { useTranslation } from '../i18n/index.ts';
import { useSettingsStore } from '../stores/settingsStore.ts';

interface Props {
  skill: SkillLibraryItem;
  onClose: () => void;
  onInstall: (name: string) => void;
  onUninstall: (name: string) => void;
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

export function SkillDetail({ skill, onClose, onInstall, onUninstall }: Props) {
  const t = useTranslation();
  const locale = useSettingsStore((s) => s.locale);
  const AUDIT_INFO = getAuditInfo(t);
  const PERM_INFO = getPermInfo(t);
  const displayName = skill.locales?.[locale]?.displayName ?? skill.name;
  const displayDesc = skill.locales?.[locale]?.description ?? skill.description;
  const fnDesc = (fnName: string, fallback: string) => skill.locales?.[locale]?.functions?.[fnName] ?? fallback;
  const badge = AUDIT_INFO[skill.audit] || AUDIT_INFO.unreviewed;

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
