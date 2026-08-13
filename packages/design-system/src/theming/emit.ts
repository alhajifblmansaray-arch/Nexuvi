/**
 * Serialising a resolved theme to CSS custom properties.
 *
 * This is the last point at which tenant-influenced data becomes part of a stylesheet, so
 * it re-parses every value rather than trusting that it came from {@link resolveTenantTheme}.
 * The check is redundant on the happy path by design: blueprint §3.3's prohibition on
 * tenant-supplied CSS is only as strong as its narrowest gate, and a future caller
 * assembling a theme by hand should not be able to widen it.
 */

import {
  SEMANTIC_COLOR_TOKENS,
  type SemanticColorTheme,
  cssVarName,
} from '../tokens/semantic.ts';
import { formatColor, parseColor } from './color.ts';

export class UnsafeThemeValueError extends Error {
  readonly token: string;
  readonly value: string;

  constructor(token: string, value: string) {
    super(
      `Theme token ${token} holds a value that is not a parseable colour: ${JSON.stringify(value)}`,
    );
    this.name = 'UnsafeThemeValueError';
    this.token = token;
    this.value = value;
  }
}

/**
 * Emit a theme as `--nx-color-*: #rrggbb;` declarations.
 *
 * @throws {UnsafeThemeValueError} if any value fails to parse as a colour.
 */
export function toCssCustomProperties(theme: SemanticColorTheme): string {
  return SEMANTIC_COLOR_TOKENS.map((token) => {
    const value = theme[token];
    const color = parseColor(value);
    if (!color) throw new UnsafeThemeValueError(token, value);
    return `  ${cssVarName(token)}: ${formatColor(color)};`;
  }).join('\n');
}

/**
 * Emit a complete scoped stylesheet for one tenant.
 *
 * Scoped to a `data-tenant-theme` attribute rather than `:root` so that platform chrome —
 * the support-session banner, offline indicator, and required privacy notices that §3.3
 * says a tenant cannot remove — can render outside the scope and keep platform colours.
 */
export function toTenantStylesheet(
  tenantId: string,
  themes: { light: SemanticColorTheme; dark: SemanticColorTheme },
): string {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(tenantId)) {
    throw new Error(
      `Unsafe tenant identifier for stylesheet scoping: ${JSON.stringify(tenantId)}. ` +
        `Expected a lowercase slug, which is what the tenant registry issues.`,
    );
  }

  return [
    `[data-tenant-theme="${tenantId}"] {`,
    toCssCustomProperties(themes.light),
    `}`,
    ``,
    `[data-tenant-theme="${tenantId}"][data-color-scheme="dark"] {`,
    toCssCustomProperties(themes.dark),
    `}`,
  ].join('\n');
}
