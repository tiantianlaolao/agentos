import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSettingsStore } from '../stores/settingsStore.ts';
import type { AgentMode, SkillManifestInfo } from '../types/index.ts';
import type { OpenClawDirectClient } from '../services/openclawDirect.ts';
import type { useWebSocket } from '../hooks/useWebSocket.ts';
import { SkillDetail } from './SkillDetail.tsx';
import { RegisterSkillForm } from './RegisterSkillForm.tsx';
import { AddMcpServerForm } from './AddMcpServerForm.tsx';
import { ImportSkillMdForm } from './ImportSkillMdForm.tsx';
import { useTranslation } from '../i18n/index.ts';

type WsHandle = ReturnType<typeof useWebSocket>;

interface Props {
  onClose: () => void;
  openclawClient?: OpenClawDirectClient | null;
  ws?: WsHandle | null;
  serverUrl?: string;
  authToken?: string;
}

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

type TabKey = 'installed' | 'library';

const CATEGORIES = [
  { key: 'all', label: 'All', emoji: '📦' },
  { key: 'tools', label: 'Tools', emoji: '🛠️' },
  { key: 'knowledge', label: 'Knowledge', emoji: '📚' },
  { key: 'productivity', label: 'Productivity', emoji: '⚡' },
  { key: 'finance', label: 'Finance', emoji: '💰' },
  { key: 'creative', label: 'Creative', emoji: '🎨' },
] as const;

const AUDIT_BADGES: Record<string, { label: string; color: string }> = {
  platform: { label: 'Official', color: '#22c55e' },
  ecosystem: { label: 'Reviewed', color: '#eab308' },
  unreviewed: { label: 'Unreviewed', color: '#9ca3af' },
};

const ENV_LABELS: Record<string, string> = {
  cloud: 'Cloud',
  desktop: 'Desktop',
  mobile: 'Mobile',
};

function SkillTypeBadge({ name }: { name: string }) {
  if (name.startsWith('desktop-')) {
    return (
      <span
        style={{
          fontSize: '10px',
          fontWeight: 600,
          color: '#fff',
          background: '#6c63ff',
          borderRadius: '6px',
          padding: '1px 6px',
          marginLeft: '4px',
          whiteSpace: 'nowrap',
        }}
      >
        🖥️ Desktop
      </span>
    );
  }
  if (name.startsWith('mcp-')) {
    return (
      <span
        style={{
          fontSize: '10px',
          fontWeight: 600,
          color: '#fff',
          background: '#2d7d46',
          borderRadius: '6px',
          padding: '1px 6px',
          marginLeft: '4px',
          whiteSpace: 'nowrap',
        }}
      >
        🔌 MCP
      </span>
    );
  }
  return null;
}

// Module-level caches
const skillsCache = new Map<string, SkillManifestInfo[]>();
const libraryCache = new Map<string, SkillLibraryItem[]>();

function getCacheKey(mode: AgentMode, openclawSubMode?: string): string {
  if (mode === 'openclaw' && openclawSubMode === 'selfhosted') return 'openclaw-selfhosted';
  if (mode === 'openclaw') return 'openclaw-hosted';
  if (mode === 'copaw') return 'copaw';
  return 'builtin';
}

function canManageSkills(mode: AgentMode): boolean {
  return mode === 'builtin';
}

