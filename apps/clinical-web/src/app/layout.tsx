import type { ReactNode } from 'react';
import { lightTheme, darkTheme, primitives } from '@nexuvi/design-system';
import './layout.css';

export const metadata = {
  title: 'Nexuvi Clinical Workspace',
  description: 'Clinical documentation, orders, results, and medications',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          :root {
            --nx-color-surface-page: ${lightTheme.surfacePage};
            --nx-color-surface-raised: ${lightTheme.surfaceRaised};
            --nx-color-surface-sunken: ${lightTheme.surfaceSunken};
            --nx-color-text-primary: ${lightTheme.textPrimary};
            --nx-color-text-secondary: ${lightTheme.textSecondary};
            --nx-color-text-muted: ${lightTheme.textMuted};
            --nx-color-border-subtle: ${lightTheme.borderSubtle};
            --nx-color-border-default: ${lightTheme.borderDefault};
            --nx-color-action-primary: ${lightTheme.actionPrimary};
            --nx-color-action-primary-hover: ${lightTheme.actionPrimaryHover};
            --nx-color-status-success: ${lightTheme.statusSuccess};
            --nx-color-status-warning: ${lightTheme.statusWarning};
            --nx-color-status-danger: ${lightTheme.statusDanger};
            --nx-color-clinical-critical: ${lightTheme.clinicalCritical};
            --nx-color-clinical-allergy: ${lightTheme.clinicalAllergy};

            --font-sans: ${primitives.fontFamily.sans};
            --font-mono: ${primitives.fontFamily.mono};
            --radius-md: ${primitives.radius.md};
            --radius-lg: ${primitives.radius.lg};
            --shadow-sm: ${primitives.shadow.sm};
            --shadow-md: ${primitives.shadow.md};
          }

          @media (prefers-color-scheme: dark) {
            :root {
              --nx-color-surface-page: ${darkTheme.surfacePage};
              --nx-color-surface-raised: ${darkTheme.surfaceRaised};
              --nx-color-text-primary: ${darkTheme.textPrimary};
              --nx-color-text-secondary: ${darkTheme.textSecondary};
              --nx-color-action-primary: ${darkTheme.actionPrimary};
              --nx-color-action-primary-hover: ${darkTheme.actionPrimaryHover};
              --nx-color-status-success: ${darkTheme.statusSuccess};
              --nx-color-status-warning: ${darkTheme.statusWarning};
              --nx-color-status-danger: ${darkTheme.statusDanger};
              --nx-color-clinical-critical: ${darkTheme.clinicalCritical};
              --nx-color-clinical-allergy: ${darkTheme.clinicalAllergy};
            }
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: var(--font-sans);
            font-size: 0.875rem;
            line-height: 1.5;
            color: var(--nx-color-text-primary);
            background: var(--nx-color-surface-page);
            -webkit-font-smoothing: antialiased;
          }

          a {
            color: inherit;
            text-decoration: none;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
