//! Environment and atmospheric simulation state machine.
//!
//! Models smooth, physically intuitive 24-hour day/night cycles,
//! weather transitions, fog density, street wetness, traffic density curves,
//! and wind gusts.

use std::f32::consts::TAU;

use crate::rng::noise2d;
use crate::types::{AtmosphereState, WeatherKind};

/// Atmospheric environment state machine.
#[derive(Debug, Clone)]
pub struct EnvironmentSim {
    time_hours: f32,
    auto_cycle: bool,
    weather: WeatherKind,
    fog_enabled: bool,
    elapsed_sec: f32,
    wetness: f32,
    cycle_speed_hours_per_sec: f32,
    seed: u32,
}

impl EnvironmentSim {
    /// Create a new environment simulator initialized to default evening cyberpunk ambiance.
    pub fn new(seed: u32) -> Self {
        let initial_weather = WeatherKind::Clear;
        let initial_wetness = Self::target_wetness_for(initial_weather);

        Self {
            time_hours: 21.0, // Default to gorgeous 21:00 evening neon peak
            auto_cycle: false,
            weather: initial_weather,
            fog_enabled: true,
            elapsed_sec: 0.0,
            wetness: initial_wetness,
            cycle_speed_hours_per_sec: 0.45, // Full 24h cycle in ~53.3 seconds when enabled
            seed,
        }
    }

    /// Set time of day in hours `[0.0, 24.0)`.
    pub fn set_time_hours(&mut self, hours: f32) {
        self.time_hours = (hours % 24.0 + 24.0) % 24.0;
    }

    /// Current time of day in hours.
    pub fn time_hours(&self) -> f32 {
        self.time_hours
    }

    /// Enable or disable automatic 24-hour time progression.
    pub fn set_auto_cycle(&mut self, enabled: bool) {
        self.auto_cycle = enabled;
    }

    /// Whether automatic time progression is active.
    pub fn auto_cycle(&self) -> bool {
        self.auto_cycle
    }

    /// Set cycle speed in hours per real-time second.
    pub fn set_cycle_speed_hours_per_sec(&mut self, speed: f32) {
        self.cycle_speed_hours_per_sec = speed.max(0.0);
    }

    /// Set current weather condition.
    ///
    /// Immediately sets `wetness` to target value for instant URL state/preset responsiveness.
    pub fn set_weather(&mut self, weather: WeatherKind) {
        self.weather = weather;
        self.wetness = self.target_wetness();
    }

    /// Current weather condition.
    pub fn weather(&self) -> WeatherKind {
        self.weather
    }

    /// Enable or disable distance atmospheric fog.
    pub fn set_fog_enabled(&mut self, enabled: bool) {
        self.fog_enabled = enabled;
    }

    /// Whether atmospheric fog is enabled.
    pub fn fog_enabled(&self) -> bool {
        self.fog_enabled
    }

    /// Target road wetness for the given weather.
    fn target_wetness_for(weather: WeatherKind) -> f32 {
        match weather {
            WeatherKind::HeavyRain => 0.95,
            WeatherKind::Rain => 0.78,
            WeatherKind::Snow => 0.55,
            WeatherKind::Clear => 0.28,
        }
    }

    /// Target road wetness for current weather.
    pub fn target_wetness(&self) -> f32 {
        Self::target_wetness_for(self.weather)
    }

    /// Advance the environment simulation by delta time `dt` in seconds.
    pub fn step(&mut self, dt: f32) {
        if dt <= 0.0 {
            return;
        }

        self.elapsed_sec += dt;

        if self.auto_cycle {
            self.time_hours =
                (self.time_hours + dt * self.cycle_speed_hours_per_sec).rem_euclid(24.0);
        }

        // Smoothly approach target wetness
        let target = self.target_wetness();
        let rate = (dt * 1.5).min(1.0);
        self.wetness += (target - self.wetness) * rate;
    }

