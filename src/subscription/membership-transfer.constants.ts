/** Risk flags stored on SubscriptionTransferRequest.riskFlags (JSON string[]). */
export const MEMBERSHIP_TRANSFER_RISK = {
  DUPLICATE_PROOF: 'DUPLICATE_PROOF',
  LONG_EXPIRY: 'LONG_EXPIRY',
  NEW_ACCOUNT: 'NEW_ACCOUNT',
  MULTIPLE_ACCOUNT_DEVICE_MATCH: 'MULTIPLE_ACCOUNT_DEVICE_MATCH',
} as const;

export type MembershipTransferRiskFlag =
  (typeof MEMBERSHIP_TRANSFER_RISK)[keyof typeof MEMBERSHIP_TRANSFER_RISK];

export const RISK_WEIGHT_DUPLICATE_PROOF = 40;
export const RISK_WEIGHT_LONG_EXPIRY = 15;
export const RISK_WEIGHT_NEW_ACCOUNT = 20;
export const RISK_WEIGHT_DEVICE_MATCH = 35;
export const RISK_SCORE_CAP = 100;

/** Competitor expiry more than this many days after submit → LONG_EXPIRY. */
export const LONG_EXPIRY_THRESHOLD_DAYS = 365;

/** User account younger than this (days) → NEW_ACCOUNT. */
export const NEW_ACCOUNT_MAX_AGE_DAYS = 7;
