/**
 * World layout constants (in three.js world units / meters)
 */
export const BLOCK_HALF_LENGTH = 36;
export const STREET_HALF_WIDTH = 6;
export const NORTH_SIDEWALK_Z_MIN = -10;
export const NORTH_SIDEWALK_Z_MAX = -6;
export const SOUTH_SIDEWALK_Z_MIN = 6;
export const SOUTH_SIDEWALK_Z_MAX = 9.5;
export const CANAL_Z_MIN = 9.5;
export const CANAL_Z_MAX = 17.5;
export const CANAL_WATER_Y = -0.35;
export const SIDEWALK_Y = 0.18;
export const MAX_RIPPLES = 16;

/**
 * Buffer stride constants (number of float32 elements per entity in linear buffers)
 */
/** [x, y, z, yaw, length, width, colorSlot, brakeIntensity, active, laneIndex] */
export const CAR_STRIDE = 10;

/** [x0, y0, z0, x1, y1, z1, intensity, colorSlot] */
export const TRAIL_STRIDE = 8;

/** [x, z, phaseCode, facingSign] (phaseCode: 0=green, 1=yellow, 2=red) */
export const TRAFFIC_LIGHT_STRIDE = 4;

/** [x, y, z, yaw, walkPhase, hasUmbrella, umbrellaColorSlot, speed] */
export const PEDESTRIAN_STRIDE = 8;

/** [x, y, z, vx, vy, kind] (kind: 0=rain, 1=snow) */
export const PARTICLE_STRIDE = 6;

/** [x, z, radius, strength] */
export const RIPPLE_STRIDE = 4;

/** [brightness, glitchAmount, flickerOffset] */
export const SIGN_STATE_STRIDE = 3;

/** [isOn, flicker] */
export const STREETLIGHT_STATE_STRIDE = 2;

/**
 * Core simulation types
 */
export type WeatherKind = 'clear' | 'rain' | 'heavy_rain' | 'snow';

export type ThemeId =
  | 'cyber-tokyo'
  | 'hk-noir'
  | 'vapor-dawn'
  | 'amber-rain'
  | 'mint-ghost';

export type SignOrientation = 'horizontal' | 'vertical' | 'rooftop';

export type RoofStyle = 'flat' | 'stepped' | 'antenna' | 'watertower';

export type PropKind =
  | 'vending'
  | 'ac_unit'
  | 'bollard'
  | 'trash_bin'
  | 'traffic_pole';

export type EasterEggKind = 'none' | 'ufo' | 'cat' | 'neon_sync';

export interface BuildingSpec {
  id: number;
  side: 'north' | 'south';
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  roofStyle: RoofStyle;
  colorTint: number;
  windowRows: number;
  windowCols: number;
  windowSeed: number;
}

export interface NeonSignSpec {
  id: number;
  buildingId: number;
  orientation: SignOrientation;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  facingY: number;
  colorSlot: 0 | 1 | 2;
  labelIndex: number;
  isHero: boolean;
}

export interface StreetlightSpec {
  id: number;
  x: number;
  z: number;
  side: 'north' | 'south';
  height: number;
  armDirZ: number;
  initialOn: boolean;
}

export interface PuddleSpec {
  id: number;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
}

export interface PropSpec {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  colorSlot: 0 | 1 | 2;
}

export interface BlockLayout {
  seed: number;
  buildings: BuildingSpec[];
  signs: NeonSignSpec[];
  streetlights: StreetlightSpec[];
  puddles: PuddleSpec[];
  props: PropSpec[];
}

export interface AtmosphereState {
  timeHours: number;
  autoCycle: boolean;
  weather: WeatherKind;
  fogEnabled: boolean;
  sunElevation: number;
  daylight: number;
  twilight: number;
  neonIntensity: number;
  windowLitRatio: number;
  trafficDensity: number;
  wetness: number;
  fogDensity: number;
  rainIntensity: number;
  snowIntensity: number;
  windX: number;
  elapsedSec: number;
}

export interface EasterEggState {
  activeKind: EasterEggKind;
  progress: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  intensity: number;
  triggeredCount: number;
}

export interface UrlSceneState {
  timeHours: number;
  autoCycle: boolean;
  weather: WeatherKind;
  fogEnabled: boolean;
  theme: ThemeId;
  seed: number;
  postFxExtra: boolean;
  autoOrbit: boolean;
  customSignText: string;
}

/**
 * NeonWorldBridge: The contract between TypeScript frontend and Rust/WASM simulation
 */
export interface NeonWorldBridge {
  init(seed: number): Promise<void>;
  isReady(): boolean;
  regenerate(seed: number): BlockLayout;
  getBlockLayout(): BlockLayout;
  step(dt: number): void;
  setTimeHours(hours: number): void;
  setAutoCycle(enabled: boolean): void;
  setWeather(weather: WeatherKind): void;
  setFogEnabled(enabled: boolean): void;
  triggerSignGlitch(signId: number): boolean;
  toggleStreetlight(lightId: number): boolean;
  spawnWaterRipple(x: number, z: number, strength?: number): number;
  triggerEasterEgg(kind: Exclude<EasterEggKind, 'none'>): void;
  getAtmosphere(): AtmosphereState;
  getEasterEgg(): EasterEggState;
  getCarsBuffer(): Float32Array;
  getTrailsBuffer(): Float32Array;
  getTrafficLightsBuffer(): Float32Array;
  getPedestriansBuffer(): Float32Array;
  getParticlesBuffer(): Float32Array;
  getRipplesBuffer(): Float32Array;
  getSignStatesBuffer(): Float32Array;
  getStreetlightStatesBuffer(): Float32Array;
  getWaterWavePhase(): number;
  dispose(): void;
}
