import type {
  AtmosphereState,
  BlockLayout,
  EasterEggKind,
  EasterEggState,
  NeonWorldBridge,
  WeatherKind,
} from '../types/sim';
import type { NeonWorld } from './pkg/neon_street_wasm.js';

/**
 * Strongly typed bridge wrapping the wasm-bindgen target web package.
 */
export class WasmNeonWorldBridge implements NeonWorldBridge {
  private world: NeonWorld | null = null;
  private layout: BlockLayout | null = null;
  private ready = false;

  async init(seed: number): Promise<void> {
    if (this.ready && this.world) {
      return;
    }

    try {
      const wasmModule = await import('./pkg/neon_street_wasm.js');
      await wasmModule.default();
      this.world = new wasmModule.NeonWorld(seed);
      const layoutJson = this.world.get_block_layout_json();
      this.layout = JSON.parse(layoutJson) as BlockLayout;
      this.ready = true;
    } catch (err) {
      this.ready = false;
      this.world = null;
      this.layout = null;
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to initialize WasmNeonWorldBridge: ${message}`, {
        cause: err,
      });
    }
  }

  isReady(): boolean {
    return this.ready && this.world !== null;
  }

  regenerate(seed: number): BlockLayout {
    const world = this.getWorld();
    const layoutJson = world.regenerate(seed);
    this.layout = JSON.parse(layoutJson) as BlockLayout;
    return this.layout;
  }

  getBlockLayout(): BlockLayout {
    if (!this.layout) {
      const world = this.getWorld();
      const layoutJson = world.get_block_layout_json();
      this.layout = JSON.parse(layoutJson) as BlockLayout;
    }
    return this.layout;
  }

  step(dt: number): void {
    this.getWorld().step(dt);
  }

  setTimeHours(hours: number): void {
    this.getWorld().set_time_hours(hours);
  }

  setAutoCycle(enabled: boolean): void {
    this.getWorld().set_auto_cycle(enabled);
  }

  setWeather(weather: WeatherKind): void {
    this.getWorld().set_weather(weather);
  }

  setFogEnabled(enabled: boolean): void {
    this.getWorld().set_fog_enabled(enabled);
  }

  triggerSignGlitch(signId: number): boolean {
    return this.getWorld().trigger_sign_glitch(signId);
  }

  toggleStreetlight(lightId: number): boolean {
    return this.getWorld().toggle_streetlight(lightId);
  }

  spawnWaterRipple(x: number, z: number, strength: number = 1.0): number {
    return this.getWorld().spawn_water_ripple(x, z, strength);
  }

  triggerEasterEgg(kind: Exclude<EasterEggKind, 'none'>): void {
    this.getWorld().trigger_easter_egg(kind);
  }

  getAtmosphere(): AtmosphereState {
    const json = this.getWorld().get_atmosphere_json();
    return JSON.parse(json) as AtmosphereState;
  }

  getEasterEgg(): EasterEggState {
    const json = this.getWorld().get_easter_egg_json();
    return JSON.parse(json) as EasterEggState;
  }

  getCarsBuffer(): Float32Array {
    return this.getWorld().get_cars_buffer();
  }

  getTrailsBuffer(): Float32Array {
    return this.getWorld().get_trails_buffer();
  }

  getTrafficLightsBuffer(): Float32Array {
    return this.getWorld().get_traffic_lights_buffer();
  }

  getPedestriansBuffer(): Float32Array {
    return this.getWorld().get_pedestrians_buffer();
  }

  getParticlesBuffer(): Float32Array {
    return this.getWorld().get_particles_buffer();
  }

  getRipplesBuffer(): Float32Array {
    return this.getWorld().get_ripples_buffer();
  }

  getSignStatesBuffer(): Float32Array {
    return this.getWorld().get_sign_states_buffer();
  }

  getStreetlightStatesBuffer(): Float32Array {
    return this.getWorld().get_streetlight_states_buffer();
  }

  getWaterWavePhase(): number {
    return this.getWorld().get_water_wave_phase();
  }

  dispose(): void {
    if (this.world) {
      try {
        this.world.free();
      } catch {
        // Ignore potential frees on uninitialized or already freed wasm instances
      }
      this.world = null;
    }
    this.layout = null;
    this.ready = false;
  }

  private getWorld(): NeonWorld {
    if (!this.world || !this.ready) {
      throw new Error(
        'WasmNeonWorldBridge: simulation is not initialized. Call init(seed) first.'
      );
    }
    return this.world;
  }
}

export function createNeonWorldBridge(): NeonWorldBridge {
  return new WasmNeonWorldBridge();
}
