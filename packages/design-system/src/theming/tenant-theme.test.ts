import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SEMANTIC_COLOR_TOKENS,
  darkTheme,
  lightTheme,
  type SemanticColorTheme,
} from '../tokens/semantic.ts';
import { CONTRAST_THRESHOLDS, contrastRatio, parseColor } from './color.ts';
import { UnsafeThemeValueError, toCssCustomProperties, toTenantStylesheet } from './emit.ts';
import { LOCKED_TOKENS, resolveTenantTheme } from './tenant-theme.ts';

const ratio = (foreground: string, background: string) =>
  contrastRatio(parseColor(foreground)!, parseColor(background)!);

describe('colour parsing', () => {
  it('accepts three- and six-digit hex, with or without #', () => {
    assert.deepEqual(parseColor('#2d7f6d'), { r: 45, g: 127, b: 109 });
    assert.deepEqual(parseColor('2d7f6d'), { r: 45, g: 127, b: 109 });
    assert.deepEqual(parseColor('#abc'), { r: 170, g: 187, b: 204 });
  });

  it('rejects every non-hex form, including ones that look harmless', () => {
    for (const input of [
      'rebeccapurple',
      'rgb(1,2,3)',
      'var(--nx-color-action-primary)',
      '#12345',
      '',
      '  ',
      '#2d7f6d;} body{display:none}',
      'url(https://example.test/x.png)',
      'expression(alert(1))',
    ]) {
      assert.equal(parseColor(input), null, `expected ${JSON.stringify(input)} to be rejected`);
    }
  });
});

describe('default themes', () => {
  const audit = (theme: SemanticColorTheme, name: string) => {
    it(`${name}: body text clears AA on every surface`, () => {
      const surfaces = ['surfacePage', 'surfaceRaised', 'surfaceSunken', 'surfaceOverlay'] as const;
      for (const surface of surfaces) {
        const actual = ratio(theme.textPrimary, theme[surface]);
        assert.ok(
          actual >= CONTRAST_THRESHOLDS.bodyText,
          `textPrimary on ${surface} is ${actual.toFixed(2)}:1, need ${CONTRAST_THRESHOLDS.bodyText}:1`,
        );
      }
    });

    it(`${name}: secondary and muted text clear AA on the page surface`, () => {
      for (const token of ['textSecondary', 'textMuted'] as const) {
        const actual = ratio(theme[token], theme.surfacePage);
        assert.ok(
          actual >= CONTRAST_THRESHOLDS.bodyText,
          `${token} on surfacePage is ${actual.toFixed(2)}:1, need ${CONTRAST_THRESHOLDS.bodyText}:1`,
        );
      }
    });

    it(`${name}: clinical safety colours are distinguishable from the page`, () => {
      const clinical = SEMANTIC_COLOR_TOKENS.filter((token) => token.startsWith('clinical'));
      for (const token of clinical) {
        if (token.endsWith('Subtle')) continue;
        const actual = ratio(theme[token], theme.surfacePage);
        assert.ok(
          actual >= CONTRAST_THRESHOLDS.nonText,
          `${token} on surfacePage is ${actual.toFixed(2)}:1, need ${CONTRAST_THRESHOLDS.nonText}:1`,
        );
      }
    });

    it(`${name}: every declared token has a parseable value`, () => {
      for (const token of SEMANTIC_COLOR_TOKENS) {
        assert.ok(parseColor(theme[token]), `${token} = ${theme[token]} is not a colour`);
      }
    });
  };

  audit(lightTheme, 'light');
  audit(darkTheme, 'dark');
});

