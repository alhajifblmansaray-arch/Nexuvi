/**
 * The session cookie name.
 *
 * In its own module because a `'use server'` file may export only async functions — every
 * export there becomes a callable endpoint, so a constant is a build error.
 */
export const SESSION_COOKIE = 'nexuvi_staff';
