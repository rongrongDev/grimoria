// Explicit allowlist of role folders at the repo root. Stray root-level files
// and the webapp itself are excluded by construction.
export const ROLES = [
  'ai-agent-red-teamer',
  'ai-engineer',
  'ai-eval-engineer',
  'ai-model-red-teamer',
  'android-dev',
  'backend-dev',
  'data-analyst',
  'data-engineer',
  'game-dev',
  'ios-dev',
  'ml-engineer',
  'pentest-engineer',
  'quality-dev',
  'security-dev',
  'test-automation-engineer',
  'test-data-environment-engineer',
  'tool-engineer',
  'web-dev',
];

export const ROLE_META = {
  'ai-engineer': { label: 'AI Engineer', group: 'AI & ML' },
  'ml-engineer': { label: 'ML Engineer', group: 'AI & ML' },
  'ai-eval-engineer': { label: 'AI Eval Engineer', group: 'AI & ML' },
  'security-dev': { label: 'Security Dev', group: 'Security & Red Team' },
  'pentest-engineer': { label: 'Pentest Engineer', group: 'Security & Red Team' },
  'ai-model-red-teamer': { label: 'AI Model Red Teamer', group: 'Security & Red Team' },
  'ai-agent-red-teamer': { label: 'AI Agent Red Teamer', group: 'Security & Red Team' },
  'web-dev': { label: 'Web Dev', group: 'Software Engineering' },
  'backend-dev': { label: 'Backend Dev', group: 'Software Engineering' },
  'android-dev': { label: 'Android Dev', group: 'Software Engineering' },
  'ios-dev': { label: 'iOS Dev', group: 'Software Engineering' },
  'game-dev': { label: 'Game Dev', group: 'Software Engineering' },
  'tool-engineer': { label: 'Tool Engineer', group: 'Software Engineering' },
  'data-engineer': { label: 'Data Engineer', group: 'Data & Quality' },
  'data-analyst': { label: 'Data Analyst', group: 'Data & Quality' },
  'quality-dev': { label: 'Quality Dev', group: 'Data & Quality' },
  'test-automation-engineer': { label: 'Test Automation Engineer', group: 'Data & Quality' },
  'test-data-environment-engineer': { label: 'Test Data Environment Engineer', group: 'Data & Quality' },
};

export const GROUP_ORDER = ['AI & ML', 'Security & Red Team', 'Software Engineering', 'Data & Quality'];
