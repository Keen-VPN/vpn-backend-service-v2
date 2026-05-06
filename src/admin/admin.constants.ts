/** HttpOnly cookie carrying opaque admin session token (raw value never stored in DB). */
export const ADMIN_SESSION_COOKIE = 'keen_admin_session';

/** Default session lifetime when ADMIN_SESSION_MAX_AGE_SEC is unset (7 days). */
export const DEFAULT_ADMIN_SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;
