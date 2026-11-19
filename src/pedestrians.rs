//! Pedestrian simulation along north and south sidewalks with crosswalk interactions,
//! storefront pauses, umbrella state management, and smooth heading orientation.

use std::f32::consts::{PI, TAU};

use crate::rng::Rng;
use crate::types::{
    AtmosphereState, BuildingSide, WeatherKind, NORTH_SIDEWALK_Z_MAX, NORTH_SIDEWALK_Z_MIN,
    PEDESTRIAN_STRIDE, SIDEWALK_Y, SOUTH_SIDEWALK_Z_MAX, SOUTH_SIDEWALK_Z_MIN,
};

/// Total count of simulated pedestrians.
pub const NUM_PEDESTRIANS: usize = 24;

/// Bound for sidewalk walking along the block length.
pub const PEDESTRIAN_X_MIN: f32 = -35.5;
pub const PEDESTRIAN_X_MAX: f32 = 35.5;

/// Crosswalk bounds along the street.
pub const CROSSWALK_X_MIN: f32 = -2.0;
pub const CROSSWALK_X_MAX: f32 = 2.0;

/// North and south curb Z positions bordering the street.
pub const NORTH_CURB_Z: f32 = -6.7;
pub const SOUTH_CURB_Z: f32 = 6.8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CrossingState {
    None,
    WaitingAtCurb,
    CrossingStreet,
}

#[derive(Debug, Clone)]
pub struct Pedestrian {
    x: f32,
    y: f32,
    z: f32,
    yaw: f32,
    target_yaw: f32,
    walk_phase: f32,
    speed: f32,
    base_speed: f32,
    dir_x: f32,
    side: BuildingSide,
    sidewalk_target_z: f32,
    can_cross: bool,
    crossing_state: CrossingState,
    cross_cooldown: f32,
    pause_timer: f32,
    pause_cooldown: f32,
    umbrella_propensity: f32,
    umbrella_color_slot: u8,
}

impl Pedestrian {
    fn new(i: usize, rng: &mut Rng) -> Self {
        // Distribute 12 pedestrians on North sidewalk, 12 on South sidewalk
        let side = if i < NUM_PEDESTRIANS / 2 {
            BuildingSide::North
        } else {
            BuildingSide::South
        };

        let z = match side {
            BuildingSide::North => rng.range_f32(NORTH_SIDEWALK_Z_MIN + 0.3, NORTH_SIDEWALK_Z_MAX - 0.2),
            BuildingSide::South => rng.range_f32(SOUTH_SIDEWALK_Z_MIN + 0.3, SOUTH_SIDEWALK_Z_MAX - 0.2),
        };

        // Distribute across the sidewalk length
        let step_size = (PEDESTRIAN_X_MAX - PEDESTRIAN_X_MIN) / (NUM_PEDESTRIANS as f32);
        let x = (PEDESTRIAN_X_MIN + (i as f32 + rng.range_f32(0.1, 0.9)) * step_size)
            .clamp(PEDESTRIAN_X_MIN, PEDESTRIAN_X_MAX);

        let dir_x = if (i + rng.next_u32() as usize).is_multiple_of(2) {
            1.0
        } else {
            -1.0
        };

        let target_yaw = if dir_x > 0.0 { PI * 0.5 } else { -PI * 0.5 };
        let base_speed = rng.range_f32(1.15, 1.65);
        let umbrella_propensity = rng.next_f32();
        let umbrella_color_slot = (i % 3) as u8;

        // Roughly 1 in 4 pedestrians is eligible to cross the street
        let can_cross = i % 4 == 1 || i % 4 == 3;

        Self {
            x,
            y: SIDEWALK_Y,
            z,
            yaw: target_yaw,
            target_yaw,
            walk_phase: rng.range_f32(0.0, TAU),
            speed: base_speed,
            base_speed,
            dir_x,
            side,
            sidewalk_target_z: z,
            can_cross,
            crossing_state: CrossingState::None,
            cross_cooldown: rng.range_f32(5.0, 18.0),
            pause_timer: 0.0,
            pause_cooldown: rng.range_f32(6.0, 22.0),
            umbrella_propensity,
            umbrella_color_slot,
        }
    }
}

