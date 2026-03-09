/**
 * Trial status serialization utilities
 */

export interface RawTrialStatus {
  trialActive: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number;
  isPaid: boolean;
  tier: string | null;
}

export interface TrialStatus {
  trialActive: boolean;
  trialEndsAt: string | null; // ISO string
  daysRemaining: number;
  isPaid: boolean;
  tier: string | null;
}

/**
 * Serializes trial status from Date objects to ISO strings for API responses
 */
export function serializeTrialStatus(status: RawTrialStatus): TrialStatus {
  return {
    trialActive: status.trialActive,
    trialEndsAt: status.trialEndsAt ? status.trialEndsAt.toISOString() : null,
    daysRemaining: status.daysRemaining,
    isPaid: status.isPaid,
    tier: status.tier,
  };
}
