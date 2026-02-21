import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore.ts';
import type { AgentMode, SkillManifestInfo } from '../types/index.ts';
import type { OpenClawDirectClient } from '../services/openclawDirect.ts';
import type { useWebSocket } from '../hooks/useWebSocket.ts';

type WsHandle = ReturnType<typeof useWebSocket>;

interface Props {
  onClose: () => void;
  openclawClient?: OpenClawDirectClient | null;
  ws?: WsHandle | null;
}

const AUDIT_BADGES: Record<string, { label: string; color: string }> = {
  platform: { label: 'Official', color: '#22c55e' },
  ecosystem: { label: 'Reviewed', color: '#eab308' },
  unreviewed: { label: 'Unreviewed', color: '#9ca3af' },
};

// Module-level cache keyed by source type
const skillsCache = new Map<string, SkillManifestInfo[]>();

function getCacheKey(mode: AgentMode, openclawSubMode?: string): string {
  if (mode === 'openclaw' && openclawSubMode === 'selfhosted') return 'openclaw-selfhosted';
  if (mode === 'openclaw') return 'openclaw-hosted';
  if (mode === 'copaw') return 'copaw';
  return 'builtin';
}

function canToggle(mode: AgentMode): boolean {
  return mode === 'builtin';
}

export function SkillsPanel({ onClose, openclawClient, ws }: Props) {
  const mode = useSettingsStore((s) => s.mode);
  const openclawSubMode = useSettingsStore((s) => s.openclawSubMode);
  const cacheKey = getCacheKey(mode, openclawSubMode);
  const cached = skillsCache.get(cacheKey) || null;
  const [skills, setSkills] = useState<SkillManifestInfo[]>(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
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

  // Track whether the WS callback is registered
  const wsCallbackRegistered = useRef(false);

  // Server-based: request via WS (listen for skill_list_response event)
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
    // (Re-)register callback — cacheKey may have changed
    ws.setOnSkillList((skills) => {
      skillsCache.set(cacheKey, skills);
      setSkills(skills);
      setLoading(false);
    });
    wsCallbackRegistered.current = true;
    ws.requestSkillList().catch(() => setLoading(false));
  }, [cacheKey, ws]);

  const handleRefresh = useCallback(() => {
    skillsCache.delete(cacheKey);
    if (mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient) {
      fetchDirectSkills(true);
    } else {
      requestSkillListWS(true);
    }
  }, [mode, openclawSubMode, openclawClient, fetchDirectSkills, requestSkillListWS, cacheKey]);

  // Cleanup WS callback on unmount
  useEffect(() => {
    return () => {
      if (ws && wsCallbackRegistered.current) {
        ws.setOnSkillList(null);
        wsCallbackRegistered.current = false;
      }
    };
  }, [ws]);

  useEffect(() => {
    if (mode === 'openclaw' && openclawSubMode === 'selfhosted' && openclawClient) {
      if (!skillsCache.has(cacheKey)) {
        fetchDirectSkills();
      }
    } else {
      requestSkillListWS();
    }
  }, [mode, openclawSubMode, openclawClient, cacheKey, fetchDirectSkills, requestSkillListWS]);

  const toggleSkill = useCallback((skillName: string, enabled: boolean) => {
    // Optimistic update
    setSkills((prev) => {
      const updated = prev.map((s) =>
        s.name === skillName ? { ...s, enabled } : s
      );
      skillsCache.set(cacheKey, updated);
      return updated;
    });
    // Send toggle via WS — server will respond with updated skill list
    if (ws) {
      ws.toggleSkill(skillName, enabled).catch(() => {});
    }
  }, [ws, cacheKey]);

  return (
    <div className="skills-panel">
      <div className="skills-header">
        <button className="skills-back-btn" onClick={onClose}>
          &larr; Back
        </button>
        <h2 className="skills-title">Skills</h2>
        <button className="skills-refresh-btn" onClick={handleRefresh} title="Refresh">
          Refresh
        </button>
      </div>

      <div className="skills-content">
        {loading ? (
          <div className="skills-loading">
            <div className="spinner" />
            <span>Loading skills...</span>
          </div>
        ) : skills.length === 0 ? (
          <div className="skills-empty">
            <span className="skills-empty-icon">?</span>
            <span>No skills registered</span>
            <span className="skills-empty-hint">
              Skills will appear here when connected to a server with registered skills.
            </span>
          </div>
        ) : (
          <div className="skills-list">
            {skills.map((skill) => {
              const badge = AUDIT_BADGES[skill.audit] || AUDIT_BADGES.unreviewed;
              const isExpanded = expandedSkill === skill.name;

              return (
                <div key={skill.name} className="skill-card">
                  <div className="skill-card-header">
                    <div className="skill-name-row">
                      {skill.emoji && <span className="skill-emoji">{skill.emoji}</span>}
                      <span className="skill-name">{skill.name}</span>
                      {skill.version && <span className="skill-version">v{skill.version}</span>}
                    </div>
                    {showToggle ? (
                      <label className="skill-toggle">
                        <input
                          type="checkbox"
                          checked={skill.enabled}
                          onChange={(e) => toggleSkill(skill.name, e.target.checked)}
                        />
                        <span className="skill-toggle-slider" />
                      </label>
                    ) : (
                      <span
                        className="skill-status-dot"
                        style={{ background: skill.enabled ? '#22c55e' : '#666' }}
                        title={skill.enabled ? 'Active' : 'Inactive'}
                      />
                    )}
                  </div>

                  <div className="skill-desc">{skill.description}</div>

                  <div className="skill-meta">
                    <span className="skill-audit-badge" style={{ borderColor: badge.color, color: badge.color }}>
                      {badge.label}
                      {skill.auditSource ? ` (${skill.auditSource})` : ''}
                    </span>
                    <span className="skill-author">by {skill.author}</span>
                  </div>

                  {skill.functions.length > 0 && (
                    <div className="skill-functions-section">
                      <button
                        className="skill-functions-toggle"
                        onClick={() => setExpandedSkill(isExpanded ? null : skill.name)}
                      >
                        {isExpanded ? 'Hide' : 'Show'} {skill.functions.length} function{skill.functions.length > 1 ? 's' : ''}
                      </button>
                      {isExpanded && (
                        <div className="skill-functions-list">
                          {skill.functions.map((fn) => (
                            <div key={fn.name} className="skill-function-row">
                              <span className="skill-function-name">{fn.name}</span>
                              <span className="skill-function-desc"> - {fn.description}</span>
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
        )}
      </div>
    </div>
  );
}
