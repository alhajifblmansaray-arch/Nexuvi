/**
 * Shared with the server actions and the page.
 *
 * In its own module because a `'use server'` file may export only async functions — a
 * constant there is a build error, since every export becomes a callable endpoint.
 */
export const STAFF_TOKEN_COOKIE = 'nexuvi_staff';