/// Simulation of 24 pedestrians moving along the neon street sidewalks and crosswalk.
#[derive(Debug, Clone)]
pub struct PedestrianSim {
    pedestrians: Vec<Pedestrian>,
    rng: Rng,
}

impl PedestrianSim {
    /// Initialize 24 pedestrians deterministically from seed.
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng::new(seed.wrapping_add(0x9E37_79B9) as u64);
        let mut pedestrians = Vec::with_capacity(NUM_PEDESTRIANS);

        for i in 0..NUM_PEDESTRIANS {
            pedestrians.push(Pedestrian::new(i, &mut rng));
        }

        Self { pedestrians, rng }
    }

    /// Read-only slice of simulated pedestrians.
    pub fn pedestrians(&self) -> &[Pedestrian] {
        &self.pedestrians
    }

    /// Advance the pedestrian simulation.
    pub fn step(&mut self, dt: f32, _atmosphere: &AtmosphereState, crosswalk_safe: bool) {
        if dt <= 0.0 {
            return;
        }

        for ped in &mut self.pedestrians {
            // 1. Storefront pause timer management
            if ped.pause_timer > 0.0 {
                ped.pause_timer = (ped.pause_timer - dt).max(0.0);
                ped.speed = 0.0;
                // Idle walk phase stops while paused
                continue;
            }

            if ped.pause_cooldown > 0.0 {
                ped.pause_cooldown = (ped.pause_cooldown - dt).max(0.0);
            }

            if ped.cross_cooldown > 0.0 {
                ped.cross_cooldown = (ped.cross_cooldown - dt).max(0.0);
            }

            // 2. Crosswalk interaction and state handling
            match ped.crossing_state {
                CrossingState::None => {
                    // Check if eligible to initiate crossing
                    let near_crosswalk = ped.x >= CROSSWALK_X_MIN && ped.x <= CROSSWALK_X_MAX;
                    if ped.can_cross && ped.cross_cooldown <= 0.0 && near_crosswalk {
                        // Move toward the curb
                        let curb_z = match ped.side {
                            BuildingSide::North => NORTH_CURB_Z,
                            BuildingSide::South => SOUTH_CURB_Z,
                        };

                        if (ped.z - curb_z).abs() > 0.3 {
                            // Approach curb
                            let dz = curb_z - ped.z;
                            ped.target_yaw = if dz > 0.0 { 0.0 } else { PI };
                            let move_z = dz.signum() * (ped.base_speed * dt).min(dz.abs());
                            ped.z += move_z;
                            ped.speed = ped.base_speed;
                        } else {
                            // At curb: check crosswalk safety
                            if crosswalk_safe {
                                ped.crossing_state = CrossingState::CrossingStreet;
                                ped.target_yaw = match ped.side {
                                    BuildingSide::North => 0.0,
                                    BuildingSide::South => PI,
                                };
                                ped.speed = ped.base_speed * 1.1; // Slightly brisk walk across street
                            } else {
                                ped.crossing_state = CrossingState::WaitingAtCurb;
                                ped.target_yaw = match ped.side {
                                    BuildingSide::North => 0.0,
                                    BuildingSide::South => PI,
                                };
                                ped.speed = 0.0;
                            }
                        }
                    } else {
                        // Normal sidewalk traversal
                        // Handle storefront pause trigger when away from ends
                        if ped.pause_cooldown <= 0.0
                            && ped.x.abs() > 5.0
                            && ped.x.abs() < 30.0
                            && !near_crosswalk
                            && self.rng.next_f32() < dt * 0.12
                        {
                            ped.pause_timer = self.rng.range_f32(1.6, 3.8);
                            ped.pause_cooldown = self.rng.range_f32(14.0, 28.0);
                            ped.speed = 0.0;
                            continue;
                        }

                        // Sidewalk end turnaround
                        if ped.x >= PEDESTRIAN_X_MAX && ped.dir_x > 0.0 {
                            ped.dir_x = -1.0;
                        } else if ped.x <= PEDESTRIAN_X_MIN && ped.dir_x < 0.0 {
                            ped.dir_x = 1.0;
                        }

                        ped.target_yaw = if ped.dir_x > 0.0 { PI * 0.5 } else { -PI * 0.5 };
                        ped.speed = ped.base_speed;
                        ped.x += ped.dir_x * ped.speed * dt;

                        // Gently maintain sidewalk lane z
                        let dz = ped.sidewalk_target_z - ped.z;
                        ped.z += dz * (dt * 1.5).min(1.0);
                    }
                }

                CrossingState::WaitingAtCurb => {
                    // Still waiting until signal turns Red for cars (crosswalk safe)
                    ped.speed = 0.0;
                    ped.target_yaw = match ped.side {
                        BuildingSide::North => 0.0,
                        BuildingSide::South => PI,
                    };

                    if crosswalk_safe {
                        ped.crossing_state = CrossingState::CrossingStreet;
                        ped.speed = ped.base_speed * 1.1;
                    }
                }

                CrossingState::CrossingStreet => {
                    ped.speed = ped.base_speed * 1.1;
                    let target_curb_z = match ped.side {
                        BuildingSide::North => SOUTH_CURB_Z,
                        BuildingSide::South => NORTH_CURB_Z,
                    };

                    let dz = target_curb_z - ped.z;
                    if dz.abs() <= (ped.speed * dt).max(0.15) {
                        // Successfully reached opposite sidewalk!
                        ped.z = target_curb_z;
                        ped.side = match ped.side {
                            BuildingSide::North => BuildingSide::South,
                            BuildingSide::South => BuildingSide::North,
                        };
                        ped.sidewalk_target_z = match ped.side {
                            BuildingSide::North => self.rng.range_f32(NORTH_SIDEWALK_Z_MIN + 0.4, NORTH_SIDEWALK_Z_MAX - 0.3),
                            BuildingSide::South => self.rng.range_f32(SOUTH_SIDEWALK_Z_MIN + 0.4, SOUTH_SIDEWALK_Z_MAX - 0.3),
                        };
                        ped.crossing_state = CrossingState::None;
                        ped.cross_cooldown = self.rng.range_f32(16.0, 36.0);
                        ped.target_yaw = if ped.dir_x > 0.0 { PI * 0.5 } else { -PI * 0.5 };
                    } else {
                        ped.z += dz.signum() * ped.speed * dt;
                        ped.target_yaw = if dz > 0.0 { 0.0 } else { PI };
                    }
                }
            }

            // 3. Smooth angular interpolation towards target heading
            let angle_diff = angle_difference(ped.target_yaw, ped.yaw);
            let yaw_turn_rate = 8.5;
            ped.yaw += angle_diff * (dt * yaw_turn_rate).min(1.0);

            // 4. Update walk animation phase
            if ped.speed > 0.05 {
                ped.walk_phase = (ped.walk_phase + dt * ped.speed * 3.8).rem_euclid(TAU);
            }
        }
    }

    /// Write all 24 pedestrians into linear float32 buffer with `PEDESTRIAN_STRIDE = 8`.
    ///
    /// Stride: `[x, y, z, yaw, walkPhase, hasUmbrella, umbrellaColorSlot, speed]`
    pub fn write_buffer(&self, out: &mut Vec<f32>, atmosphere: &AtmosphereState) {
        out.clear();
        out.reserve(NUM_PEDESTRIANS * PEDESTRIAN_STRIDE);

        for ped in &self.pedestrians {
            let has_umbrella = match atmosphere.weather {
                WeatherKind::Rain | WeatherKind::HeavyRain => 1.0,
                WeatherKind::Snow => {
                    if ped.umbrella_propensity < 0.85 {
                        1.0
                    } else {
                        0.0
                    }
                }
                WeatherKind::Clear => {
                    if ped.umbrella_propensity < 0.15 {
                        1.0
                    } else {
                        0.0
                    }
                }
            };

            out.push(ped.x);
            out.push(ped.y);
            out.push(ped.z);
            out.push(ped.yaw);
            out.push(ped.walk_phase);
            out.push(has_umbrella);
            out.push(ped.umbrella_color_slot as f32);
            out.push(ped.speed);
        }
    }
}

