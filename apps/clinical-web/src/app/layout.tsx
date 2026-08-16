import type { ReactNode } from 'react';
import {
  SEMANTIC_COLOR_TOKENS,
  cssVarName,
  darkTheme,
  lightTheme,
  primitives,
  type SemanticColorTheme,
} from '@nexuvi/design-system';

import './globals.css';

export const metadata = {
  title: 'Nexuvi — Clinical Workspace',
  description: 'Clinical documentation, orders, results, and medications',
};

/**
 * Emits every semantic token as a CSS custom property.
 *
 * Generated from `SEMANTIC_COLOR_TOKENS` rather than written out by hand: a token added to
 * the design system reaches the stylesheet automatically, and — more usefully — a token
 * *renamed* there breaks the build here instead of silently leaving components referencing
 * a variable that no longer resolves. A missing custom property is invisible in CSS; it
 * just inherits, which is exactly how an allergy banner ends up the wrong colour.
 */
function themeBlock(selector: string, theme: SemanticColorTheme): string {
  const declarations = SEMANTIC_COLOR_TOKENS.map(
    (token) => `${cssVarName(token)}: ${theme[token]};`,
  ).join('\n      ');
  return `${selector} {\n      ${declarations}\n    }`;
}

const { fontFamily, radius, shadow, space, duration, easing } = primitives;

const SCALE_TOKENS = `
    :root {
      --font-sans: ${fontFamily.sans};
      --font-mono: ${fontFamily.mono};

      --radius-sm: ${radius.sm};
      --radius-md: ${radius.md};
      --radius-lg: ${radius.lg};
      --radius-xl: ${radius.xl};
      --radius-full: ${radius.full};

      --shadow-sm: ${shadow.sm};
      --shadow-md: ${shadow.md};
      --shadow-lg: ${shadow.lg};

      --space-1: ${space[1]};
      --space-2: ${space[2]};
      --space-3: ${space[3]};
      --space-4: ${space[4]};
      --space-5: ${space[5]};
      --space-6: ${space[6]};
      --space-8: ${space[8]};

      --ease-standard: ${easing.standard};
      --ease-decelerate: ${easing.decelerate};
      --duration-fast: ${duration.fast};
      --duration-normal: ${duration.normal};
    }`;

/**
 * Theme resolution order: the OS preference sets the baseline, and an explicit
 * `data-theme` on the root wins over it in *both* directions — a clinician who has forced
 * light mode on a ward machine keeps it when the OS flips to dark at sunset.
 */
const THEME_CSS = [
  themeBlock(':root', lightTheme),
  SCALE_TOKENS,
  `@media (prefers-color-scheme: dark) {\n    ${themeBlock(':root', darkTheme)}\n  }`,
  themeBlock(':root[data-theme="light"]', lightTheme),
  themeBlock(':root[data-theme="dark"]', darkTheme),
].join('\n\n    ');

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
