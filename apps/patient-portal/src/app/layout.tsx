import type { ReactNode } from 'react';

import { getBrand } from '../lib/api';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Patient portal' };

const TYPEFACE_STACK: Record<string, string> = {
  inter: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'source-sans': "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif",
  'ibm-plex': "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

/**
 * The white-label shell.
 *
 * Every clinic renders through this one layout. What differs is the stylesheet, which
 * arrives from the API already validated and colour-parsed — the portal never interpolates
 * a tenant-supplied colour into CSS, because that is an injection vector.
 *
 * `data-tenant-theme` scopes the tenant's palette. Anything rendered outside that scope
 * keeps platform colours, which is how required notices stay recognisably the platform's
 * rather than the clinic's (§3.3).
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  let brand;
  try {
    brand = await getBrand();
  } catch {
    // An unrecognised host is not a clinic portal. Render unbranded rather than guessing —
    // guessing a clinic on a sign-in page is a phishing surface.
    return (
      <html lang="en">
        <body>
          <main className="unbranded">
            <h1>This address is not a clinic portal</h1>
            <p>Use the link your clinic gave you.</p>
          </main>
        </body>
      </html>
    );
  }

  const fontStack = TYPEFACE_STACK[brand.typeface] ?? TYPEFACE_STACK.system;

  return (
    <html lang="en" data-tenant-theme={brand.themeKey}>
      <head>
        <title>{`${brand.profile.displayName} — Patient portal`}</title>
        <style dangerouslySetInnerHTML={{ __html: brand.stylesheet }} />
        <style dangerouslySetInnerHTML={{ __html: `:root { --font-sans: ${fontStack}; }` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