    /// Calculate complete atmosphere parameters for rendering and lighting shaders.
    pub fn state(&self) -> AtmosphereState {
        // 1. Sun elevation: peaks at +1.0 at 12:00, -1.0 at 00:00, 0.0 at 06:00 and 18:00
        let sun_angle = ((self.time_hours - 6.0) / 24.0) * TAU;
        let sun_elevation = sun_angle.sin();

        // 2. Daylight: smoothstep on sun_elevation from -0.18 to +0.38
        let daylight = smoothstep(-0.18, 0.38, sun_elevation);

        // 3. Twilight: smooth bell peaking around dawn (5:30–7:30) and dusk (17:00–19:30)
        let dawn = (-((self.time_hours - 6.5) / 1.0).powi(2)).exp();
        let dusk = (-((self.time_hours - 18.25) / 1.15).powi(2)).exp();
        let twilight = (dawn + dusk).min(1.0);

        // 4. Neon intensity:
        // Bright at night (1.35..1.55), warm glow at twilight (1.0..1.25), dimmed in daylight (0.28..0.38),
        // plus +0.10 boost in rain for atmospheric vibrancy.
        let base_neon = 1.45 * (1.0 - daylight) + 0.32 * daylight;
        let mut neon_intensity = if twilight > 0.0 {
            base_neon * (1.0 - twilight * 0.25) + 1.15 * (twilight * 0.25)
        } else {
            base_neon
        };
        if matches!(self.weather, WeatherKind::Rain | WeatherKind::HeavyRain) {
            neon_intensity += 0.10;
        }

        // 5. Window lit ratio:
        // High in evening/night (0.72..0.88 around 19:00–23:30, tapering to 0.45 at 03:00),
        // low at midday (0.10).
        let t = self.time_hours;
        let window_lit_ratio = if (19.0..=23.5).contains(&t) {
            0.82
        } else if t > 23.5 {
            let frac = (t - 23.5) / 0.5;
            0.82 - frac * 0.07 // 0.82 -> 0.75
        } else if t < 3.0 {
            let frac = t / 3.0;
            0.75 - frac * 0.30 // 0.75 -> 0.45
        } else if t < 6.0 {
            let frac = (t - 3.0) / 3.0;
            0.45 - frac * 0.35 // 0.45 -> 0.10
        } else if t < 17.0 {
            0.10 // midday baseline
        } else {
            // 17.0..19.0: smooth rise from 0.10 to 0.82
            let frac = (t - 17.0) / 2.0;
            let s = frac * frac * (3.0 - 2.0 * frac);
            0.10 + s * 0.72
        };

        // 6. Traffic density:
        // Busy at rush hour / evening neon peak (0.85..1.0 around 08:00–09:30 and 18:00–23:00),
        // moderate midday (0.68), quieter late night 02:00–05:00 (0.38).
        let traffic_density = if (2.0..=5.0).contains(&t) {
            0.38
        } else if t > 5.0 && t < 8.0 {
            let frac = (t - 5.0) / 3.0;
            0.38 + frac * 0.54 // 0.38 -> 0.92
        } else if (8.0..=9.5).contains(&t) {
            0.92 // morning rush hour
        } else if t > 9.5 && t < 12.0 {
            let frac = (t - 9.5) / 2.5;
            0.92 - frac * 0.24 // 0.92 -> 0.68
        } else if (12.0..=16.0).contains(&t) {
            0.68 // midday
        } else if t > 16.0 && t < 18.0 {
            let frac = (t - 16.0) / 2.0;
            0.68 + frac * 0.27 // 0.68 -> 0.95
        } else if (18.0..=23.0).contains(&t) {
            0.95 // evening neon peak
        } else if t > 23.0 {
            let frac = t - 23.0;
            0.95 - frac * 0.30 // 0.95 -> 0.65
        } else {
            let frac = t / 2.0;
            0.65 - frac * 0.27 // 0.65 -> 0.38
        };

        // 7. Fog density:
        // When fog_enabled: 0.022 (heavy rain), 0.016 (rain/snow), 0.012 (clear night) / 0.008 (clear day).
        // When !fog_enabled: 0.0.
        let fog_density = if !self.fog_enabled {
            0.0
        } else {
            match self.weather {
                WeatherKind::HeavyRain => 0.022,
                WeatherKind::Rain | WeatherKind::Snow => 0.016,
                WeatherKind::Clear => 0.012 - 0.004 * daylight,
            }
        };

        // 8. Rain & Snow intensity
        let rain_intensity = match self.weather {
            WeatherKind::HeavyRain => 1.0,
            WeatherKind::Rain => 0.55,
            _ => 0.0,
        };

        let snow_intensity = match self.weather {
            WeatherKind::Snow => 0.85,
            _ => 0.0,
        };

        // 9. Wind X: oscillating breeze via value noise scaled by weather
        let wind_scale = match self.weather {
            WeatherKind::HeavyRain => 1.25,
            WeatherKind::Rain => 0.78,
            WeatherKind::Snow => 0.52,
            WeatherKind::Clear => 0.32,
        };
        let wind_x = noise2d(self.elapsed_sec * 0.14, 0.0, self.seed) * wind_scale;

        AtmosphereState {
            time_hours: self.time_hours,
            auto_cycle: self.auto_cycle,
            weather: self.weather,
            fog_enabled: self.fog_enabled,
            sun_elevation,
            daylight,
            twilight,
            neon_intensity,
            window_lit_ratio,
            traffic_density,
            wetness: self.wetness,
            fog_density,
            rain_intensity,
            snow_intensity,
            wind_x,
            elapsed_sec: self.elapsed_sec,
        }
    }
}

