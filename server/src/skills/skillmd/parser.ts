/**
 * SKILL.md Parser — Extracts YAML frontmatter and markdown body from SKILL.md files.
 *
 * Supports simple key-value YAML (no nested objects / arrays).
 * Does NOT introduce any external YAML dependency.
 */

export interface SkillMdParsed {
  name: string;
  description: string;
  version?: string;
  emoji?: string;
  body: string;
  /** Locale overrides extracted from frontmatter (e.g. name_zh, description_zh) */
  locales?: Record<string, { displayName?: string; description?: string }>;
}

/**
 * Parse a SKILL.md file content string.
 * Expects optional YAML frontmatter delimited by `---` at the top, followed by markdown body.
 *
 * @throws if `name` or `description` is missing from frontmatter.
 */
export function parseSkillMd(content: string): SkillMdParsed {
  const trimmed = content.trim();

  // Check for frontmatter (must start with ---)
  if (!trimmed.startsWith('---')) {
    throw new Error('SKILL.md must start with YAML frontmatter (---)');
  }

  // Find closing ---
  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) {
    throw new Error('SKILL.md frontmatter missing closing ---');
  }

  const frontmatterBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();

  // Parse simple key: value pairs
  const meta: Record<string, string> = {};
  for (const line of frontmatterBlock.split('\n')) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) continue;
    const colonIdx = stripped.indexOf(':');
    if (colonIdx === -1) continue;
    const key = stripped.slice(0, colonIdx).trim();
    let value = stripped.slice(colonIdx + 1).trim();
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  if (!meta.name) {
    throw new Error('SKILL.md frontmatter missing required field: name');
  }
  if (!meta.description) {
    throw new Error('SKILL.md frontmatter missing required field: description');
  }

  // Extract locale fields (name_{lang}, description_{lang})
  const locales: Record<string, { displayName?: string; description?: string }> = {};
  for (const [key, value] of Object.entries(meta)) {
    const nameMatch = key.match(/^name_([a-z]{2})$/);
    if (nameMatch) {
      const lang = nameMatch[1];
      if (!locales[lang]) locales[lang] = {};
      locales[lang].displayName = value;
    }
    const descMatch = key.match(/^description_([a-z]{2})$/);
    if (descMatch) {
      const lang = descMatch[1];
      if (!locales[lang]) locales[lang] = {};
      locales[lang].description = value;
    }
  }

  return {
    name: meta.name,
    description: meta.description,
    version: meta.version || undefined,
    emoji: meta.emoji || undefined,
    body,
    locales: Object.keys(locales).length > 0 ? locales : undefined,
  };
}
