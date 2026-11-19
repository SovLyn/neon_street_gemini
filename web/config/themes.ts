import type { ThemeId } from '../types/sim';

export interface SceneColors {
  neon: [string, string, string];
  skyNightZenith: string;
  skyNightHorizon: string;
  skyDayZenith: string;
  skyDayHorizon: string;
  skyDuskHorizon: string;
  fogNight: string;
  fogDay: string;
  waterTint: string;
  waterDeep: string;
  ambientNight: string;
  streetlightColor: string;
  windowWarm: string;
  windowCool: string;
  buildingBase: string;
}

export interface UiColors {
  bgPanel: string;
  bgPanelSolid: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentAlt: string;
  accentGlow: string;
  chipBg: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  subtitle: string;
  swatches: [string, string, string];
  scene: SceneColors;
  ui: UiColors;
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  'cyber-tokyo': {
    id: 'cyber-tokyo',
    name: '赛博东京',
    subtitle: 'Cyber Tokyo · 霓虹幻夜',
    swatches: ['#00f5ff', '#ff2a85', '#ffe600'],
    scene: {
      neon: ['#00f5ff', '#ff2a85', '#ffe600'],
      skyNightZenith: '#04060e',
      skyNightHorizon: '#0d1424',
      skyDayZenith: '#1a2b4c',
      skyDayHorizon: '#406496',
      skyDuskHorizon: '#d44a7a',
      fogNight: '#080c16',
      fogDay: '#2b3f5c',
      waterTint: '#00f5ff',
      waterDeep: '#040a12',
      ambientNight: '#12162a',
      streetlightColor: '#ffeaa7',
      windowWarm: '#ffaa33',
      windowCool: '#70d6ff',
      buildingBase: '#11141e',
    },
    ui: {
      bgPanel: 'rgba(10, 14, 24, 0.78)',
      bgPanelSolid: '#0a0e18',
      border: 'rgba(0, 245, 255, 0.28)',
      text: '#e8f4fc',
      textMuted: '#7a8fa6',
      accent: '#00f5ff',
      accentAlt: '#ff2a85',
      accentGlow: 'rgba(0, 245, 255, 0.35)',
      chipBg: 'rgba(0, 245, 255, 0.12)',
    },
  },
  'hk-noir': {
    id: 'hk-noir',
    name: '九龙霓虹',
    subtitle: 'Kowloon Noir · 翠玉赤芒',
    swatches: ['#ff3b30', '#00e676', '#ffab00'],
    scene: {
      neon: ['#ff3b30', '#00e676', '#ffab00'],
      skyNightZenith: '#060807',
      skyNightHorizon: '#121814',
      skyDayZenith: '#1b2d22',
      skyDayHorizon: '#3d634d',
      skyDuskHorizon: '#c25e2e',
      fogNight: '#0c120e',
      fogDay: '#2a3b31',
      waterTint: '#00e676',
      waterDeep: '#040b06',
      ambientNight: '#141a16',
      streetlightColor: '#ffc04d',
      windowWarm: '#ff9f1c',
      windowCool: '#48cae4',
      buildingBase: '#131715',
    },
    ui: {
      bgPanel: 'rgba(12, 17, 14, 0.8)',
      bgPanelSolid: '#0c110e',
      border: 'rgba(0, 230, 118, 0.28)',
      text: '#ecf5ee',
      textMuted: '#7a9183',
      accent: '#00e676',
      accentAlt: '#ff3b30',
      accentGlow: 'rgba(0, 230, 118, 0.35)',
      chipBg: 'rgba(0, 230, 118, 0.12)',
    },
  },
  'vapor-dawn': {
    id: 'vapor-dawn',
    name: '蒸汽幻梦',
    subtitle: 'Vapor Dawn · 粉紫余晖',
    swatches: ['#ff71ce', '#b967ff', '#05ffa1'],
    scene: {
      neon: ['#ff71ce', '#b967ff', '#05ffa1'],
      skyNightZenith: '#0b0714',
      skyNightHorizon: '#201235',
      skyDayZenith: '#321b4f',
      skyDayHorizon: '#72498d',
      skyDuskHorizon: '#f77fbe',
      fogNight: '#140d21',
      fogDay: '#432d5e',
      waterTint: '#05ffa1',
      waterDeep: '#0b0416',
      ambientNight: '#211535',
      streetlightColor: '#ffcbf2',
      windowWarm: '#f72585',
      windowCool: '#4cc9f0',
      buildingBase: '#181224',
    },
    ui: {
      bgPanel: 'rgba(18, 12, 28, 0.78)',
      bgPanelSolid: '#120c1c',
      border: 'rgba(255, 113, 206, 0.3)',
      text: '#f9edf8',
      textMuted: '#9a81a8',
      accent: '#ff71ce',
      accentAlt: '#b967ff',
      accentGlow: 'rgba(255, 113, 206, 0.35)',
      chipBg: 'rgba(255, 113, 206, 0.14)',
    },
  },
  'amber-rain': {
    id: 'amber-rain',
    name: '琥珀雨夜',
    subtitle: 'Amber Rain · 暖黄微雨',
    swatches: ['#ff6b1a', '#ffd166', '#4cc9f0'],
    scene: {
      neon: ['#ff6b1a', '#ffd166', '#4cc9f0'],
      skyNightZenith: '#0a0806',
      skyNightHorizon: '#1a130b',
      skyDayZenith: '#2b221a',
      skyDayHorizon: '#594939',
      skyDuskHorizon: '#e06d28',
      fogNight: '#120e0a',
      fogDay: '#3c3228',
      waterTint: '#ffd166',
      waterDeep: '#0e0904',
      ambientNight: '#1c1610',
      streetlightColor: '#ffb703',
      windowWarm: '#ffbe0b',
      windowCool: '#8ecae6',
      buildingBase: '#191512',
    },
    ui: {
      bgPanel: 'rgba(18, 14, 10, 0.8)',
      bgPanelSolid: '#120e0a',
      border: 'rgba(255, 107, 26, 0.3)',
      text: '#faeee6',
      textMuted: '#9b8b7e',
      accent: '#ff6b1a',
      accentAlt: '#ffd166',
      accentGlow: 'rgba(255, 107, 26, 0.35)',
      chipBg: 'rgba(255, 107, 26, 0.12)',
    },
  },
  'mint-ghost': {
    id: 'mint-ghost',
    name: '幽翠赛博',
    subtitle: 'Mint Ghost · 极光幽芒',
    swatches: ['#38ef7d', '#72efdd', '#ff5d8f'],
    scene: {
      neon: ['#38ef7d', '#72efdd', '#ff5d8f'],
      skyNightZenith: '#050d0a',
      skyNightHorizon: '#0b1e17',
      skyDayZenith: '#17382d',
      skyDayHorizon: '#366857',
      skyDuskHorizon: '#3ddc97',
      fogNight: '#091712',
      fogDay: '#254438',
      waterTint: '#72efdd',
      waterDeep: '#030e0b',
      ambientNight: '#10221b',
      streetlightColor: '#cbf3f0',
      windowWarm: '#ffd166',
      windowCool: '#72efdd',
      buildingBase: '#101a16',
    },
    ui: {
      bgPanel: 'rgba(9, 19, 16, 0.8)',
      bgPanelSolid: '#091310',
      border: 'rgba(56, 239, 125, 0.28)',
      text: '#e8f8f2',
      textMuted: '#7ea093',
      accent: '#38ef7d',
      accentAlt: '#72efdd',
      accentGlow: 'rgba(56, 239, 125, 0.35)',
      chipBg: 'rgba(56, 239, 125, 0.12)',
    },
  },
};