#[inline]
fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_of_day_curves() {
        let mut sim = EnvironmentSim::new(42);

        // Test Noon (12:00)
        sim.set_time_hours(12.0);
        let noon = sim.state();
        assert!(
            (noon.sun_elevation - 1.0).abs() < 0.01,
            "Noon sun elevation expected ~1.0, got {}",
            noon.sun_elevation
        );
        assert!(
            noon.daylight > 0.99,
            "Noon daylight expected ~1.0, got {}",
            noon.daylight
        );
        assert!(
            noon.neon_intensity >= 0.28 && noon.neon_intensity <= 0.38,
            "Noon neon intensity expected [0.28, 0.38], got {}",
            noon.neon_intensity
        );
        assert!(
            (noon.window_lit_ratio - 0.10).abs() < 0.01,
            "Noon window lit ratio expected ~0.10, got {}",
            noon.window_lit_ratio
        );
        assert!(
            (noon.traffic_density - 0.68).abs() < 0.01,
            "Noon traffic density expected ~0.68, got {}",
            noon.traffic_density
        );

        // Test Night Peak (22:30)
        sim.set_time_hours(22.5);
        let night = sim.state();
        assert!(
            night.sun_elevation < -0.5,
            "Night sun elevation expected negative, got {}",
            night.sun_elevation
        );
        assert_eq!(
            night.daylight, 0.0,
            "Night daylight expected 0.0, got {}",
            night.daylight
        );
        assert!(
            night.neon_intensity >= 1.35 && night.neon_intensity <= 1.55,
            "Night neon intensity expected [1.35, 1.55], got {}",
            night.neon_intensity
        );
        assert!(
            night.window_lit_ratio >= 0.72 && night.window_lit_ratio <= 0.88,
            "Night window lit ratio expected [0.72, 0.88], got {}",
            night.window_lit_ratio
        );
        assert!(
            night.traffic_density >= 0.85 && night.traffic_density <= 1.0,
            "Night traffic density expected [0.85, 1.0], got {}",
            night.traffic_density
        );

        // Monotonic / expected contrasts between noon and night
        assert!(noon.daylight > night.daylight);
        assert!(night.neon_intensity > noon.neon_intensity);
        assert!(night.window_lit_ratio > noon.window_lit_ratio);
        assert!(night.traffic_density > noon.traffic_density);

        // Test Late Night (03:00)
        sim.set_time_hours(3.0);
        let late_night = sim.state();
        assert!(
            (late_night.window_lit_ratio - 0.45).abs() < 0.02,
            "03:00 window lit ratio expected ~0.45, got {}",
            late_night.window_lit_ratio
        );
        assert!(
            (late_night.traffic_density - 0.38).abs() < 0.01,
            "03:00 traffic density expected ~0.38, got {}",
            late_night.traffic_density
        );

        // Test Twilight peaks (dawn ~06:30 and dusk ~18:15)
        sim.set_time_hours(6.5);
        let dawn_state = sim.state();
        assert!(
            dawn_state.twilight > 0.8,
            "Dawn twilight expected high, got {}",
            dawn_state.twilight
        );

        sim.set_time_hours(18.25);
        let dusk_state = sim.state();
        assert!(
            dusk_state.twilight > 0.8,
            "Dusk twilight expected high, got {}",
            dusk_state.twilight
        );
    }

    #[test]
    fn test_weather_and_wetness() {
        let mut sim = EnvironmentSim::new(100);

        sim.set_weather(WeatherKind::Clear);
        assert_eq!(sim.state().wetness, 0.28);
        assert_eq!(sim.state().rain_intensity, 0.0);
        assert_eq!(sim.state().snow_intensity, 0.0);

        sim.set_weather(WeatherKind::Rain);
        assert_eq!(sim.state().wetness, 0.78);
        assert_eq!(sim.state().rain_intensity, 0.55);

        sim.set_weather(WeatherKind::HeavyRain);
        assert_eq!(sim.state().wetness, 0.95);
        assert_eq!(sim.state().rain_intensity, 1.0);

        sim.set_weather(WeatherKind::Snow);
        assert_eq!(sim.state().wetness, 0.55);
        assert_eq!(sim.state().snow_intensity, 0.85);

        // Test fog toggle
        sim.set_fog_enabled(false);
        assert_eq!(sim.state().fog_density, 0.0);

        sim.set_fog_enabled(true);
        sim.set_weather(WeatherKind::HeavyRain);
        assert_eq!(sim.state().fog_density, 0.022);
    }

    #[test]
    fn test_step_and_auto_cycle() {
        let mut sim = EnvironmentSim::new(123);
        sim.set_time_hours(10.0);
        sim.set_auto_cycle(false);

        sim.step(2.0);
        assert_eq!(sim.time_hours(), 10.0);
        assert_eq!(sim.state().elapsed_sec, 2.0);

        sim.set_auto_cycle(true);
        sim.step(10.0); // 10.0 * 0.45 = 4.5 hours
        assert!((sim.time_hours() - 14.5).abs() < 0.01);
    }
}
