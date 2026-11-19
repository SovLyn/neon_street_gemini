//! Interactive canal water ripples and flowing wave dynamics.
//!
//! Maintains expanding water ring waves triggered by rain impacts, clicks,
//! or splashes, advancing wave phase and packing into linear GPU buffers.

use std::f32::consts::TAU;

use crate::rng::Rng;
use crate::types::{AtmosphereState, MAX_RIPPLES, RIPPLE_STRIDE};

/// Individual circular water ripple expanding across the canal or puddle surface.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ripple {
    pub x: f32,
    pub z: f32,
    pub radius: f32,
    pub strength: f32,
    pub age: f32,
}

/// Canal water surface simulation with wave phase tracking and dynamic ripple pool.
#[derive(Debug, Clone)]
pub struct WaterSim {
    ripples: Vec<Ripple>,
    wave_phase: f32,
    rain_ripple_timer: f32,
    rng: Rng,
}

impl WaterSim {
    /// Create a new water simulation initialized deterministically from seed.
    pub fn new(seed: u32) -> Self {
        Self {
            ripples: Vec::with_capacity(MAX_RIPPLES),
            wave_phase: 0.0,
            rain_ripple_timer: 0.0,
            rng: Rng::new(seed.wrapping_add(0x85EB_CA6B) as u64),
        }
    }

    /// Current continuous flowing wave phase for water shader distortion.
    #[inline]
    pub fn wave_phase(&self) -> f32 {
        self.wave_phase
    }

    /// Read-only access to currently active ripples.
    pub fn ripples(&self) -> &[Ripple] {
        &self.ripples
    }

    /// Spawn a new water ripple.
    ///
    /// If the ripple pool (`MAX_RIPPLES = 16`) is full, evicts the weakest/oldest ripple.
    /// Returns the count of currently active ripples.
    pub fn spawn_ripple(&mut self, x: f32, z: f32, strength: f32) -> u32 {
        let clamped_strength = strength.clamp(0.1, 2.0);
        let new_ripple = Ripple {
            x,
            z,
            radius: 0.15,
            strength: clamped_strength,
            age: 0.0,
        };

        if self.ripples.len() >= MAX_RIPPLES {
            // Find index of weakest or oldest ripple
            let mut best_idx = 0;
            let mut min_val = f32::INFINITY;

            for (idx, r) in self.ripples.iter().enumerate() {
                // Prioritize evicting low strength; tie-break with older age
                let score = r.strength - r.age * 0.05;
                if score < min_val {
                    min_val = score;
                    best_idx = idx;
                }
            }

            self.ripples[best_idx] = new_ripple;
        } else {
            self.ripples.push(new_ripple);
        }

        self.ripples.len() as u32
    }

    /// Advance water simulation by delta time `dt` in seconds.
    pub fn step(&mut self, dt: f32, atmosphere: &AtmosphereState) {
        if dt <= 0.0 {
            return;
        }

        // 1. Advance wave phase smoothly
        self.wave_phase = (self.wave_phase + dt * 1.8).rem_euclid(TAU);

        // 2. Expand and decay active ripples
        // Decay rate calibrated so strength ~1.0 decays over ~2.4 seconds (1.0 / 2.4 ~ 0.417)
        let decay_rate = 1.0 / 2.4;
        let expansion_speed = 3.8;

        for r in &mut self.ripples {
            r.age += dt;
            r.radius += dt * expansion_speed;
            r.strength -= dt * decay_rate;
        }

        // Drop fully faded ripples
        self.ripples.retain(|r| r.strength >= 0.02);

        // 3. Ambient raindrop ripples on canal during rain
        if atmosphere.rain_intensity > 0.1 && self.ripples.len() < 10 {
            self.rain_ripple_timer += dt * atmosphere.rain_intensity * 4.8;
            while self.rain_ripple_timer >= 1.0 && self.ripples.len() < 10 {
                self.rain_ripple_timer -= 1.0;
                let rx = self.rng.range_f32(-32.0, 32.0);
                let rz = self.rng.range_f32(10.2, 16.8);
                let r_strength = self.rng.range_f32(0.3, 0.45);
                self.spawn_ripple(rx, rz, r_strength);
            }
        }
    }

    /// Pack active ripples into linear float32 buffer with `RIPPLE_STRIDE = 4`.
    ///
    /// Stride: `[x, z, radius, strength]`
    pub fn write_ripples_buffer(&self, out: &mut Vec<f32>) {
        out.clear();
        out.reserve(self.ripples.len() * RIPPLE_STRIDE);

        for r in &self.ripples {
            out.push(r.x);
            out.push(r.z);
            out.push(r.radius);
            out.push(r.strength);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_and_pool_limit() {
        let mut sim = WaterSim::new(101);
        assert_eq!(sim.ripples().len(), 0);

        for i in 0..MAX_RIPPLES {
            let count = sim.spawn_ripple(i as f32, 12.0, 1.0);
            assert_eq!(count, (i + 1) as u32);
        }
        assert_eq!(sim.ripples().len(), MAX_RIPPLES);

        // Spawning 17th should evict and stay clamped at MAX_RIPPLES
        let count = sim.spawn_ripple(99.0, 12.0, 1.5);
        assert_eq!(count, MAX_RIPPLES as u32);
        assert_eq!(sim.ripples().len(), MAX_RIPPLES);
    }

    #[test]
    fn test_expansion_and_decay() {
        let mut sim = WaterSim::new(202);
        sim.spawn_ripple(0.0, 12.0, 1.0);
        let atmo = AtmosphereState::default(); // rain_intensity = 0

        let initial_radius = sim.ripples()[0].radius;
        let initial_strength = sim.ripples()[0].strength;

        sim.step(0.5, &atmo);
        assert!(sim.ripples()[0].radius > initial_radius);
        assert!(sim.ripples()[0].strength < initial_strength);

        // After > 2.5 seconds total, initial ripple should decay below 0.02 and be dropped
        sim.step(2.2, &atmo);
        assert_eq!(sim.ripples().len(), 0);
    }

    #[test]
    fn test_buffer_writing() {
        let mut sim = WaterSim::new(303);
        sim.spawn_ripple(5.0, 14.0, 0.8);
        sim.spawn_ripple(-8.0, 11.5, 1.2);

        let mut buf = Vec::new();
        sim.write_ripples_buffer(&mut buf);
        assert_eq!(buf.len(), 2 * RIPPLE_STRIDE);
        assert_eq!(buf[0], 5.0);
        assert_eq!(buf[1], 14.0);
        assert_eq!(buf[2], 0.15);
        assert!((buf[3] - 0.8).abs() < 1e-4);
    }
}
