//! Dynamic atmospheric street events and Easter eggs.
//!
//! Controls synchronized neon grid surges, roof UFO flybys with tractor beams,
//! and stray black cats dashing across the street crosswalk.

use std::f32::consts::TAU;

use crate::rng::Rng;
use crate::types::{EasterEggKind, EasterEggState};

pub const UFO_DURATION: f32 = 11.0;
pub const CAT_DURATION: f32 = 5.5;
pub const NEON_SYNC_DURATION: f32 = 2.6;

/// State controller for spontaneous and interactive cyberpunk Easter eggs.
#[derive(Debug, Clone)]
pub struct EasterEggSim {
    state: EasterEggState,
    current_elapsed: f32,
    current_duration: f32,
    timer_until_next: f32,
    cat_x: f32,
    rng: Rng,
}

impl EasterEggSim {
    /// Create a new Easter egg simulator with initial delay of 30..55s.
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng::new(seed.wrapping_add(0x428A_2F98) as u64);
        let timer_until_next = rng.range_f32(30.0, 55.0);

        Self {
            state: EasterEggState::default(),
            current_elapsed: 0.0,
            current_duration: 0.0,
            timer_until_next,
            cat_x: 0.0,
            rng,
        }
    }

    /// Read-only snapshot of current Easter egg state for rendering.
    #[inline]
    pub fn state(&self) -> &EasterEggState {
        &self.state
    }

    /// Manually or automatically trigger an Easter egg kind.
    pub fn trigger(&mut self, kind: EasterEggKind) {
        if matches!(kind, EasterEggKind::None) {
            self.state.active_kind = EasterEggKind::None;
            self.state.progress = 0.0;
            self.state.intensity = 0.0;
            self.current_elapsed = 0.0;
            self.current_duration = 0.0;
            self.timer_until_next = self.rng.range_f32(42.0, 78.0);
            return;
        }

        self.state.triggered_count += 1;
        self.state.active_kind = kind;
        self.current_elapsed = 0.0;

        match kind {
            EasterEggKind::Ufo => {
                self.current_duration = UFO_DURATION;
            }
            EasterEggKind::Cat => {
                self.current_duration = CAT_DURATION;
                self.cat_x = self.rng.range_f32(-14.0, 14.0);
            }
            EasterEggKind::NeonSync => {
                self.current_duration = NEON_SYNC_DURATION;
            }
            EasterEggKind::None => unreachable!(),
        }

        self.update_active_state();
    }

    /// Advance the event simulation.
    pub fn step(&mut self, dt: f32) {
        if dt <= 0.0 {
            return;
        }

        if matches!(self.state.active_kind, EasterEggKind::None) {
            // Idle cooldown: count down towards next spontaneous event
            self.timer_until_next -= dt;
            if self.timer_until_next <= 0.0 {
                // Choose randomly among UFO, Cat, and NeonSync
                let pick = match self.rng.next_u32() % 3 {
                    0 => EasterEggKind::Ufo,
                    1 => EasterEggKind::Cat,
                    _ => EasterEggKind::NeonSync,
                };
                self.trigger(pick);
            }
        } else {
            // Active event progression
            self.current_elapsed += dt;

            if self.current_elapsed >= self.current_duration {
                // Finished
                self.state.active_kind = EasterEggKind::None;
                self.state.progress = 0.0;
                self.state.intensity = 0.0;
                self.timer_until_next = self.rng.range_f32(42.0, 78.0);
            } else {
                self.update_active_state();
            }
        }
    }

    fn update_active_state(&mut self) {
        let dur = self.current_duration.max(0.001);
        let progress = (self.current_elapsed / dur).clamp(0.0, 1.0);
        self.state.progress = progress;

        match self.state.active_kind {
            EasterEggKind::Ufo => {
                // x moves from -44 to +44
                self.state.x = -44.0 + progress * 88.0;
                // y gentle sine wave hover at ~19.5
                self.state.y = 19.5 + (progress * TAU * 1.5).sin() * 1.6;
                // z gentle cosine wave
                self.state.z = -6.0 + (progress * TAU * 1.2).cos() * 3.5;
                self.state.yaw = 0.0;
                // Smooth fade-in and fade-out envelope
                let fade_in = (progress * 7.5).min(1.0);
                let fade_out = ((1.0 - progress) * 7.5).min(1.0);
                self.state.intensity = fade_in.min(fade_out);
            }

            EasterEggKind::Cat => {
                // Cat dashes across the street from z = -10.5 to +9.0
                self.state.x = self.cat_x;
                self.state.z = -10.5 + progress * 19.5;
                // Gentle running hops on sidewalk/street
                let hop = (progress * TAU * 4.5).sin().abs() * 0.16;
                self.state.y = 0.18 + hop;
                self.state.yaw = 0.0; // Facing +Z
                self.state.intensity = 1.0;
            }

            EasterEggKind::NeonSync => {
                self.state.x = 0.0;
                self.state.y = 0.0;
                self.state.z = 0.0;
                self.state.yaw = 0.0;
                // Street-wide synchronized voltage surge pulses
                let pulse = (progress * TAU * 2.5).sin().abs();
                self.state.intensity = (0.75 + 0.85 * pulse) * (1.0 - progress * 0.25);
            }

            EasterEggKind::None => {
                self.state.intensity = 0.0;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_state() {
        let sim = EasterEggSim::new(42);
        let s = sim.state();
        assert_eq!(s.active_kind, EasterEggKind::None);
        assert_eq!(s.triggered_count, 0);
        assert_eq!(s.intensity, 0.0);
    }

    #[test]
    fn test_trigger_ufo() {
        let mut sim = EasterEggSim::new(123);
        sim.trigger(EasterEggKind::Ufo);

        assert_eq!(sim.state().active_kind, EasterEggKind::Ufo);
        assert_eq!(sim.state().triggered_count, 1);
        assert_eq!(sim.state().x, -44.0);

        // Step halfway
        sim.step(UFO_DURATION * 0.5);
        assert!((sim.state().x - 0.0).abs() < 1.0);
        assert!(sim.state().intensity > 0.8);

        // Step past completion
        sim.step(UFO_DURATION * 0.6);
        assert_eq!(sim.state().active_kind, EasterEggKind::None);
    }

    #[test]
    fn test_trigger_cat() {
        let mut sim = EasterEggSim::new(456);
        sim.trigger(EasterEggKind::Cat);

        assert_eq!(sim.state().active_kind, EasterEggKind::Cat);
        assert_eq!(sim.state().triggered_count, 1);
        assert_eq!(sim.state().z, -10.5);

        // Step to completion
        sim.step(CAT_DURATION + 0.1);
        assert_eq!(sim.state().active_kind, EasterEggKind::None);
    }

    #[test]
    fn test_trigger_neon_sync() {
        let mut sim = EasterEggSim::new(789);
        sim.trigger(EasterEggKind::NeonSync);

        assert_eq!(sim.state().active_kind, EasterEggKind::NeonSync);
        assert!(sim.state().intensity > 0.0);

        sim.step(NEON_SYNC_DURATION + 0.1);
        assert_eq!(sim.state().active_kind, EasterEggKind::None);
    }
}
