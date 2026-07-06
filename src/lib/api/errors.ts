/**
 * Typed errors for the claude.ai API client. Consumers switch on `kind`
 * (or use `instanceof`) instead of parsing error messages.
 */

export type ApiErrorKind = 'not-logged-in' | 'not-found' | 'unexpected-shape' | 'network';

/** Base class for every error the API client throws. */
export abstract class ApiError extends Error {
  abstract readonly kind: ApiErrorKind;
}

/** The session is not authenticated (HTTP 401/403, or no organizations). */
export class NotLoggedInError extends ApiError {
  override readonly name = 'NotLoggedInError';
  readonly kind = 'not-logged-in';

  constructor(message = 'Not logged in to claude.ai') {
    super(message);
  }
}

/** The requested resource does not exist (HTTP 404), e.g. a deleted conversation. */
export class NotFoundError extends ApiError {
  override readonly name = 'NotFoundError';
  readonly kind = 'not-found';

  constructor(message = 'Resource not found on claude.ai') {
    super(message);
  }
}

/** The response was not the JSON shape we expect (e.g. an HTML error page). */
export class UnexpectedShapeError extends ApiError {
  override readonly name = 'UnexpectedShapeError';
  readonly kind = 'unexpected-shape';
}

/** The request failed at the transport level, or with an unexpected HTTP status. */
export class NetworkError extends ApiError {
  override readonly name = 'NetworkError';
  readonly kind = 'network';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
