//! Neon Street Block (霓虹街区) - Core Simulation Engine
//!
//! Procedural generation, deterministic RNG/noise, atmospheric lighting,
//! 4-lane traffic dynamics, pedestrians, canal water, particles, and Easter eggs.

use wasm_bindgen::prelude::*;

pub mod environment;
pub mod events;
pub mod generator;
pub mod particles;
pub mod pedestrians;
pub mod rng;
pub mod traffic;
pub mod types;
pub mod water;

pub use environment::EnvironmentSim;
pub use events::EasterEggSim;
pub use generator::generate_block;
pub use particles::ParticleSim;
pub use pedestrians::PedestrianSim;
pub use rng::Rng;
pub use traffic::TrafficSim;
pub use types::*;
pub use water::WaterSim;

/// Runtime glitch and flicker state for an individual neon sign.
#[derive(Debug, Clone)]
struct SignRuntimeState {
    id: u32,
    glitch_timer: f32,
    flicker_offset: f32,
}

/// Runtime power and flicker state for an individual streetlight.
#[derive(Debug, Clone)]
struct StreetlightRuntimeState {
    id: u32,
    is_on: bool,
    flicker: f32,
}

/// Primary WebAssembly simulation world facade.
#[wasm_bindgen]
pub struct NeonWorld {
    layout: BlockLayout,
    block_layout_json: String,
    env: EnvironmentSim,
    traffic: TrafficSim,
    pedestrians: PedestrianSim,
    water: WaterSim,
    particles: ParticleSim,
    easter_eggs: EasterEggSim,
    sign_runtimes: Vec<SignRuntimeState>,
    streetlight_runtimes: Vec<StreetlightRuntimeState>,

    // Cached GPU linear buffers
    cars_buffer: Vec<f32>,
    trails_buffer: Vec<f32>,
    traffic_lights_buffer: Vec<f32>,
    pedestrians_buffer: Vec<f32>,
    particles_buffer: Vec<f32>,
    ripples_buffer: Vec<f32>,
    sign_states_buffer: Vec<f32>,
    streetlight_states_buffer: Vec<f32>,
}

#[wasm_bindgen]
impl NeonWorld {
    /// Initialize a new simulation block with deterministic procedural generation.
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Self {
        let layout = generate_block(seed);
        let block_layout_json = serde_json::to_string(&layout).unwrap_or_default();
        let env = EnvironmentSim::new(seed);
        let traffic = TrafficSim::new(seed.wrapping_add(1));
        let pedestrians = PedestrianSim::new(seed.wrapping_add(2));
        let water = WaterSim::new(seed.wrapping_add(3));
        let particles = ParticleSim::new(seed.wrapping_add(4));
        let easter_eggs = EasterEggSim::new(seed.wrapping_add(5));

        let sign_runtimes = layout
            .signs
            .iter()
            .map(|s| SignRuntimeState {
                id: s.id,
                glitch_timer: 0.0,
                flicker_offset: (s.id as f32 * 0.381_966).fract(),
            })
            .collect();

        let streetlight_runtimes = layout
            .streetlights
            .iter()
            .map(|l| StreetlightRuntimeState {
                id: l.id,
                is_on: l.initial_on,
                flicker: 1.0,
            })
            .collect();

        let mut world = Self {
            layout,
            block_layout_json,
            env,
            traffic,
            pedestrians,
            water,
            particles,
            easter_eggs,
            sign_runtimes,
            streetlight_runtimes,
            cars_buffer: Vec::new(),
            trails_buffer: Vec::new(),
            traffic_lights_buffer: Vec::new(),
            pedestrians_buffer: Vec::new(),
            particles_buffer: Vec::new(),
            ripples_buffer: Vec::new(),
            sign_states_buffer: Vec::new(),
            streetlight_states_buffer: Vec::new(),
        };

        world.sync_buffers();
        world
    }

