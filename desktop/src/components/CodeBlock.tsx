import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from '../i18n/index.ts';

// VS Code Dark+ token colors
const COLORS = {
  keyword: '#569CD6',
  string: '#CE9178',
  comment: '#6A9955',
  number: '#B5CEA8',
  function: '#DCDCAA',
  property: '#9CDCFE',
  plain: '#D4D4D4',
  punctuation: '#D4D4D4',
} as const;

type TokenType = keyof typeof COLORS;

interface Token {
  type: TokenType;
  value: string;
}

// Language keyword sets
const KEYWORDS: Record<string, Set<string>> = {
  js: new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'class', 'extends', 'super', 'this', 'import', 'export', 'default', 'from', 'as', 'async', 'await', 'yield', 'true', 'false', 'null', 'undefined', 'void', 'with']),
  python: new Set(['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None', 'self', 'global', 'nonlocal', 'del', 'assert', 'async', 'await']),
  go: new Set(['func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'go', 'select', 'chan', 'defer', 'fallthrough', 'goto', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'map', 'make', 'new', 'append', 'len', 'cap', 'nil', 'true', 'false', 'iota']),
  rust: new Set(['fn', 'let', 'mut', 'const', 'return', 'if', 'else', 'for', 'while', 'loop', 'break', 'continue', 'match', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'crate', 'self', 'super', 'type', 'where', 'as', 'in', 'ref', 'move', 'async', 'await', 'dyn', 'true', 'false', 'Some', 'None', 'Ok', 'Err']),
  java: new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'class', 'interface', 'extends', 'implements', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'void', 'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short', 'true', 'false', 'null', 'instanceof']),
  sql: new Set(['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT', 'INTEGER', 'TEXT', 'REAL', 'BLOB', 'VARCHAR', 'BOOLEAN']),
  bash: new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'in', 'function', 'return', 'exit', 'echo', 'export', 'local', 'readonly', 'shift', 'set', 'unset', 'source', 'true', 'false']),
};

// Map aliases
const LANG_ALIAS: Record<string, string> = {
  javascript: 'js', typescript: 'js', ts: 'js', tsx: 'js', jsx: 'js',
  py: 'python',
  golang: 'go',
  rs: 'rust',
  c: 'java', cpp: 'java', 'c++': 'java', csharp: 'java', cs: 'java',
  sh: 'bash', shell: 'bash', zsh: 'bash',
  mysql: 'sql', postgres: 'sql', sqlite: 'sql',
  html: 'js', css: 'js', json: 'js', xml: 'js',
};

function resolveKeywords(lang?: string): Set<string> {
  if (!lang) return KEYWORDS.js;
  const normalized = lang.toLowerCase().trim();
  return KEYWORDS[normalized] || KEYWORDS[LANG_ALIAS[normalized] || 'js'] || KEYWORDS.js;
}

function getCommentStyle(lang?: string): { line: string; blockStart?: string; blockEnd?: string } {
  const normalized = (lang || '').toLowerCase().trim();
  const resolved = LANG_ALIAS[normalized] || normalized;
  if (resolved === 'python') return { line: '#' };
  if (resolved === 'bash') return { line: '#' };
  if (resolved === 'sql') return { line: '--' };
  return { line: '//', blockStart: '/*', blockEnd: '*/' };
}

function tokenize(code: string, language?: string): Token[] {
  const keywords = resolveKeywords(language);
  const commentStyle = getCommentStyle(language);
  const tokens: Token[] = [];
  let i = 0;

  while (i < code.length) {
    // Block comment
    if (commentStyle.blockStart && code.startsWith(commentStyle.blockStart, i)) {
      const end = code.indexOf(commentStyle.blockEnd!, i + commentStyle.blockStart.length);
      const endIdx = end === -1 ? code.length : end + commentStyle.blockEnd!.length;
      tokens.push({ type: 'comment', value: code.slice(i, endIdx) });
      i = endIdx;
      continue;
    }

    // Line comment
    if (code.startsWith(commentStyle.line, i)) {
      const end = code.indexOf('\n', i);
      const endIdx = end === -1 ? code.length : end;
      tokens.push({ type: 'comment', value: code.slice(i, endIdx) });
      i = endIdx;
      continue;
    }

    // Strings
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === ch) { j++; break; }
        if (ch !== '`' && code[j] === '\n') break;
        j++;
      }
      tokens.push({ type: 'string', value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers
    if (/\d/.test(ch) || (ch === '.' && i + 1 < code.length && /\d/.test(code[i + 1]))) {
      let j = i;
      if (code[j] === '0' && j + 1 < code.length && (code[j + 1] === 'x' || code[j + 1] === 'X')) {
        j += 2;
        while (j < code.length && /[0-9a-fA-F_]/.test(code[j])) j++;
      } else {
        while (j < code.length && /[\d._eE]/.test(code[j])) j++;
      }
      tokens.push({ type: 'number', value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Words
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);

      if (keywords.has(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (j < code.length && code[j] === '(') {
        tokens.push({ type: 'function', value: word });
      } else if (i > 0 && code[i - 1] === '.') {
        tokens.push({ type: 'property', value: word });
      } else {
        tokens.push({ type: 'plain', value: word });
      }
      i = j;
      continue;
    }

    // Whitespace
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /\s/.test(code[j])) j++;
      tokens.push({ type: 'plain', value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Punctuation
    tokens.push({ type: 'punctuation', value: ch });
    i++;
  }

  return tokens;
}

const MAX_TOKENIZE_LENGTH = 3000;

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  const isLong = code.length > MAX_TOKENIZE_LENGTH;
  const tokens = useMemo(
    () => isLong ? null : tokenize(code, language),
    [code, language, isLong],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  const displayLang = language?.toLowerCase().trim() || '';

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{displayLang}</span>
        <button className="code-block-copy" onClick={handleCopy}>
          {copied ? t('chat.copied') : t('chat.copy')}
        </button>
      </div>
      <pre className="code-block-body">
        <code>
          {tokens ? tokens.map((token, idx) => (
            <span key={idx} style={{ color: COLORS[token.type] }}>{token.value}</span>
          )) : code}
        </code>
      </pre>
    </div>
  );
}
