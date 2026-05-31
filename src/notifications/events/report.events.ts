/**
 * Typed event payload contracts for the Reports & Moderation domain.
 *
 * Emitted by `ReportsService` and consumed by `NotificationListener`.
 * Keeping these in a dedicated file decouples the producer (Reports) from
 * the consumer (Notifications) without creating circular module dependencies.
 */

// ─── Event: report.created ───────────────────────────────────────────────────

/**
 * Emitted immediately after a Report is successfully created.
 *
 * Recipient: All Admins (for moderation queue awareness).
 */
export class ReportCreatedEvent {
  /** MongoDB ObjectId string of the new report document */
  reportId: string;

  /** The type of entity being reported (e.g. "JOB", "USER") */
  targetType: string;

  /** MongoDB ObjectId string of the reported target document */
  targetId: string;
}

// ─── Event: report.resolved ──────────────────────────────────────────────────

/**
 * Emitted when an Admin resolves or dismisses a report.
 *
 * Recipient: The reporter who originally submitted the report.
 */
export class ReportResolvedEvent {
  /**
   * MongoDB ObjectId string of the reporter's User document.
   * Used to look up the reporter's email address and notification settings.
   */
  reporterUserId: string;

  /** MongoDB ObjectId string of the report document */
  reportId: string;

  /** The terminal moderation outcome */
  status: 'RESOLVED' | 'DISMISSED';
}
