//! Rain and snow particle simulation pool with wind advection, swirling flutter, and wrap-around.

use std::f32::consts::TAU;

use crate::rng::Rng;
use crate::types::{AtmosphereState, WeatherKind, PARTICLE_STRIDE};

/// Total particle capacity in the simulation pool.
pub const TOTAL_PARTICLE_POOL: usize = 760;

/// Rain active particle counts.
pub const HEAVY_RAIN_PARTICLES: usize = 760;
pub const RAIN_PARTICLES: usize = 380;
pub const SNOW_PARTICLES: usize = 500;

/// Spatial bounds for particles around the neon block.
pub const PARTICLE_X_MIN: f32 = -40.0;
pub const PARTICLE_X_MAX: f32 = 40.0;
pub const PARTICLE_Y_MIN: f32 = -0.4;
pub const PARTICLE_Y_MAX: f32 = 28.0;
pub const PARTICLE_Z_MIN: f32 = -16.0;
pub const PARTICLE_Z_MAX: f32 = 26.0;

#[derive(Debug, Clone)]
struct Particle {
    x: f32,
    y: f32,
    z: f32,
    vx: f32,
    vy: f32,
    kind: f32, // 0.0 = rain, 1.0 = snow
    rain_fall_speed: f32,
    snow_fall_speed: f32,
    sway_offset: f32,
    sway_speed: f32,
}

/// Atmospheric precipitation simulator.
#[derive(Debug, Clone)]
pub struct ParticleSim {
    particles: Vec<Particle>,
    active_count: usize,
    time: f32,
    rng: Rng,
}

impl ParticleSim {
    /// Create and initialize the particle simulation pool deterministically.
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng::new(seed.wrapping_add(0x6A09_E667) as u64);
        let mut particles = Vec::with_capacity(TOTAL_PARTICLE_POOL);

        for _ in 0..TOTAL_PARTICLE_POOL {
            let x = rng.range_f32(PARTICLE_X_MIN, PARTICLE_X_MAX);
            let y = rng.range_f32(PARTICLE_Y_MIN, PARTICLE_Y_MAX);
            let z = rng.range_f32(PARTICLE_Z_MIN, PARTICLE_Z_MAX);
            let rain_fall_speed = rng.range_f32(22.0, 30.0);
            let snow_fall_speed = rng.range_f32(1.8, 3.4);
            let sway_offset = rng.range_f32(0.0, TAU);
            let sway_speed = rng.range_f32(1.8, 3.5);

            particles.push(Particle {
                x,
                y,
                z,
                vx: 0.0,
                vy: -rain_fall_speed,
                kind: 0.0,
                rain_fall_speed,
                snow_fall_speed,
                sway_offset,
                sway_speed,
            });
        }

