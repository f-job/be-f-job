/**
 * Typed event payload contracts for the Review domain.
 *
 * Emitted by `ReviewsService` and consumed by `NotificationListener`.
 * Keeping these in a dedicated file decouples the producer (Reviews) from
 * the consumer (Notifications) without creating circular module dependencies.
 */

// ─── Event: review.created ───────────────────────────────────────────────────

/**
 * Emitted immediately after a review is successfully created for a
 * Completed application.
 *
 * Recipient: The reviewee (the User being reviewed — either the candidate
 * or the employer, depending on the review direction).
 */
export class ReviewCreatedEvent {
  /** MongoDB ObjectId string of the new review document */
  reviewId: string;

  /**
   * MongoDB ObjectId string of the reviewee's User document.
   * Used to look up the reviewee's email address and notification settings.
   */
  revieweeUserId: string;

  /** Human-readable display name of the reviewer (for email body) */
  reviewerDisplayName: string;

  /** Star rating submitted by the reviewer (1–5) */
  rating: number;

  /** MongoDB ObjectId string of the application the review relates to */
  applicationId: string;
}
