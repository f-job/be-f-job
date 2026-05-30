/**
 * Typed event payload contracts for the Application domain.
 *
 * These classes are emitted by `ApplicationsService` and consumed by
 * `NotificationListener`. Keeping them in a dedicated file decouples the
 * producer (Applications) from the consumer (Notifications) without
 * creating circular module dependencies.
 */

// ─── Event 1: application.created ────────────────────────────────────────────

/**
 * Emitted immediately after a Candidate successfully submits an application.
 *
 * Recipient: The Employer who owns the job vacancy.
 */
export class ApplicationCreatedEvent {
  /** MongoDB ObjectId string of the new application document */
  applicationId: string;

  /** MongoDB ObjectId string of the candidate's User document */
  candidateId: string;

  /** Human-readable full name of the candidate (for email body) */
  candidateFullName: string;

  /** MongoDB ObjectId string of the job being applied to */
  jobId: string;

  /** Title of the casual job shift (for email subject / body) */
  jobTitle: string;

  /** Company name of the employer (for email body) */
  companyName: string;

  /**
   * MongoDB ObjectId string of the User document that OWNS the job
   * (i.e. the employer's user account — not the employer profile ID).
   * Used to look up the employer's email address and notification settings.
   */
  employerUserId: string;
}

// ─── Event 2: application.status_updated ─────────────────────────────────────

/**
 * Emitted when an Employer transitions an application status.
 * Covers: Applied → Accepted, Applied → Rejected, Applied → Scheduled, etc.
 *
 * Recipient: The Candidate who authored the application.
 */
export class ApplicationStatusUpdatedEvent {
  /** MongoDB ObjectId string of the application document */
  applicationId: string;

  /**
   * MongoDB ObjectId string of the Candidate's User document.
   * Used to look up the candidate's email address and notification settings.
   */
  candidateUserId: string;

  /** Human-readable new lifecycle status label (e.g. "Accepted", "Rejected") */
  newStatus: string;

  /** Optional employer note / rejection reason to include in the email */
  employerNote?: string;

  /** Title of the casual job shift (for email subject / body) */
  jobTitle: string;

  /** Company name of the employer (for email context) */
  companyName: string;

  /** Frontend deep-link URL pointing to the candidate's application detail page */
  applicationUrl: string;
}