describe('tenant theme resolution', () => {
  it('applies a valid brand colour and derives its variants', () => {
    const result = resolveTenantTheme({ primary: '#1a5147' });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.light.actionPrimary, '#1a5147');
    assert.notEqual(result.light.actionPrimaryHover, result.light.actionPrimary);
    assert.notEqual(result.light.actionPrimaryActive, result.light.actionPrimaryHover);
    // The subtle variant is a background, so it must stay light enough to carry body text.
    assert.ok(ratio(result.light.textPrimary, result.light.actionPrimarySubtle) >= 4.5);
  });

  it('picks a foreground that is readable on the tenant colour', () => {
    const deep = resolveTenantTheme({ primary: '#0f2c28' });
    assert.equal(deep.ok, true);
    if (deep.ok) {
      assert.equal(deep.light.textOnAction, '#ffffff', 'white text belongs on a deep colour');
      assert.ok(ratio(deep.light.textOnAction, deep.light.actionPrimary) >= 4.5);
    }

    // Just light enough that white text would fail — the label has to flip to dark.
    const pale = resolveTenantTheme({ primary: '#8a8a8a' });
    assert.equal(pale.ok, true);
    if (pale.ok) {
      assert.notEqual(
        pale.light.textOnAction,
        '#ffffff',
        'a pale brand colour must flip the button label to dark text, not keep white',
      );
      assert.ok(ratio(pale.light.textOnAction, pale.light.actionPrimary) >= 4.5);
    }
  });

  it('rejects a colour no text can sit on', () => {
    // Mid-tone colours are the classic failure: too dark for white text at 4.17:1, too
    // light for black at 4.15:1. Neither reaches AA. The passing band here is narrow —
    // #8a8a8a, eight steps lighter, is fine.
    const result = resolveTenantTheme({ primary: '#7c7c7c' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.issues[0]?.code, 'no-readable-text');
    assert.equal(result.issues[0]?.slot, 'primary');
  });

  it('rejects a colour that vanishes into the page background', () => {
    const result = resolveTenantTheme({ primary: '#fbfcfd' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.issues[0]?.code, 'insufficient-contrast');
  });

  it('offers the nearest workable shade so a rejection is actionable', () => {
    // A pale gold — a plausible real clinic brand, and too light for a filled action.
    const result = resolveTenantTheme({ primary: '#f2cb85' });
    assert.equal(result.ok, false);
    if (result.ok) return;

    const suggestion = result.issues[0]?.suggestion;
    assert.ok(suggestion, 'expected a suggested shade');
    assert.match(result.issues[0]!.message, /nearest shade that works is #[0-9a-f]{6}/);

    // The suggestion must itself be accepted, or we have sent the administrator in a circle.
    const retry = resolveTenantTheme({ primary: suggestion });
    assert.equal(retry.ok, true, `suggested ${suggestion} but it was rejected in turn`);
  });

  it('reports every bad slot at once rather than stopping at the first', () => {
    const result = resolveTenantTheme({
      primary: 'not-a-colour',
      secondary: '#7c7c7c',
      danger: 'rgb(200,0,0)',
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.issues.length, 3);
    assert.deepEqual(
      result.issues.map((issue) => issue.slot).sort(),
      ['danger', 'primary', 'secondary'],
    );
  });

  it('leaves omitted slots at the Nexuvi default', () => {
    const result = resolveTenantTheme({ primary: '#1a5147' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.light.statusWarning, lightTheme.statusWarning);
    assert.equal(result.light.statusInfo, lightTheme.statusInfo);
  });
});

describe('locked tokens (blueprint §19.1, §15.3, §16.3)', () => {
  it('covers every clinical and platform token', () => {
    const locked = new Set<string>(LOCKED_TOKENS);
    for (const token of SEMANTIC_COLOR_TOKENS) {
      if (token.startsWith('clinical') || token.startsWith('platform')) {
        assert.ok(locked.has(token), `${token} carries safety meaning and must not be tenant-settable`);
      }
    }
  });

  it('no tenant brand input can move a clinical or platform token', () => {
    // Every slot set to a legitimate colour — the strongest override a tenant can express.
    const result = resolveTenantTheme({
      primary: '#7e2e0a',
      secondary: '#411705',
      success: '#0e2f1b',
      warning: '#3a2706',
      danger: '#441414',
      info: '#0e223d',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    for (const token of LOCKED_TOKENS) {
      assert.equal(
        result.light[token],
        lightTheme[token],
        `${token} was changed by tenant input; it is locked`,
      );
      assert.equal(result.dark[token], darkTheme[token], `${token} was changed in dark theme`);
    }
  });
});

describe('stylesheet emission', () => {
  it('emits one declaration per semantic token', () => {
    const css = toCssCustomProperties(lightTheme);
    assert.equal(css.split('\n').length, SEMANTIC_COLOR_TOKENS.length);
    assert.match(css, /--nx-color-action-primary: #[0-9a-f]{6};/);
    assert.match(css, /--nx-color-clinical-critical: #[0-9a-f]{6};/);
  });

  it('refuses to emit a value that is not a colour, however it got there', () => {
    const tampered = { ...lightTheme, actionPrimary: '#fff; } html { display: none } .x {' };
    assert.throws(() => toCssCustomProperties(tampered), UnsafeThemeValueError);
  });

  it('scopes to the tenant attribute so platform chrome keeps platform colours', () => {
    const themes = { light: lightTheme, dark: darkTheme };
    const css = toTenantStylesheet('freetown-family', themes);
    assert.match(css, /^\[data-tenant-theme="freetown-family"\] \{/);
    assert.match(css, /\[data-tenant-theme="freetown-family"\]\[data-color-scheme="dark"\] \{/);
    assert.doesNotMatch(css, /:root/);
  });

  it('rejects a tenant id that could break out of the selector', () => {
    for (const id of ['a"] { } html {', 'Freetown_Family', '', '-leading-dash', 'x'.repeat(64)]) {
      assert.throws(
        () => toTenantStylesheet(id, { light: lightTheme, dark: darkTheme }),
        /Unsafe tenant identifier/,
        `expected ${JSON.stringify(id)} to be rejected`,
      );
    }
  });
});