export const THEME_LIST: ThemeDefinition[] = [
  THEMES['cyber-tokyo'],
  THEMES['hk-noir'],
  THEMES['vapor-dawn'],
  THEMES['amber-rain'],
  THEMES['mint-ghost'],
];

export function isValidThemeId(v: string): v is ThemeId {
  return Object.prototype.hasOwnProperty.call(THEMES, v);
}

export function applyThemeToDocument(theme: ThemeDefinition): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.style.setProperty('--theme-bg-panel', theme.ui.bgPanel);
  root.style.setProperty('--theme-bg-panel-solid', theme.ui.bgPanelSolid);
  root.style.setProperty('--theme-border', theme.ui.border);
  root.style.setProperty('--theme-text', theme.ui.text);
  root.style.setProperty('--theme-text-muted', theme.ui.textMuted);
  root.style.setProperty('--theme-accent', theme.ui.accent);
  root.style.setProperty('--theme-accent-alt', theme.ui.accentAlt);
  root.style.setProperty('--theme-accent-glow', theme.ui.accentGlow);
  root.style.setProperty('--theme-chip-bg', theme.ui.chipBg);
  root.style.setProperty('--theme-neon-0', theme.scene.neon[0]);
  root.style.setProperty('--theme-neon-1', theme.scene.neon[1]);
  root.style.setProperty('--theme-neon-2', theme.scene.neon[2]);
  root.setAttribute('data-theme', theme.id);
}
