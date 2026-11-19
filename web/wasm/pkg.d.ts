declare module '*neon_street_wasm.js' {
  export class NeonWorld {
    constructor(seed: number);
    regenerate(seed: number): string;
    get_block_layout_json(): string;
    step(dt: number): void;
    set_time_hours(hours: number): void;
    set_auto_cycle(enabled: boolean): void;
    set_weather(weather: string): void;
    set_fog_enabled(enabled: boolean): void;
    trigger_sign_glitch(sign_id: number): boolean;
    toggle_streetlight(light_id: number): boolean;
    spawn_water_ripple(x: number, z: number, strength: number): number;
    trigger_easter_egg(kind: string): void;
    get_atmosphere_json(): string;
    get_easter_egg_json(): string;
    get_cars_buffer(): Float32Array;
    get_trails_buffer(): Float32Array;
    get_traffic_lights_buffer(): Float32Array;
    get_pedestrians_buffer(): Float32Array;
    get_particles_buffer(): Float32Array;
    get_ripples_buffer(): Float32Array;
    get_sign_states_buffer(): Float32Array;
    get_streetlight_states_buffer(): Float32Array;
    get_water_wave_phase(): number;
    free(): void;
  }

  export default function init(
    module_or_path?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module
  ): Promise<unknown>;
}
