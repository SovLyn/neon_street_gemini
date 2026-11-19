import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENE_STATE,
  buildShareUrl,
  parseUrlState,
  serializeUrlState,
} from '../../web/config/urlState';
import {
  THEMES,
  THEME_LIST,
  isValidThemeId,
} from '../../web/config/themes';
import { SCENE_PRESETS } from '../../web/config/presets';
import type { UrlSceneState } from '../../web/types/sim';

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

describe('urlState codec & URL sync', () => {
  it('round-trips all fields accurately between serializeUrlState and parseUrlState', () => {
    const sampleState: UrlSceneState = {
      timeHours: 14.25,
      autoCycle: true,
      weather: 'snow',
      fogEnabled: false,
      theme: 'vapor-dawn',
      seed: 987654,
      postFxExtra: false,
      autoOrbit: true,
      customSignText: 'CYBER-STREET',
    };

    const serialized = serializeUrlState(sampleState);
    expect(serialized.startsWith('?')).toBe(true);

    const parsed = parseUrlState(serialized);
    expect(parsed).toEqual(sampleState);

    // Also round-trip default scene state
    const serializedDefault = serializeUrlState(DEFAULT_SCENE_STATE);
    const parsedDefault = parseUrlState(serializedDefault);
    expect(parsedDefault).toEqual(DEFAULT_SCENE_STATE);
  });

  it('correctly clamps out-of-range values and falls back on invalid values', () => {
    // Time clamping
    expect(parseUrlState('?t=-5').timeHours).toBe(0);
    expect(parseUrlState('?t=99.5').timeHours).toBe(24);
    expect(parseUrlState('?t=not-a-number').timeHours).toBe(DEFAULT_SCENE_STATE.timeHours);

    // Weather fallback
    expect(parseUrlState('?w=tornado').weather).toBe(DEFAULT_SCENE_STATE.weather);
    expect(parseUrlState('?w=thunderstorm').weather).toBe(DEFAULT_SCENE_STATE.weather);

    // Fog fallback
    expect(parseUrlState('?f=invalid').fogEnabled).toBe(DEFAULT_SCENE_STATE.fogEnabled);

    // Theme fallback
    expect(parseUrlState('?p=unknown-theme-xyz').theme).toBe(DEFAULT_SCENE_STATE.theme);

    // Seed clamping & fallback
    expect(parseUrlState('?s=-100').seed).toBe(DEFAULT_SCENE_STATE.seed);
    expect(parseUrlState('?s=10000000').seed).toBe(DEFAULT_SCENE_STATE.seed);
    expect(parseUrlState('?s=invalid').seed).toBe(DEFAULT_SCENE_STATE.seed);

    // Custom sign text truncation to 24 chars
    const longText = '123456789012345678901234567890EXTRA';
    const parsedLong = parseUrlState(`?txt=${longText}`);
    expect(parsedLong.customSignText.length).toBe(24);
    expect(parsedLong.customSignText).toBe('123456789012345678901234');

    // Serialization clamps out-of-bound inputs
    const outOfBoundsState: UrlSceneState = {
      timeHours: -12.5,
      autoCycle: false,
      weather: 'clear',
      fogEnabled: true,
      theme: 'cyber-tokyo',
      seed: -999,
      postFxExtra: true,
      autoOrbit: false,
      customSignText: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_1234567890',
    };
    const query = serializeUrlState(outOfBoundsState);
    const parsedClamped = parseUrlState(query);
    expect(parsedClamped.timeHours).toBe(0);
    expect(parsedClamped.seed).toBe(1);
    expect(parsedClamped.customSignText.length).toBe(24);
  });

  it('preserves origin, pathname, and hash in buildShareUrl while cleanly replacing query parameters', () => {
    const state: UrlSceneState = {
      timeHours: 20.0,
      autoCycle: false,
      weather: 'rain',
      fogEnabled: true,
      theme: 'hk-noir',
      seed: 123456,
      postFxExtra: true,
      autoOrbit: false,
      customSignText: 'HK-TEST',
    };

    const initialHref = 'https://neon.block.local:8443/district/view?oldParam=foo&discard=bar#camera-view';
    const shareUrl = buildShareUrl(state, initialHref);

    const parsedUrl = new URL(shareUrl);
    expect(parsedUrl.origin).toBe('https://neon.block.local:8443');
    expect(parsedUrl.pathname).toBe('/district/view');
    expect(parsedUrl.hash).toBe('#camera-view');
    expect(parsedUrl.searchParams.get('oldParam')).toBeNull();
    expect(parsedUrl.searchParams.get('discard')).toBeNull();
    expect(parsedUrl.searchParams.get('p')).toBe('hk-noir');
    expect(parsedUrl.searchParams.get('s')).toBe('123456');
    expect(parsedUrl.searchParams.get('txt')).toBe('HK-TEST');
  });

  it('provides a valid THEME_LIST with at least 4 themes having valid hex colors', () => {
    expect(THEME_LIST.length).toBeGreaterThanOrEqual(4);
    expect(THEME_LIST.length).toBe(5);

    for (const theme of THEME_LIST) {
      expect(isValidThemeId(theme.id)).toBe(true);
      expect(THEMES[theme.id]).toBeDefined();

      // Check swatches
      expect(theme.swatches.length).toBe(3);
      for (const swatch of theme.swatches) {
        expect(swatch).toMatch(HEX_COLOR_REGEX);
      }

      // Check key scene hex colors
      expect(theme.scene.skyNightZenith).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.skyNightHorizon).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.skyDayZenith).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.skyDayHorizon).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.fogNight).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.fogDay).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.waterTint).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.waterDeep).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.ambientNight).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.streetlightColor).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.windowWarm).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.windowCool).toMatch(HEX_COLOR_REGEX);
      expect(theme.scene.buildingBase).toMatch(HEX_COLOR_REGEX);

      // Check neon swatches
      for (const neon of theme.scene.neon) {
        expect(neon).toMatch(HEX_COLOR_REGEX);
      }

      // Check UI accent
      expect(theme.ui.accent).toMatch(HEX_COLOR_REGEX);
      expect(theme.ui.accentAlt).toMatch(HEX_COLOR_REGEX);
    }
  });

  it('provides SCENE_PRESETS with at least 3 presets referencing valid themes', () => {
    expect(SCENE_PRESETS.length).toBeGreaterThanOrEqual(3);
    expect(SCENE_PRESETS.length).toBe(4);

    for (const preset of SCENE_PRESETS) {
      expect(isValidThemeId(preset.theme)).toBe(true);
      expect(THEMES[preset.theme]).toBeDefined();
      expect(preset.timeHours).toBeGreaterThanOrEqual(0);
      expect(preset.timeHours).toBeLessThanOrEqual(24);
      expect(['clear', 'rain', 'heavy_rain', 'snow']).toContain(preset.weather);
    }
  });
});
