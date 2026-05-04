/**
 * Service boundary / future work: align Stripe billing with membership-transfer credit.
 *
 * Today `SubscriptionTransferService` extends `Subscription.currentPeriodEnd` locally and
 * sets `billingAlignmentStatus = STRIPE_ALIGNMENT_PENDING` when the user has an active
 * Stripe-backed subscription row, without calling Stripe APIs.
 *
 * Next implementation should:
 * - Load the Stripe subscription id from the affected `Subscription` row(s).
 * - Use Stripe SDK to extend the billing period or add service credit / trial days so
 *   Stripe renewal dates match local entitlement (or document intentional divergence).
 * - Flip ledger + transfer request `billingAlignmentStatus` to `STRIPE_ALIGNED` or
 *   `STRIPE_ALIGNMENT_FAILED` with error metadata on the ledger row.
 *
 * Do not remove `STRIPE_ALIGNMENT_PENDING` until this path exists; ops rely on it for review.
 */
export const STRIPE_BILLING_ALIGNMENT_TODO =
  'Stripe billing-cycle extension for membership transfer credit is not implemented; ledger rows may carry STRIPE_ALIGNMENT_PENDING.';
