import type { ThemeId, WeatherKind } from '../types/sim';

export interface ScenePreset {
  id: string;
  name: string;
  description: string;
  timeHours: number;
  weather: WeatherKind;
  fogEnabled: boolean;
  theme: ThemeId;
  postFxExtra: boolean;
  autoCycle?: boolean;
  autoOrbit?: boolean;
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'midnight-storm',
    name: '深夜暴雨 · 赛博东京',
    description: '高反差电光、重雨倾盆与潮湿水面反光',
    timeHours: 22.5,
    weather: 'heavy_rain',
    fogEnabled: true,
    theme: 'cyber-tokyo',
    postFxExtra: true,
    autoCycle: false,
    autoOrbit: true,
  },
  {
    id: 'dusk-vapor',
    name: '黄昏微雨 · 蒸汽幻梦',
    description: '落日余晖中粉紫霞光与细雨交织',
    timeHours: 18.25,
    weather: 'rain',
    fogEnabled: false,
    theme: 'vapor-dawn',
    postFxExtra: false,
    autoCycle: false,
    autoOrbit: false,
  },
  {
    id: 'amber-mist',
    name: '午夜迷雾 · 琥珀雨夜',
    description: '深邃幽暗街道、钠灯泛黄与浓密雾气',
    timeHours: 1.35,
    weather: 'rain',
    fogEnabled: true,
    theme: 'amber-rain',
    postFxExtra: true,
    autoCycle: false,
    autoOrbit: true,
  },
  {
    id: 'dawn-kowloon',
    name: '黎明初晴 · 九龙霓虹',
    description: '清晨第一抹曙光与红绿翡翠霓虹招牌',
    timeHours: 6.15,
    weather: 'clear',
    fogEnabled: false,
    theme: 'hk-noir',
    postFxExtra: false,
    autoCycle: false,
    autoOrbit: false,
  },
];