        Self {
            particles,
            active_count: 0,
            time: 0.0,
            rng,
        }
    }

    /// Read-only access to total pool capacity.
    #[inline]
    pub fn total_pool_size(&self) -> usize {
        TOTAL_PARTICLE_POOL
    }

    /// Current active particle count.
    #[inline]
    pub fn active_count(&self) -> usize {
        self.active_count
    }

    /// Advance particle positions based on current atmospheric conditions and wind.
    pub fn step(&mut self, dt: f32, atmosphere: &AtmosphereState) {
        self.active_count = match atmosphere.weather {
            WeatherKind::HeavyRain => HEAVY_RAIN_PARTICLES,
            WeatherKind::Rain => RAIN_PARTICLES,
            WeatherKind::Snow => SNOW_PARTICLES,
            WeatherKind::Clear => 0,
        };

        if self.active_count == 0 || dt <= 0.0 {
            return;
        }

        self.time += dt;
        let is_snow = matches!(atmosphere.weather, WeatherKind::Snow);
        let wind_x = atmosphere.wind_x;

        for i in 0..self.active_count {
            let p = &mut self.particles[i];

            if is_snow {
                p.kind = 1.0;
                p.vy = -p.snow_fall_speed;
                let sway = (self.time * p.sway_speed + p.sway_offset).sin() * 0.75;
                p.vx = wind_x * 0.9 + sway;

                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += (self.time * (p.sway_speed * 0.7) + p.sway_offset).cos() * 0.35 * dt;
            } else {
                p.kind = 0.0;
                p.vy = -p.rain_fall_speed;
                p.vx = wind_x * 2.5;

                p.x += p.vx * dt;
                p.y += p.vy * dt;
            }

            // Wrap-around bounds check
            if p.y < PARTICLE_Y_MIN {
                p.y = PARTICLE_Y_MAX - self.rng.range_f32(0.0, 1.5);
                p.x = self.rng.range_f32(PARTICLE_X_MIN, PARTICLE_X_MAX);
                p.z = self.rng.range_f32(PARTICLE_Z_MIN, PARTICLE_Z_MAX);
            }

            if p.x < PARTICLE_X_MIN {
                p.x += PARTICLE_X_MAX - PARTICLE_X_MIN;
            } else if p.x > PARTICLE_X_MAX {
                p.x -= PARTICLE_X_MAX - PARTICLE_X_MIN;
            }

            if p.z < PARTICLE_Z_MIN {
                p.z += PARTICLE_Z_MAX - PARTICLE_Z_MIN;
            } else if p.z > PARTICLE_Z_MAX {
                p.z -= PARTICLE_Z_MAX - PARTICLE_Z_MIN;
            }
        }
    }

    /// Pack active particles into linear float32 buffer with `PARTICLE_STRIDE = 6`.
    ///
    /// Stride: `[x, y, z, vx, vy, kind]`
    pub fn write_buffer(&self, out: &mut Vec<f32>) {
        out.clear();
        if self.active_count == 0 {
            return;
        }

        out.reserve(self.active_count * PARTICLE_STRIDE);
        for p in self.particles.iter().take(self.active_count) {
            out.push(p.x);
            out.push(p.y);
            out.push(p.z);
            out.push(p.vx);
            out.push(p.vy);
            out.push(p.kind);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_particle_weather_activation() {
        let mut sim = ParticleSim::new(55);

        // 1. Clear: 0 particles
        let clear_atmo = AtmosphereState {
            weather: WeatherKind::Clear,
            ..AtmosphereState::default()
        };
        sim.step(0.05, &clear_atmo);
        assert_eq!(sim.active_count(), 0);
        let mut buf = Vec::new();
        sim.write_buffer(&mut buf);
        assert!(buf.is_empty());

        // 2. Rain: 380 particles, kind = 0.0
        let rain_atmo = AtmosphereState {
            weather: WeatherKind::Rain,
            ..AtmosphereState::default()
        };
        sim.step(0.05, &rain_atmo);
        assert_eq!(sim.active_count(), RAIN_PARTICLES);
        sim.write_buffer(&mut buf);
        assert_eq!(buf.len(), RAIN_PARTICLES * PARTICLE_STRIDE);
        assert_eq!(buf[5], 0.0); // kind = rain

        // 3. HeavyRain: 760 particles, kind = 0.0
        let heavy_atmo = AtmosphereState {
            weather: WeatherKind::HeavyRain,
            ..AtmosphereState::default()
        };
        sim.step(0.05, &heavy_atmo);
        assert_eq!(sim.active_count(), HEAVY_RAIN_PARTICLES);
        sim.write_buffer(&mut buf);
        assert_eq!(buf.len(), HEAVY_RAIN_PARTICLES * PARTICLE_STRIDE);
        assert_eq!(buf[5], 0.0);

        // 4. Snow: 500 particles, kind = 1.0
        let snow_atmo = AtmosphereState {
            weather: WeatherKind::Snow,
            ..AtmosphereState::default()
        };
        sim.step(0.05, &snow_atmo);
        assert_eq!(sim.active_count(), SNOW_PARTICLES);
        sim.write_buffer(&mut buf);
        assert_eq!(buf.len(), SNOW_PARTICLES * PARTICLE_STRIDE);
        assert_eq!(buf[5], 1.0); // kind = snow
    }

    #[test]
    fn test_particle_velocities_and_wrapping() {
        let mut sim = ParticleSim::new(99);
        let atmo = AtmosphereState {
            weather: WeatherKind::Rain,
            wind_x: 2.0,
            ..AtmosphereState::default()
        };

        sim.step(0.1, &atmo);
        let mut buf = Vec::new();
        sim.write_buffer(&mut buf);

        // Check vy in [-31, -21] and vx driven by wind
        let vy = buf[4];
        let vx = buf[3];
        assert!((-31.0..=-21.0).contains(&vy), "vy was {}", vy);
        assert!((vx - 5.0).abs() < 1e-3, "vx was expected 5.0, got {}", vx);
    }
}
