/**
 * Typed event payload contracts for the Candidate Verification domain.
 *
 * Emitted by `VerificationService` and consumed by `NotificationListener`.
 * Keeping these in a dedicated file decouples the producer (Verification)
 * from the consumer (Notifications) without creating circular module
 * dependencies.
 */

// ─── Event: verification.decided ─────────────────────────────────────────────

/**
 * Emitted when an Admin approves or rejects a candidate's verification
 * submission.
 *
 * Recipient: The Candidate who submitted the identity documents.
 */
export class VerificationDecidedEvent {
  /**
   * MongoDB ObjectId string of the Candidate's User document.
   * Used to look up the candidate's email address and notification settings.
   */
  candidateUserId: string;

  /** The admin decision outcome */
  status: 'VERIFIED' | 'REJECTED';

  /** Optional rejection reason to include in the notification (when REJECTED) */
  reason?: string;
}