export function SkillsPanel({ onClose, openclawClient, ws, serverUrl, authToken }: Props) {
  const t = useTranslation();
  const locale = useSettingsStore((s) => s.locale);
  const loc = useCallback((skill: { name: string; description: string; locales?: Record<string, { displayName?: string; description?: string; functions?: Record<string, string> }> }) => ({
    name: skill.locales?.[locale]?.displayName ?? skill.name,
    desc: skill.locales?.[locale]?.description ?? skill.description,
    fnDesc: (fnName: string, fallback: string) => skill.locales?.[locale]?.functions?.[fnName] ?? fallback,
  }), [locale]);
  const mode = useSettingsStore((s) => s.mode);
  const openclawSubMode = useSettingsStore((s) => s.openclawSubMode);
  const cacheKey = getCacheKey(mode, openclawSubMode);
  const manageable = canManageSkills(mode);
  const [activeTab, setActiveTab] = useState<TabKey>('installed');
  const [skills, setSkills] = useState<SkillManifestInfo[]>(skillsCache.get(cacheKey) || []);
  const [library, setLibrary] = useState<SkillLibraryItem[]>(libraryCache.get(cacheKey) || []);
  const [loading, setLoading] = useState(!skillsCache.has(cacheKey));
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailSkillName, setDetailSkillName] = useState<string | null>(null);
  const detailSkill = useMemo(() => {
    if (!detailSkillName) return null;
    return library.find((s) => s.name === detailSkillName) || null;
  }, [detailSkillName, library]);
  const [addSkillMode, setAddSkillMode] = useState<null | 'menu' | 'http' | 'mcp' | 'skillmd'>(null);

  const wsCallbackRegistered = useRef(false);

  // Self-hosted OpenClaw: fetch skills directly
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

  // Server-based: request skills via WS
  const requestSkillListWS = useCallback((force = false) => {
    if (!force && skillsCache.has(cacheKey)) {
      setSkills(skillsCache.get(cacheKey)!);
      setLoading(false);
      return;
    }
    if (!ws) {
      setLoading(false);
      return;
    }
    setLoading(true);
    ws.setOnSkillList((skills) => {
      skillsCache.set(cacheKey, skills);
      setSkills(skills);
      setLoading(false);
    });
    wsCallbackRegistered.current = true;
    ws.requestSkillList().catch(() => setLoading(false));
  }, [cacheKey, ws]);

  // Request library via WS
  const requestLibrary = useCallback((force = false) => {
    if (!force && libraryCache.has(cacheKey)) {
      setLibrary(libraryCache.get(cacheKey)!);
      setLibraryLoading(false);
      return;
    }
    if (!ws) {
      setLibraryLoading(false);
      return;
    }
    setLibraryLoading(true);
    ws.setOnSkillLibrary?.((items: SkillLibraryItem[]) => {
      libraryCache.set(cacheKey, items);
      setLibrary(items);
      setLibraryLoading(false);
    });
    ws.requestSkillLibrary?.().catch(() => setLibraryLoading(false));
  }, [cacheKey, ws]);

  // Install skill (with permission confirmation for risky skills)
  const HIGH_RISK_PERMISSIONS = ['filesystem', 'exec', 'system', 'browser'];
  const installSkill = useCallback((skillName: string) => {
    if (!ws) return;
    const skill = library.find((s) => s.name === skillName);
    const riskyPerms = skill?.permissions?.filter((p: string) => HIGH_RISK_PERMISSIONS.includes(p)) || [];
    if (riskyPerms.length > 0) {
      const confirmed = window.confirm(
        `"${skillName}" requires the following permissions:\n\n${riskyPerms.join(', ')}\n\nDo you want to install it?`
      );
      if (!confirmed) return;
    }
    ws.installSkill?.(skillName).catch(() => {});
    // Optimistic update
    setLibrary((prev) => {
      const updated = prev.map((s) =>
        s.name === skillName ? { ...s, installed: true } : s
      );
      libraryCache.set(cacheKey, updated);
      return updated;
    });
  }, [ws, cacheKey, library]);

  // Uninstall skill
  const uninstallSkill = useCallback((skillName: string) => {
    if (!ws) return;
    ws.uninstallSkill?.(skillName).catch(() => {});
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
  }, [ws, cacheKey]);

  const handleRefresh = useCallback(() => {
    skillsCache.delete(cacheKey);
    libraryCache.delete(cacheKey);
    if (mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient) {
      fetchDirectSkills(true);
    } else {
      requestSkillListWS(true);
      if (activeTab === 'library') {
        requestLibrary(true);
      }
    }
  }, [mode, openclawSubMode, openclawClient, fetchDirectSkills, requestSkillListWS, requestLibrary, cacheKey, activeTab]);

  // Cleanup WS callback on unmount only
  const wsRef = useRef(ws);
  wsRef.current = ws;
  useEffect(() => {
    return () => {
      if (wsRef.current && wsCallbackRegistered.current) {
        wsRef.current.setOnSkillList(null);
        wsCallbackRegistered.current = false;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient) {
      if (!skillsCache.has(cacheKey)) {
        fetchDirectSkills();
      }
    } else {
      requestSkillListWS();
    }
  }, [mode, openclawSubMode, openclawClient, cacheKey, fetchDirectSkills, requestSkillListWS]);

  // Load library when tab switches
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
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((s) => {
        if (s.name.toLowerCase().includes(q)) return true;
        if (s.description.toLowerCase().includes(q)) return true;
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
  }, [library, selectedCategory, searchQuery]);

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

  const showTabs = manageable;
  const installedSkills = skills.filter((s) => s.installed !== false);

  // Show detail view when a skill is selected
  if (detailSkill) {
    return (
      <SkillDetail
        skill={detailSkill}
        onClose={() => setDetailSkillName(null)}
        onInstall={installSkill}
        onUninstall={uninstallSkill}
      />
    );
  }

  return (
    <div className="skills-panel">
      <div className="skills-header">
        <button className="skills-back-btn" onClick={onClose}>
          {'\u2190 ' + t('skills.back')}
        </button>
        <h2 className="skills-title">{t('skills.title')}</h2>
        <button className="skills-refresh-btn" onClick={handleRefresh} title={t('skills.refresh')}>
          {t('skills.refresh')}
        </button>
      </div>

      {showTabs && (
        <div className="skills-tab-bar">
          <button
            className={`skills-tab ${activeTab === 'installed' ? 'skills-tab-active' : ''}`}
            onClick={() => setActiveTab('installed')}
          >
            {t('skills.installed')} ({installedSkills.length})
          </button>
          <button
            className={`skills-tab ${activeTab === 'library' ? 'skills-tab-active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            {t('skills.library')}
          </button>
        </div>
      )}

      <div className="skills-content">
        {activeTab === 'installed' ? (
          loading ? (
            <div className="skills-loading">
              <div className="spinner" />
              <span>{t('skills.loadingSkills')}</span>
            </div>
          ) : installedSkills.length === 0 ? (
            <div className="skills-empty">
              <span className="skills-empty-icon">?</span>
              <span>{t('skills.noSkillsInstalled')}</span>
              {manageable && (
                <button className="skills-browse-btn" onClick={() => setActiveTab('library')}>
                  {t('skills.browseLibrary')}
                </button>
              )}
            </div>
          ) : (
            <div className="skills-list">
              {installedSkills.map((skill) => {
                const badge = AUDIT_BADGES[skill.audit] || AUDIT_BADGES.unreviewed;
                const isExpanded = expandedSkill === skill.name;

                return (
                  <div key={skill.name} className="skill-card">
                    <div className="skill-card-header">
                      <div className="skill-name-row">
                        {skill.emoji && <span className="skill-emoji">{skill.emoji}</span>}
                        <span className="skill-name">{loc(skill).name}</span>
                        {skill.version && <span className="skill-version">v{skill.version}</span>}
                        {(skill as any).visibility === 'private' && (
                          <span className="skill-private-badge">{t('skills.private')}</span>
                        )}
                        <SkillTypeBadge name={skill.name} />
                      </div>
                      {manageable ? (
                        <button
                          className="skill-uninstall-btn"
                          onClick={() => uninstallSkill(skill.name)}
                        >
                          {t('skills.uninstall')}
                        </button>
                      ) : (
                        <span
                          className="skill-status-dot"
                          style={{ background: skill.enabled ? '#22c55e' : '#666' }}
                          title={skill.enabled ? 'Active' : 'Inactive'}
                        />
                      )}
                    </div>

                    <div className="skill-desc">{loc(skill).desc}</div>

                    <div className="skill-meta">
                      <span className="skill-audit-badge" style={{ borderColor: badge.color, color: badge.color }}>
                        {badge.label}
                        {skill.auditSource ? ` (${skill.auditSource})` : ''}
                      </span>
                      {skill.environments && skill.environments.length > 0 && (
                        <span className="skill-env-tags">
                          {skill.environments.map((env) => (
                            <span key={env} className="skill-env-tag">
                              {ENV_LABELS[env] || env}
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="skill-author">{t('skills.by')} {skill.author}</span>
                    </div>

                    {skill.functions.length > 0 && (
                      <div className="skill-functions-section">
                        <button
                          className="skill-functions-toggle"
                          onClick={() => setExpandedSkill(isExpanded ? null : skill.name)}
                        >
                          {isExpanded ? t('skills.hide') : t('skills.show')} {skill.functions.length} {t('skills.functions')}
                        </button>
                        {isExpanded && (
                          <div className="skill-functions-list">
                            {skill.functions.map((fn) => (
                              <div key={fn.name} className="skill-function-row">
                                <span className="skill-function-name">{fn.name}</span>
                                <span className="skill-function-desc"> - {loc(skill).fnDesc(fn.name, fn.description)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          libraryLoading ? (
            <div className="skills-loading">
              <div className="spinner" />
              <span>{t('skills.loadingLibrary')}</span>
            </div>
          ) : library.length === 0 ? (
            <div className="skills-empty">
              <span className="skills-empty-icon">?</span>
              <span>{t('skills.noSkillsAvailable')}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Search Bar */}
              <div className="skills-search-bar">
                <input
                  type="text"
                  className="skills-search-input"
                  placeholder={t('skills.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="skills-search-clear" onClick={() => setSearchQuery('')}>
                    &times;
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="skills-category-bar">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    className={`skills-category-chip ${selectedCategory === cat.key ? 'skills-category-chip-active' : ''}`}
                    onClick={() => setSelectedCategory(cat.key)}
                  >
                    <span>{cat.emoji}</span> {cat.label}
                  </button>
                ))}
              </div>

              {/* Grouped Library */}
              <div className="skills-list" style={{ flex: 1, overflowY: 'auto' }}>
                {groupedLibrary.length === 0 ? (
                  <div className="skills-empty">
                    <span>{t('skills.noMatch')}</span>
                  </div>
                ) : (
                  groupedLibrary.map((group) => (
                    <div key={group.category}>
                      {selectedCategory === 'all' && (
                        <div className="skills-group-header">
                          <span>
                            {CATEGORIES.find((c) => c.key === group.category)?.emoji || '📦'}{' '}
                            {group.category.charAt(0).toUpperCase() + group.category.slice(1)}
                          </span>
                          <span className="skills-group-count">{group.items.length}</span>
                        </div>
                      )}
                      {group.items.map((skill) => {
                        const badge = AUDIT_BADGES[skill.audit] || AUDIT_BADGES.unreviewed;

                        return (
                          <div key={skill.name} className="skill-card" onClick={() => setDetailSkillName(skill.name)} style={{ cursor: 'pointer' }}>
                            <div className="skill-card-header">
                              <div className="skill-name-row">
                                {skill.emoji && <span className="skill-emoji">{skill.emoji}</span>}
                                <span className="skill-name">{loc(skill).name}</span>
                                {skill.version && <span className="skill-version">v{skill.version}</span>}
                                {skill.visibility === 'private' && (
                                  <span className="skill-private-badge">{t('skills.private')}</span>
                                )}
                                <SkillTypeBadge name={skill.name} />
                              </div>
                              {skill.installed ? (
                                <span className="skill-installed-badge">{t('skills.installedBadge')}</span>
                              ) : (
                                <button
                                  className="skill-install-btn"
                                  onClick={(e) => { e.stopPropagation(); installSkill(skill.name); }}
                                >
                                  {t('skills.install')}
                                </button>
                              )}
                            </div>

                            <div className="skill-desc">{loc(skill).desc}</div>

                            <div className="skill-meta">
                              <span className="skill-audit-badge" style={{ borderColor: badge.color, color: badge.color }}>
                                {badge.label}
                              </span>
                              {skill.environments && skill.environments.length > 0 && (
                                <span className="skill-env-tags">
                                  {skill.environments.map((env) => (
                                    <span key={env} className="skill-env-tag">
                                      {ENV_LABELS[env] || env}
                                    </span>
                                  ))}
                                </span>
                              )}
                              <span className="skill-author">{t('skills.by')} {skill.author}</span>
                            </div>

                            {skill.functions.length > 0 && (
                              <div className="skill-functions-section">
                                <div className="skill-functions-list">
                                  {skill.functions.map((fn) => (
                                    <div key={fn.name} className="skill-function-row">
                                      <span className="skill-function-name">{fn.name}</span>
                                      <span className="skill-function-desc"> - {loc(skill).fnDesc(fn.name, fn.description)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Add Skill Button */}
      {manageable && authToken && serverUrl && (
        <div className="skills-register-bar">
          <button className="skills-register-btn" onClick={() => setAddSkillMode('menu')}>
            {t('skills.addSkill')}
          </button>
        </div>
      )}

      {/* Add Skill Menu */}
      {addSkillMode === 'menu' && (
        <div className="register-skill-overlay">
          <div className="register-skill-panel">
            <div className="register-skill-header">
              <button className="skills-back-btn" onClick={() => setAddSkillMode(null)}>{'\u2190 ' + t('skills.back')}</button>
              <h2 className="skills-title">{t('skills.addSkillTitle')}</h2>
            </div>
            <div className="register-skill-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="add-skill-option-card"
                onClick={() => setAddSkillMode('http')}
                style={{
                  background: '#1a1a2e',
                  border: '1px solid #2d2d44',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#e0e0e0' }}>
                  <span style={{ marginRight: '8px' }}>&#x1F310;</span>{t('skills.httpSkill')}
                </span>
                <span style={{ fontSize: '12px', color: '#888' }}>
                  {t('skills.httpSkillDesc')}
                </span>
              </button>
              <button
                className="add-skill-option-card"
                onClick={() => setAddSkillMode('mcp')}
                style={{
                  background: '#1a1a2e',
                  border: '1px solid #2d2d44',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#e0e0e0' }}>
                  <span style={{ marginRight: '8px' }}>&#x1F50C;</span>{t('skills.mcpServer')}
                </span>
                <span style={{ fontSize: '12px', color: '#888' }}>
                  {t('skills.mcpServerDesc')}
                </span>
              </button>
              <button
                className="add-skill-option-card"
                onClick={() => setAddSkillMode('skillmd')}
                style={{
                  background: '#1a1a2e',
                  border: '1px solid #2d2d44',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#e0e0e0' }}>
                  <span style={{ marginRight: '8px' }}>&#x1F4DD;</span>{t('skills.skillMd')}
                </span>
                <span style={{ fontSize: '12px', color: '#888' }}>
                  {t('skills.skillMdDesc')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTTP Skill Form */}
      {addSkillMode === 'http' && serverUrl && authToken && (
        <RegisterSkillForm
          serverUrl={serverUrl}
          authToken={authToken}
          onClose={() => setAddSkillMode(null)}
          onRegistered={() => { handleRefresh(); setAddSkillMode(null); }}
        />
      )}

      {/* MCP Server Form */}
      {addSkillMode === 'mcp' && serverUrl && authToken && (
        <AddMcpServerForm
          serverUrl={serverUrl}
          authToken={authToken}
          onClose={() => setAddSkillMode(null)}
          onAdded={() => handleRefresh()}
        />
      )}

      {/* SKILL.md Import Form */}
      {addSkillMode === 'skillmd' && serverUrl && authToken && (
        <ImportSkillMdForm
          serverUrl={serverUrl}
          authToken={authToken}
          onClose={() => setAddSkillMode(null)}
          onImported={() => { handleRefresh(); setAddSkillMode(null); }}
        />
      )}
    </div>
  );
}