    /// Regenerate the street layout with a new seed while preserving environment time, weather, and fog settings.
    pub fn regenerate(&mut self, seed: u32) -> String {
        let time_hours = self.env.time_hours();
        let auto_cycle = self.env.auto_cycle();
        let weather = self.env.weather();
        let fog_enabled = self.env.fog_enabled();

        self.layout = generate_block(seed);
        self.block_layout_json = serde_json::to_string(&self.layout).unwrap_or_default();
        self.traffic = TrafficSim::new(seed.wrapping_add(1));
        self.pedestrians = PedestrianSim::new(seed.wrapping_add(2));
        self.water = WaterSim::new(seed.wrapping_add(3));
        self.particles = ParticleSim::new(seed.wrapping_add(4));
        self.easter_eggs = EasterEggSim::new(seed.wrapping_add(5));

        self.sign_runtimes = self
            .layout
            .signs
            .iter()
            .map(|s| SignRuntimeState {
                id: s.id,
                glitch_timer: 0.0,
                flicker_offset: (s.id as f32 * 0.381_966).fract(),
            })
            .collect();

        self.streetlight_runtimes = self
            .layout
            .streetlights
            .iter()
            .map(|l| StreetlightRuntimeState {
                id: l.id,
                is_on: l.initial_on,
                flicker: 1.0,
            })
            .collect();

        self.env.set_time_hours(time_hours);
        self.env.set_auto_cycle(auto_cycle);
        self.env.set_weather(weather);
        self.env.set_fog_enabled(fog_enabled);

        self.sync_buffers();
        self.block_layout_json.clone()
    }

    /// Read full block layout JSON string.
    pub fn get_block_layout_json(&self) -> String {
        self.block_layout_json.clone()
    }

    /// Advance the simulation by delta time `dt` seconds (clamped to `[0.0, 0.1]`).
    pub fn step(&mut self, dt: f32) {
        let clamped_dt = dt.clamp(0.0, 0.1);
        if clamped_dt <= 0.0 {
            return;
        }

        // 1. Advance atmospheric environment
        self.env.step(clamped_dt);
        let atmo = self.env.state();

        // 2. Advance street traffic
        self.traffic.step(clamped_dt, &atmo);
        let crosswalk_safe = self.traffic.is_crosswalk_safe();

        // 3. Advance pedestrians
        self.pedestrians.step(clamped_dt, &atmo, crosswalk_safe);

        // 4. Advance canal water ripples
        self.water.step(clamped_dt, &atmo);

        // 5. Advance weather particles
        self.particles.step(clamped_dt, &atmo);

        // 6. Advance Easter eggs
        self.easter_eggs.step(clamped_dt);

        // 7. Decay sign glitch timers
        for sign in &mut self.sign_runtimes {
            if sign.glitch_timer > 0.0 {
                sign.glitch_timer = (sign.glitch_timer - clamped_dt).max(0.0);
            }
        }

        // 8. Synchronize all linear GPU buffers
        self.sync_buffers();
    }

    /// Set time of day in hours `[0.0, 24.0)`.
    pub fn set_time_hours(&mut self, hours: f32) {
        self.env.set_time_hours(hours);
    }

    /// Enable or disable automatic 24-hour day/night cycling.
    pub fn set_auto_cycle(&mut self, enabled: bool) {
        self.env.set_auto_cycle(enabled);
    }

    /// Change weather condition ("clear" | "rain" | "heavy_rain" | "snow").
    pub fn set_weather(&mut self, weather: &str) {
        self.env.set_weather(WeatherKind::from_str_lossy(weather));
        let atmo = self.env.state();
        self.particles.step(0.016, &atmo);
        self.sync_buffers();
    }

    /// Enable or disable distance atmospheric fog.
    pub fn set_fog_enabled(&mut self, enabled: bool) {
        self.env.set_fog_enabled(enabled);
    }

    /// Trigger a neon sign electrical glitch burst (duration: 1.45s).
    ///
    /// Immediately refreshes the sign states buffer so the effect is observable without delay.
    pub fn trigger_sign_glitch(&mut self, sign_id: u32) -> bool {
        let mut found = false;
        for sign in &mut self.sign_runtimes {
            if sign.id == sign_id {
                sign.glitch_timer = 1.45;
                found = true;
                break;
            }
        }

        if found {
            self.sync_sign_states_buffer();
        }
        found
    }

    /// Toggle an individual streetlight on/off.
    ///
    /// Immediately refreshes the streetlight states buffer and returns the new power state.
    pub fn toggle_streetlight(&mut self, light_id: u32) -> bool {
        let mut new_state = false;
        let mut found = false;

        for light in &mut self.streetlight_runtimes {
            if light.id == light_id {
                light.is_on = !light.is_on;
                new_state = light.is_on;
                found = true;
                break;
            }
        }

        if found {
            self.sync_streetlight_states_buffer();
            new_state
        } else {
            false
        }
    }

