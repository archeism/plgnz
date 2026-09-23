/**
 * Native plugin migration inventory plus retired standalone cleanup routes from
 * SPEC.md § Compatibility and lifecycle requirements. Profiles describe
 * evidence; they do not make an adapter active.
 */
import type { CompatibilityStatus, ConsumerCapability } from './compatibility';

export const targetIds = [
  'claude-code', 'codex', 'omp', 'dcode', 'hermes', 'openclaw', 'grok', 'kimi',
  'zcode-cli', 'zcode-desktop', 'cursor', 'opencode', 'pi', 'gemini-cli',
  'factory', 'grokbot',
] as const;

export type TargetId = typeof targetIds[number];

export interface ConsumerProfile {
  id: TargetId;
  scope: 'native-plugin' | 'excluded-standalone';
  surface: string;
  /** Observed version when known; otherwise evidence has not established one. */
  version: string | 'unverified';
  evidence: string;
  capabilities: Readonly<Record<ConsumerCapability, CompatibilityStatus>>;
}

const active: Record<ConsumerCapability, CompatibilityStatus> = {
  install: 'supported',
  update: 'supported',
  commandProjection: 'unverified',
  userOnlySkills: 'unverified',
};

const pending = (id: TargetId, surface: string, evidence: string, version: ConsumerProfile['version'] = 'unverified'): ConsumerProfile => ({
  id,
  scope: 'native-plugin',
  surface,
  version,
  evidence,
  capabilities: { install: 'unverified', update: 'unverified', commandProjection: 'unverified', userOnlySkills: 'unverified' },
});

function profile(id: TargetId, surface: string, evidence: string, version: ConsumerProfile['version'], capabilities: ConsumerProfile['capabilities']): ConsumerProfile {
  return { id, scope: 'native-plugin', surface, version, evidence, capabilities };
}

function excludedStandalone(id: TargetId, surface: string, evidence: string, version: ConsumerProfile['version'] = 'unverified'): ConsumerProfile {
  return {
    id, scope: 'excluded-standalone', surface, version, evidence,
    capabilities: { install: 'unsupported', update: 'unsupported', commandProjection: 'unsupported', userOnlySkills: 'unsupported' },
  };
}

/** Native plugin routes, with legacy standalone profiles retained only for safe read/remove cleanup. */
export const consumerProfiles: readonly ConsumerProfile[] = [
  profile('claude-code', 'Claude Code plugin loader', 'docs/hosts/claude-code.md', '2.1.275', active),
  profile('codex', 'Codex plugin loader', 'docs/evidence/codex-personal-20260922.json', '0.153.4', { ...active, commandProjection: 'supported', userOnlySkills: 'supported' }),
  profile('omp', 'OMP native npm/link extension-package loader', 'docs/evidence/omp-native-extension-package-20260923.json', '18.1.4', { ...active, commandProjection: 'supported', userOnlySkills: 'supported' }),
  profile('dcode', 'deepagents-code plugin loader', 'docs/evidence/dcode-native-loader-20260922.json', '0.1.71', { ...active, commandProjection: 'unsupported', userOnlySkills: 'unsupported' }),
  profile('hermes', 'Hermes portable + native directory plugin loaders', 'docs/hosts/hermes.md', 'c0d7294', { ...active, commandProjection: 'supported', userOnlySkills: 'supported' }),
  pending('openclaw', 'OpenClaw plugin route', 'SPEC.md § Compatibility and lifecycle requirements'),
  pending('grok', 'Grok Build plugin loader', 'SPEC.md § Compatibility and lifecycle requirements'),
  profile('kimi', 'Kimi Code plugin loader', 'docs/hosts/kimi.md (isolated native probe, 2026-09-22)', '2.0.1', { ...active, commandProjection: 'supported', userOnlySkills: 'supported' }),
  profile('zcode-cli', 'Official Z.ai ZCode CLI plugin loader', 'docs/evidence/zcode-official-cli-872ad960-20260923.json', '0.16.9', { ...active, commandProjection: 'supported', userOnlySkills: 'supported' }),
  pending('zcode-desktop', 'Z.ai ZCode desktop plugin route', 'SPEC.md § Compatibility and lifecycle requirements'),
  profile('cursor', 'Cursor local plugin loader', 'docs/hosts/cursor.md', '2026.09.18-9a7762b', active),
  excludedStandalone('opencode', 'OpenCode standalone skill and command loaders', 'docs/evidence/opencode-native-loader-20260922.json', '1.15.13'),
  excludedStandalone('pi', 'Pi standalone skill loader', 'docs/evidence/pi-native-loader-20260922.json', '0.80.10'),
  pending('gemini-cli', 'Gemini CLI native plugin-extension route', 'SPEC.md § Compatibility and lifecycle requirements (native extension semantics unverified)'),
  excludedStandalone('factory', 'Factory standalone skill route', 'docs/hosts/factory.md'),
  excludedStandalone('grokbot', 'Grok Bot standalone skill route', 'docs/hosts/grokbot.md'),
];

const byId = new Map(consumerProfiles.map((entry) => [entry.id, entry]));

export function findConsumerProfile(id: string): ConsumerProfile | undefined {
  return byId.get(id as TargetId);
}
