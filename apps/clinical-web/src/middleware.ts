import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE } from './lib/session-cookie';

/**
 * Requires a live session for every page.
 *
 * A gate, not the authorization boundary: the API verifies every token and enforces
 * capabilities regardless of what got past here. This exists so someone without a session
 * sees a sign-in screen instead of a dashboard full of failed requests.
 *
 * **Presence is not validity.** Checking only that a cookie exists lets an expired token
 * through, and the person then meets a page where every panel has failed — which reads as
 * a broken product rather than an ended session. The expiry claim is read here (without
 * verifying the signature, which is the API's job and not something the edge should
 * duplicate) purely to decide between "show the app" and "show the login".
 */
/** The platform's own hostnames — the ones that are not any clinic. */
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? 'nexuvi.health';

function isPlatformHost(request: NextRequest): boolean {
  const host = (request.headers.get('host') ?? '').split(':')[0]?.toLowerCase() ?? '';
  return (
    host === PLATFORM_DOMAIN ||
    host === `www.${PLATFORM_DOMAIN}` ||
    host === `app.${PLATFORM_DOMAIN}`
  );
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = token ? !isExpired(token) : false;

  const { pathname } = request.nextUrl;
  const isSignIn = pathname.startsWith('/sign-in');
  // First-run setup carries its own credential — the invitation token — so it must be
  // reachable before any session exists.
  const isSetup = pathname.startsWith('/setup');
  // The operator console. Not a clinic surface: it runs its own gate, so it must be
  // reachable without a clinic session.
  const isPlatform = pathname.startsWith('/platform');

  // The platform's own address has no clinic behind it, so a clinic sign-in form there
  // would ask someone to log in to nothing. Send it to the console instead.
  if (isPlatformHost(request) && !isPlatform) {
    const url = request.nextUrl.clone();
    url.pathname = '/platform';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (!hasSession && !isSignIn && !isSetup && !isPlatform) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname + request.nextUrl.search);

    const response = NextResponse.redirect(url);
    // Clear a stale cookie on the way past, so the next request is not decided by a
    // credential we have already judged dead.
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (hasSession && isSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/** Reads `exp` from the payload. Treats anything unreadable as expired — fail closed. */
function isExpired(token: string): boolean {
  const payload = token.split('.')[1];
  if (!payload) return true;

  try {
    // `atob` rather than `Buffer`: middleware runs on the edge runtime.
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { exp?: number };
    if (typeof claims.exp !== 'number') return true;
    return claims.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