    /// Spawn a water ripple on the canal or street puddle.
    ///
    /// Immediately refreshes the ripples buffer and returns the current active ripple count.
    pub fn spawn_water_ripple(&mut self, x: f32, z: f32, strength: f32) -> u32 {
        let active = self.water.spawn_ripple(x, z, strength);
        self.water.write_ripples_buffer(&mut self.ripples_buffer);
        active
    }

    /// Trigger an Easter egg event ("ufo" | "cat" | "neon_sync").
    pub fn trigger_easter_egg(&mut self, kind: &str) {
        let egg = match kind {
            "ufo" => EasterEggKind::Ufo,
            "cat" => EasterEggKind::Cat,
            "neon_sync" => EasterEggKind::NeonSync,
            _ => EasterEggKind::None,
        };
        self.easter_eggs.trigger(egg);
    }

    /// Serialize current atmospheric parameters to JSON string.
    pub fn get_atmosphere_json(&self) -> String {
        serde_json::to_string(&self.env.state()).unwrap_or_default()
    }

    /// Serialize current Easter egg state to JSON string.
    pub fn get_easter_egg_json(&self) -> String {
        serde_json::to_string(self.easter_eggs.state()).unwrap_or_default()
    }

    /// Get current linear car slots buffer (`CAR_STRIDE = 10`).
    pub fn get_cars_buffer(&self) -> Vec<f32> {
        self.cars_buffer.clone()
    }

    /// Get current linear neon taillight trails buffer (`TRAIL_STRIDE = 8`).
    pub fn get_trails_buffer(&self) -> Vec<f32> {
        self.trails_buffer.clone()
    }

    /// Get current traffic light states buffer (`TRAFFIC_LIGHT_STRIDE = 4`).
    pub fn get_traffic_lights_buffer(&self) -> Vec<f32> {
        self.traffic_lights_buffer.clone()
    }

    /// Get current pedestrian poses buffer (`PEDESTRIAN_STRIDE = 8`).
    pub fn get_pedestrians_buffer(&self) -> Vec<f32> {
        self.pedestrians_buffer.clone()
    }

    /// Get current precipitation particles buffer (`PARTICLE_STRIDE = 6`).
    pub fn get_particles_buffer(&self) -> Vec<f32> {
        self.particles_buffer.clone()
    }

    /// Get current water ripples buffer (`RIPPLE_STRIDE = 4`).
    pub fn get_ripples_buffer(&self) -> Vec<f32> {
        self.ripples_buffer.clone()
    }

    /// Get current neon sign states buffer (`SIGN_STATE_STRIDE = 3`).
    pub fn get_sign_states_buffer(&self) -> Vec<f32> {
        self.sign_states_buffer.clone()
    }

    /// Get current streetlight states buffer (`STREETLIGHT_STATE_STRIDE = 2`).
    pub fn get_streetlight_states_buffer(&self) -> Vec<f32> {
        self.streetlight_states_buffer.clone()
    }

    /// Get current continuous canal wave phase.
    pub fn get_water_wave_phase(&self) -> f32 {
        self.water.wave_phase()
    }

    // ------------------------------------------------------------------------
    // Internal Buffer Synchronization
    // ------------------------------------------------------------------------

    fn sync_buffers(&mut self) {
        let atmo = self.env.state();
        self.traffic.write_cars_buffer(&mut self.cars_buffer);
        self.traffic.write_trails_buffer(&mut self.trails_buffer, &atmo);
        self.traffic.write_traffic_lights_buffer(&mut self.traffic_lights_buffer);
        self.pedestrians.write_buffer(&mut self.pedestrians_buffer, &atmo);
        self.particles.write_buffer(&mut self.particles_buffer);
        self.water.write_ripples_buffer(&mut self.ripples_buffer);
        self.sync_sign_states_buffer();
        self.sync_streetlight_states_buffer();
    }

    fn sync_sign_states_buffer(&mut self) {
        self.sign_states_buffer.clear();
        self.sign_states_buffer.reserve(self.sign_runtimes.len() * SIGN_STATE_STRIDE);

        for sign in &self.sign_runtimes {
            let glitch_amount = (sign.glitch_timer / 1.45).clamp(0.0, 1.0);
            let brightness = 1.0;
            self.sign_states_buffer.push(brightness);
            self.sign_states_buffer.push(glitch_amount);
            self.sign_states_buffer.push(sign.flicker_offset);
        }
    }