/// Compute shortest signed angular difference from `current` to `target` in `[-PI, PI]`.
#[inline]
fn angle_difference(target: f32, current: f32) -> f32 {
    let mut diff = (target - current).rem_euclid(TAU);
    if diff > PI {
        diff -= TAU;
    }
    diff
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pedestrian_count_and_stride() {
        let sim = PedestrianSim::new(42);
        assert_eq!(sim.pedestrians().len(), NUM_PEDESTRIANS);

        let atmo = AtmosphereState::default();
        let mut buf = Vec::new();
        sim.write_buffer(&mut buf, &atmo);
        assert_eq!(buf.len(), NUM_PEDESTRIANS * PEDESTRIAN_STRIDE);
    }

    #[test]
    fn test_umbrella_weather_rules() {
        let sim = PedestrianSim::new(1234);

        // Rain: 100% umbrellas
        let rain_atmo = AtmosphereState {
            weather: WeatherKind::Rain,
            ..AtmosphereState::default()
        };
        let mut buf = Vec::new();
        sim.write_buffer(&mut buf, &rain_atmo);
        for i in 0..NUM_PEDESTRIANS {
            let has_umbrella = buf[i * PEDESTRIAN_STRIDE + 5];
            assert_eq!(has_umbrella, 1.0, "Pedestrian {} should have umbrella in Rain", i);
        }

        // HeavyRain: 100% umbrellas
        let heavy_atmo = AtmosphereState {
            weather: WeatherKind::HeavyRain,
            ..AtmosphereState::default()
        };
        sim.write_buffer(&mut buf, &heavy_atmo);
        for i in 0..NUM_PEDESTRIANS {
            let has_umbrella = buf[i * PEDESTRIAN_STRIDE + 5];
            assert_eq!(has_umbrella, 1.0, "Pedestrian {} should have umbrella in HeavyRain", i);
        }

        // Snow: ~85% umbrellas
        let snow_atmo = AtmosphereState {
            weather: WeatherKind::Snow,
            ..AtmosphereState::default()
        };
        sim.write_buffer(&mut buf, &snow_atmo);
        let snow_count = (0..NUM_PEDESTRIANS)
            .filter(|&i| buf[i * PEDESTRIAN_STRIDE + 5] > 0.5)
            .count();
        assert!((16..=24).contains(&snow_count), "Snow umbrella count: {}", snow_count);

        // Clear: ~15% umbrellas
        let clear_atmo = AtmosphereState {
            weather: WeatherKind::Clear,
            ..AtmosphereState::default()
        };
        sim.write_buffer(&mut buf, &clear_atmo);
        let clear_count = (0..NUM_PEDESTRIANS)
            .filter(|&i| buf[i * PEDESTRIAN_STRIDE + 5] > 0.5)
            .count();
        assert!(clear_count <= 8, "Clear umbrella count: {}", clear_count);
    }

    #[test]
    fn test_pedestrian_bounds_and_step() {
        let mut sim = PedestrianSim::new(77);
        let atmo = AtmosphereState::default();

        for _ in 0..120 {
            sim.step(0.05, &atmo, true);
        }

        for p in sim.pedestrians() {
            assert!(
                p.x >= PEDESTRIAN_X_MIN - 1.0 && p.x <= PEDESTRIAN_X_MAX + 1.0,
                "Pedestrian x out of bounds: {}",
                p.x
            );
            assert!(
                p.z >= NORTH_SIDEWALK_Z_MIN - 1.0 && p.z <= SOUTH_SIDEWALK_Z_MAX + 1.0,
                "Pedestrian z out of bounds: {}",
                p.z
            );
        }
    }
}
