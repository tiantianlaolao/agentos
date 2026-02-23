export type AgentMode = 'builtin' | 'openclaw' | 'copaw';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  skillsInvoked?: SkillInvocation[];
  isError?: boolean;
  isPush?: boolean;
  source?: string;
}

export interface SkillInvocation {
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface ActiveSkill {
  name: string;
  description: string;
}

export interface AgentProcess {
  name: string;
  status: 'running' | 'stopped' | 'error';
  pid?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessageItem[];
  mode: AgentMode;
  createdAt: number;
}

export interface SkillManifestInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  audit: string;
  auditSource?: string;
  enabled: boolean;
  installed?: boolean;
  environments?: string[];
  category?: string;
  visibility?: string;
  emoji?: string;
  eligible?: boolean;
  functions: Array<{ name: string; description: string }>;
}