    fn sync_streetlight_states_buffer(&mut self) {
        self.streetlight_states_buffer.clear();
        self.streetlight_states_buffer
            .reserve(self.streetlight_runtimes.len() * STREETLIGHT_STATE_STRIDE);

        for light in &self.streetlight_runtimes {
            let is_on = if light.is_on { 1.0 } else { 0.0 };
            self.streetlight_states_buffer.push(is_on);
            self.streetlight_states_buffer.push(light.flicker);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_neon_world_initialization_and_strides() {
        let world = NeonWorld::new(42);

        // Block layout JSON
        let layout_json = world.get_block_layout_json();
        assert!(!layout_json.is_empty());
        let layout: BlockLayout = serde_json::from_str(&layout_json).unwrap();
        assert_eq!(layout.seed, 42);

        // Check buffer strides and sizes
        let cars = world.get_cars_buffer();
        assert_eq!(cars.len(), 16 * CAR_STRIDE);

        let trails = world.get_trails_buffer();
        assert_eq!(trails.len() % TRAIL_STRIDE, 0);

        let lights = world.get_traffic_lights_buffer();
        assert_eq!(lights.len(), 2 * TRAFFIC_LIGHT_STRIDE);

        let peds = world.get_pedestrians_buffer();
        assert_eq!(peds.len(), 24 * PEDESTRIAN_STRIDE);

        let sign_states = world.get_sign_states_buffer();
        assert_eq!(sign_states.len(), layout.signs.len() * SIGN_STATE_STRIDE);

        let streetlights = world.get_streetlight_states_buffer();
        assert_eq!(
            streetlights.len(),
            layout.streetlights.len() * STREETLIGHT_STATE_STRIDE
        );
    }

    #[test]
    fn test_regenerate_preserves_environment() {
        let mut world = NeonWorld::new(10);
        world.set_time_hours(3.5);
        world.set_auto_cycle(true);
        world.set_weather("snow");
        world.set_fog_enabled(false);

        let new_json = world.regenerate(99);
        let new_layout: BlockLayout = serde_json::from_str(&new_json).unwrap();
        assert_eq!(new_layout.seed, 99);

        let atmo_json = world.get_atmosphere_json();
        let atmo: AtmosphereState = serde_json::from_str(&atmo_json).unwrap();
        assert!((atmo.time_hours - 3.5).abs() < 1e-4);
        assert!(atmo.auto_cycle);
        assert_eq!(atmo.weather, WeatherKind::Snow);
        assert!(!atmo.fog_enabled);
    }

    #[test]
    fn test_trigger_sign_glitch_and_toggle_streetlight() {
        let mut world = NeonWorld::new(77);
        let layout: BlockLayout =
            serde_json::from_str(&world.get_block_layout_json()).unwrap();

        let first_sign_id = layout.signs[0].id;
        let glitch_ok = world.trigger_sign_glitch(first_sign_id);
        assert!(glitch_ok);

        let sign_buf = world.get_sign_states_buffer();
        // First sign glitchAmount should now be 1.0
        assert_eq!(sign_buf[1], 1.0);

        let first_light_id = layout.streetlights[0].id;
        let initial_on = layout.streetlights[0].initial_on;
        let toggled_state = world.toggle_streetlight(first_light_id);
        assert_eq!(toggled_state, !initial_on);

        let light_buf = world.get_streetlight_states_buffer();
        let expected_val = if toggled_state { 1.0 } else { 0.0 };
        assert_eq!(light_buf[0], expected_val);
    }

    #[test]
    fn test_spawn_water_ripple_and_easter_egg() {
        let mut world = NeonWorld::new(88);
        assert_eq!(world.get_ripples_buffer().len(), 0);

        let active = world.spawn_water_ripple(0.0, 12.0, 1.0);
        assert_eq!(active, 1);
        let ripples = world.get_ripples_buffer();
        assert_eq!(ripples.len(), RIPPLE_STRIDE);

        world.trigger_easter_egg("ufo");
        let egg_json = world.get_easter_egg_json();
        let egg: EasterEggState = serde_json::from_str(&egg_json).unwrap();
        assert_eq!(egg.active_kind, EasterEggKind::Ufo);
        assert_eq!(egg.triggered_count, 1);
    }
}
