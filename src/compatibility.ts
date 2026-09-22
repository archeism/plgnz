import type { InstallStatus } from './host';
import type { ConsumerProfile } from './consumer-profiles';

export type CompatibilityStatus = Extract<InstallStatus, 'unsupported' | 'unverified'> | 'supported';
export type ConsumerCapability = 'install' | 'update' | 'commandProjection' | 'userOnlySkills';

/** A target-specific refusal that callers can render as an InstallOutcome. */
export class CompatibilityError extends Error {
  constructor(
    readonly target: string,
    readonly capability: ConsumerCapability,
    readonly status: Extract<CompatibilityStatus, 'unsupported' | 'unverified'>,
    readonly evidence: string,
  ) {
    super(`target '${target}' is ${status} for ${capability}; evidence: ${evidence}`);
    this.name = 'CompatibilityError';
  }
}

export function requireCompatible(profile: ConsumerProfile, capability: ConsumerCapability): void {
  const status = profile.capabilities[capability];
  if (status !== 'supported') throw new CompatibilityError(profile.id, capability, status, profile.evidence);
}
