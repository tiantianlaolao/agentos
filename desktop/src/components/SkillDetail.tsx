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
}

interface Props {
  skill: SkillLibraryItem;
  onClose: () => void;
  onInstall: (name: string) => void;
  onUninstall: (name: string) => void;
}

const AUDIT_INFO: Record<string, { label: string; color: string; desc: string }> = {
  platform: { label: 'Official', color: '#22c55e', desc: 'Developed and maintained by AgentOS team' },
  ecosystem: { label: 'Reviewed', color: '#eab308', desc: 'Reviewed by agent ecosystem community' },
  unreviewed: { label: 'Unreviewed', color: '#9ca3af', desc: 'User assumes risk when using this skill' },
};

const PERM_INFO: Record<string, { label: string; desc: string }> = {
  network: { label: 'Network', desc: 'Make HTTP/WS requests' },
  filesystem: { label: 'File System', desc: 'Read/write files' },
  browser: { label: 'Browser', desc: 'Browser automation' },
  exec: { label: 'Execute', desc: 'Run system commands' },
  system: { label: 'System', desc: 'OS-level operations' },
  contacts: { label: 'Contacts', desc: 'Address book access' },
  location: { label: 'Location', desc: 'GPS access' },
  camera: { label: 'Camera', desc: 'Camera/photo access' },
};

export function SkillDetail({ skill, onClose, onInstall, onUninstall }: Props) {
  const badge = AUDIT_INFO[skill.audit] || AUDIT_INFO.unreviewed;

  return (
    <div className="skill-detail-panel">
      <div className="skill-detail-header">
        <button className="skills-back-btn" onClick={onClose}>
          &larr; Back
        </button>
        <h2 className="skills-title">Skill Details</h2>
      </div>

      <div className="skill-detail-content">
        {/* Hero */}
        <div className="skill-detail-hero">
          <span className="skill-detail-emoji">{skill.emoji || '🔧'}</span>
          <h3 className="skill-detail-name">{skill.name}</h3>
          <span className="skill-detail-version">v{skill.version}</span>
          <span className="skill-detail-author">by {skill.author}</span>
        </div>

        <p className="skill-detail-desc">{skill.description}</p>

        {/* Action */}
        <div className="skill-detail-action">
          {skill.installed ? (
            <button className="skill-uninstall-btn" onClick={() => onUninstall(skill.name)}>
              Uninstall
            </button>
          ) : (
            <button className="skill-install-btn-lg" onClick={() => onInstall(skill.name)}>
              Install
            </button>
          )}
        </div>

        {/* Audit */}
        <div className="skill-detail-section">
          <h4>Trust & Safety</h4>
          <div className="skill-detail-audit" style={{ borderColor: badge.color }}>
            <span style={{ color: badge.color, fontWeight: 700 }}>{badge.label}</span>
            <span className="skill-detail-audit-desc">{badge.desc}</span>
          </div>
        </div>

        {/* Permissions */}
        {skill.permissions && skill.permissions.length > 0 && (
          <div className="skill-detail-section">
            <h4>Required Permissions</h4>
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
            <h4>Functions ({skill.functions.length})</h4>
            {skill.functions.map((fn) => (
              <div key={fn.name} className="skill-detail-fn">
                <code className="skill-detail-fn-name">{fn.name}</code>
                <span className="skill-detail-fn-desc">{fn.description}</span>
              </div>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="skill-detail-section">
          <h4>Info</h4>
          <div className="skill-detail-meta-row">
            <span>Category</span>
            <span>{skill.category || 'general'}</span>
          </div>
          <div className="skill-detail-meta-row">
            <span>Environments</span>
            <span>{skill.environments.join(', ')}</span>
          </div>
          {skill.installCount > 0 && (
            <div className="skill-detail-meta-row">
              <span>Installs</span>
              <span>{skill.installCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
