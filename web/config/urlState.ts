import type { ThemeId, UrlSceneState, WeatherKind } from '../types/sim';
import { isValidThemeId } from './themes';

export const DEFAULT_SCENE_STATE: UrlSceneState = {
  timeHours: 22.5,
  autoCycle: false,
  weather: 'heavy_rain',
  fogEnabled: true,
  theme: 'cyber-tokyo',
  seed: 424242,
  postFxExtra: true,
  autoOrbit: false,
  customSignText: '',
};

const VALID_WEATHERS: ReadonlySet<WeatherKind> = new Set<WeatherKind>([
  'clear',
  'rain',
  'heavy_rain',
  'snow',
]);

export function generateRandomSeed(): number {
  return Math.floor(Math.random() * 999999) + 1;
}

export function parseUrlState(search: string): UrlSceneState {
  try {
    const queryPart = search.includes('?')
      ? search.slice(search.indexOf('?') + 1)
      : search;
    const params = new URLSearchParams(queryPart);

    // Time hours: 0..24
    let timeHours = DEFAULT_SCENE_STATE.timeHours;
    const rawT = params.get('t');
    if (rawT !== null && rawT.trim() !== '') {
      const parsedT = parseFloat(rawT);
      if (Number.isFinite(parsedT)) {
        timeHours = Math.max(0, Math.min(24, Math.round(parsedT * 100) / 100));
      }
    }

    // Auto cycle: 0 or 1
    let autoCycle = DEFAULT_SCENE_STATE.autoCycle;
    const rawAuto = params.get('auto');
    if (rawAuto === '1' || rawAuto === 'true') {
      autoCycle = true;
    } else if (rawAuto === '0' || rawAuto === 'false') {
      autoCycle = false;
    }

    // Weather: 'clear' | 'rain' | 'heavy_rain' | 'snow'
    let weather = DEFAULT_SCENE_STATE.weather;
    const rawW = params.get('w');
    if (rawW && VALID_WEATHERS.has(rawW as WeatherKind)) {
      weather = rawW as WeatherKind;
    }

    // Fog enabled: 0 or 1
    let fogEnabled = DEFAULT_SCENE_STATE.fogEnabled;
    const rawF = params.get('f');
    if (rawF === '1' || rawF === 'true') {
      fogEnabled = true;
    } else if (rawF === '0' || rawF === 'false') {
      fogEnabled = false;
    }

    // Theme: validated ThemeId
    let theme = DEFAULT_SCENE_STATE.theme;
    const rawP = params.get('p');
    if (rawP && isValidThemeId(rawP)) {
      theme = rawP;
    }

    // Seed: 1..999999
    let seed = DEFAULT_SCENE_STATE.seed;
    const rawS = params.get('s');
    if (rawS !== null && rawS.trim() !== '') {
      const parsedS = parseInt(rawS, 10);
      if (Number.isInteger(parsedS) && parsedS >= 1 && parsedS <= 999999) {
        seed = parsedS;
      }
    }

    // Post-fx extra: 0 or 1
    let postFxExtra = DEFAULT_SCENE_STATE.postFxExtra;
    const rawFx = params.get('fx');
    if (rawFx === '1' || rawFx === 'true') {
      postFxExtra = true;
    } else if (rawFx === '0' || rawFx === 'false') {
      postFxExtra = false;
    }

    // Auto orbit camera: 0 or 1
    let autoOrbit = DEFAULT_SCENE_STATE.autoOrbit;
    const rawCam = params.get('cam');
    if (rawCam === '1' || rawCam === 'true') {
      autoOrbit = true;
    } else if (rawCam === '0' || rawCam === 'false') {
      autoOrbit = false;
    }

    // Custom sign text: max 24 chars, trimmed
    let customSignText = DEFAULT_SCENE_STATE.customSignText;
    const rawTxt = params.get('txt');
    if (rawTxt !== null) {
      customSignText = rawTxt.trim().slice(0, 24);
    }

    return {
      timeHours,
      autoCycle,
      weather,
      fogEnabled,
      theme,
      seed,
      postFxExtra,
      autoOrbit,
      customSignText,
    };
  } catch {
    return { ...DEFAULT_SCENE_STATE };
  }
}

export function serializeUrlState(state: UrlSceneState): string {
  const params = new URLSearchParams();

  const clampedHours = Math.max(0, Math.min(24, state.timeHours));
  params.set('t', clampedHours.toFixed(2));
  params.set('auto', state.autoCycle ? '1' : '0');
  params.set('w', state.weather);
  params.set('f', state.fogEnabled ? '1' : '0');
  params.set('p', state.theme);

  const clampedSeed = Math.max(1, Math.min(999999, Math.floor(state.seed)));
  params.set('s', clampedSeed.toString());
  params.set('fx', state.postFxExtra ? '1' : '0');
  params.set('cam', state.autoOrbit ? '1' : '0');

  const trimmedText = state.customSignText.trim().slice(0, 24);
  if (trimmedText.length > 0) {
    params.set('txt', trimmedText);
  }

  const queryString = params.toString();
  return queryString.length > 0 ? `?${queryString}` : '';
}

export function buildShareUrl(state: UrlSceneState, href?: string): string {
  const queryString = serializeUrlState(state);

  if (href) {
    try {
      const url = new URL(href);
      return `${url.origin}${url.pathname}${queryString}${url.hash}`;
    } catch {
      const hashIndex = href.indexOf('#');
      const base = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
      const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
      const queryIndex = base.indexOf('?');
      const cleanBase = queryIndex >= 0 ? base.slice(0, queryIndex) : base;
      return `${cleanBase}${queryString}${hash}`;
    }
  }

  if (typeof window !== 'undefined' && window.location) {
    const loc = window.location;
    return `${loc.origin}${loc.pathname}${queryString}${loc.hash}`;
  }

  return queryString;
}

export function syncUrlState(state: UrlSceneState): void {
  if (typeof window === 'undefined' || !window.history || !window.location) {
    return;
  }
  const queryString = serializeUrlState(state);
  const newUrl = `${window.location.pathname}${queryString}${window.location.hash}`;
  window.history.replaceState(null, '', newUrl);
}
