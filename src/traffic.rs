//! 4-lane street traffic simulation with intersection signal phases, safe car-following headway,
//! smooth braking at crosswalk stop lines, dynamic density scaling, and neon taillight trails.

use std::f32::consts::PI;

use crate::rng::Rng;
use crate::types::{AtmosphereState, CAR_STRIDE, TRAFFIC_LIGHT_STRIDE, TRAIL_STRIDE};

/// Road wrap bound beyond `BLOCK_HALF_LENGTH` (36.0m) so cars enter/exit smoothly off-screen.
pub const ROAD_HALF_SPAN: f32 = 44.0;

/// Total number of simulated vehicle slots across the 4 lanes (4 slots per lane).
pub const TOTAL_CAR_SLOTS: usize = 16;

/// Number of traffic lanes.
pub const LANE_COUNT: usize = 4;

/// Lane Z coordinates:
/// - Lanes 0 & 1 (`z = -4.2, -1.6`): westbound (`-X`, `yaw = PI`)
/// - Lanes 2 & 3 (`z = +1.6, +4.2`): eastbound (`+X`, `yaw = 0.0`)
pub const LANE_Z: [f32; LANE_COUNT] = [-4.2, -1.6, 1.6, 4.2];

/// Stop line X coordinate for eastbound (`+X`) lanes before crosswalk `[-2.6, +2.6]`.
pub const EASTBOUND_STOP_X: f32 = -3.8;

/// Stop line X coordinate for westbound (`-X`) lanes before crosswalk `[-2.6, +2.6]`.
pub const WESTBOUND_STOP_X: f32 = 3.8;

/// Green light duration in seconds.
pub const GREEN_DURATION: f32 = 11.0;
/// Yellow light duration in seconds.
pub const YELLOW_DURATION: f32 = 2.5;
/// Red light duration in seconds.
pub const RED_DURATION: f32 = 7.5;
/// Total traffic signal cycle duration in seconds (`21.0s`).
pub const CYCLE_DURATION: f32 = GREEN_DURATION + YELLOW_DURATION + RED_DURATION;

/// Traffic light phase code matching `TRAFFIC_LIGHT_STRIDE` specification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SignalPhase {
    Green = 0,
    Yellow = 1,
    Red = 2,
}

impl SignalPhase {
    #[inline]
    pub fn as_f32(self) -> f32 {
        match self {
            Self::Green => 0.0,
            Self::Yellow => 1.0,
            Self::Red => 2.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Car {
    pub x: f32,
    pub z: f32,
    pub yaw: f32,
    pub dir: f32,
    pub length: f32,
    pub width: f32,
    pub color_slot: u8,
    pub speed: f32,
    pub cruise_speed: f32,
    pub brake_intensity: f32,
    pub active: bool,
    pub lane_index: u8,
    /// Recent rear-bumper X coordinates `[current, mid, tail]` for taillight ribbon generation.
    pub trail_rear_x: [f32; 3],
}

impl Car {
    #[inline]
    pub fn front_x(&self) -> f32 {
        self.x + self.dir * (self.length * 0.5)
    }

    #[inline]
    pub fn rear_x(&self) -> f32 {
        self.x - self.dir * (self.length * 0.5)
    }
}

/// 4-lane street traffic simulator.
#[derive(Debug, Clone)]
pub struct TrafficSim {
    cars: Vec<Car>,
    light_timer: f32,
}

impl TrafficSim {
    /// Initialize deterministic 4-lane traffic from a seed.
    pub fn new(seed: u32) -> Self {
        let mut rng = Rng::new(seed as u64 ^ 0x736f6d6570736575);
        let mut cars = Vec::with_capacity(TOTAL_CAR_SLOTS);

        let cars_per_lane = TOTAL_CAR_SLOTS / LANE_COUNT;
        let lane_span = ROAD_HALF_SPAN * 2.0; // 88.0m
        let base_spacing = lane_span / cars_per_lane as f32; // 22.0m

        for (lane_idx, &z) in LANE_Z.iter().enumerate() {
            let moving_east = lane_idx >= 2;
            let dir = if moving_east { 1.0 } else { -1.0 };
            let yaw = if moving_east { 0.0 } else { PI };

            for slot in 0..cars_per_lane {
                let offset = (slot as f32 + 0.5) * base_spacing + rng.range_f32(-2.2, 2.2);
                let mut x = -ROAD_HALF_SPAN + offset;
                // Keep initial cars clear of the central crosswalk [-4.5, 4.5]
                if (-4.5..4.5).contains(&x) {
                    x = if x < 0.0 { -6.5 } else { 6.5 };
                }
                x = x.clamp(-ROAD_HALF_SPAN + 2.5, ROAD_HALF_SPAN - 2.5);

                let length = rng.range_f32(3.6, 4.5);
                let width = rng.range_f32(1.75, 1.95);
                let color_slot = ((lane_idx + slot + rng.range_usize(0, 3)) % 3) as u8;
                let cruise_speed = rng.range_f32(8.2, 11.8);
                let rear_x = x - dir * (length * 0.5);
                let trail_step = dir * 1.4;

                cars.push(Car {
                    x,
                    z,
                    yaw,
                    dir,
                    length,
                    width,
                    color_slot,
                    speed: cruise_speed,
                    cruise_speed,
                    brake_intensity: 0.0,
                    active: true,
                    lane_index: lane_idx as u8,
                    trail_rear_x: [rear_x, rear_x - trail_step, rear_x - trail_step * 2.1],
                });
            }
        }

        Self {
            cars,
            light_timer: 0.0,
        }
    }

    /// Current traffic signal phase for vehicles.
    #[inline]
    pub fn signal_phase(&self) -> SignalPhase {
        let t = self.light_timer.rem_euclid(CYCLE_DURATION);
        if t < GREEN_DURATION {
            SignalPhase::Green
        } else if t < GREEN_DURATION + YELLOW_DURATION {
            SignalPhase::Yellow
        } else {
            SignalPhase::Red
        }
    }

    /// Returns `true` when the car traffic light is Red, meaning pedestrians can safely cross.
    #[inline]
    pub fn is_crosswalk_safe(&self) -> bool {
        self.signal_phase() == SignalPhase::Red
    }

    /// Set the internal signal cycle timer (useful for deterministic testing of phases).
    pub fn set_light_timer(&mut self, timer: f32) {
        self.light_timer = timer.rem_euclid(CYCLE_DURATION);
    }

    /// Read-only access to the simulated vehicle slots.
    pub fn cars(&self) -> &[Car] {
        &self.cars
    }

    /// Target number of active cars (`6..=16`) scaled by `atmosphere.traffic_density`.
    #[inline]
    pub fn target_active_cars(traffic_density: f32) -> usize {
        let d = traffic_density.clamp(0.0, 1.0);
        (6.0 + d * 10.0).round() as usize
    }

    /// Advance traffic simulation by `dt` seconds.
    pub fn step(&mut self, dt: f32, atmosphere: &AtmosphereState) {
        if dt <= 0.0 {
            return;
        }

        self.light_timer = (self.light_timer + dt).rem_euclid(CYCLE_DURATION);
        let phase = self.signal_phase();
        let target_active = Self::target_active_cars(atmosphere.traffic_density);

        // Weather speed moderation (slightly calmer cruise in heavy rain or snow)
        let weather_speed_factor =
            (1.0 - atmosphere.rain_intensity * 0.12 - atmosphere.snow_intensity * 0.18)
                .clamp(0.75, 1.0);

        for lane in 0..LANE_COUNT {
            let lane_u8 = lane as u8;
            let dir = if lane >= 2 { 1.0 } else { -1.0 };
            let stop_line_x = if dir > 0.0 {
                EASTBOUND_STOP_X
            } else {
                WESTBOUND_STOP_X
            };

            // Collect indices of cars in this lane
            let lane_indices: Vec<usize> = self.cars
                .iter()
                .enumerate()
                .filter(|(_, car)| car.lane_index == lane_u8)
                .map(|(idx, _)| idx)
                .collect();

            // Snapshot positions and lengths of active cars in this lane for headway calculation
            let mut snapshot: [(usize, f32, f32, bool); 4] = [(0, 0.0, 0.0, false); 4];
            let count = lane_indices.len().min(4);
            for (i, &idx) in lane_indices.iter().take(count).enumerate() {
                let c = &self.cars[idx];
                snapshot[i] = (idx, c.x, c.length, c.active);
            }

            for &idx in lane_indices.iter().take(count) {
                let car = &mut self.cars[idx];
                let desired_cruise = car.cruise_speed * weather_speed_factor;

                if !car.active {
                    // Inactive slot cruises as an invisible ghost so it wraps naturally at road ends
                    car.speed = desired_cruise;
                    car.brake_intensity = 0.0;
                    car.x += car.dir * car.speed * dt;
                    let r_x = car.rear_x();
                    car.trail_rear_x = [r_x, r_x, r_x];
                    continue;
                }

                // 1. Find minimum distance `min_obstacle_gap` ahead of our front bumper
                let front_x = car.front_x();
                let mut min_gap = f32::INFINITY;
                let mut stopping_for_light = false;

                // Check active cars ahead in the same lane (no wrap-around obstacle across road ends)
                for &(other_idx, other_x, other_len, other_active) in &snapshot[..count] {
                    if other_idx == idx || !other_active {
                        continue;
                    }
                    let forward_center_dist = (other_x - car.x) * dir;
                    if forward_center_dist > 0.0 {
                        let other_rear_x = other_x - dir * (other_len * 0.5);
                        let bumper_gap = (other_rear_x - front_x) * dir;
                        if bumper_gap < min_gap {
                            min_gap = bumper_gap;
                        }
                    }
                }

                // Check intersection stop line if signal is Yellow or Red
                if matches!(phase, SignalPhase::Yellow | SignalPhase::Red) {
                    // Signed distance from car center and front bumper to the stop line
                    let dist_front_to_stop = (stop_line_x - front_x) * dir;
                    // If the car has not yet crossed the stop line, treat stop line as an obstacle
                    if dist_front_to_stop >= -0.05 {
                        // Add a small 0.35m buffer before the stop line so cars stop cleanly before +/-3.8
                        let stop_gap = (dist_front_to_stop - 0.35).max(0.0);
                        if stop_gap < min_gap {
                            min_gap = stop_gap;
                            stopping_for_light = true;
                        }
                    }
                }

                // 2. Compute target speed and acceleration from headway gap
                let safe_headway = if stopping_for_light { 0.0 } else { 2.2 };
                let usable_gap = (min_gap - safe_headway).max(0.0);

                let target_speed = if usable_gap <= 0.15 {
                    0.0
                } else if usable_gap < 9.5 {
                    desired_cruise * (usable_gap / 9.5)
                } else {
                    desired_cruise
                };

                let prev_speed = car.speed;
                if car.speed > target_speed {
                    // Smooth but responsive braking
                    let decel = if usable_gap < 3.0 { 16.0 } else { 10.5 };
                    car.speed = (car.speed - decel * dt).max(target_speed);
                    if usable_gap <= 0.2 {
                        car.speed = 0.0;
                    }
                } else {
                    // Smooth acceleration up to target_speed
                    let accel = 6.2;
                    car.speed = (car.speed + accel * dt).min(target_speed);
                }

                // Clamp forward step so we never overshoot the obstacle or stop line
                let max_step = if min_gap.is_finite() {
                    usable_gap.max(0.0)
                } else {
                    f32::INFINITY
                };
                let step_dist = (car.speed * dt).min(max_step);
                if step_dist < car.speed * dt && dt > 0.0 {
                    car.speed = step_dist / dt;
                }

                car.x += dir * step_dist;

                // 3. Update brake light intensity: spikes to 1.0 when decelerating or stopped
                let decel_rate = (prev_speed - car.speed) / dt;
                let is_braking_or_stopped =
                    car.speed < 0.85 || decel_rate > 0.6 || usable_gap < 4.5;
                if is_braking_or_stopped {
                    car.brake_intensity = (car.brake_intensity + dt * 9.0).min(1.0);
                    if car.speed < 0.5 || decel_rate > 2.0 {
                        car.brake_intensity = 1.0;
                    }
                } else {
                    car.brake_intensity = (car.brake_intensity - dt * 4.5).max(0.0);
                }

                // 4. Update taillight trail history smoothly
                let cur_rear = car.rear_x();
                let follow_rate_1 = (dt * 14.0).min(1.0);
                let follow_rate_2 = (dt * 9.0).min(1.0);
                let prev_0 = car.trail_rear_x[0];
                let prev_1 = car.trail_rear_x[1];
                car.trail_rear_x[0] = cur_rear;
                car.trail_rear_x[1] += (prev_0 - car.trail_rear_x[1]) * follow_rate_1;
                car.trail_rear_x[2] += (prev_1 - car.trail_rear_x[2]) * follow_rate_2;
            }
        }

        // 5. Handle off-screen road wrapping at [-ROAD_HALF_SPAN, +ROAD_HALF_SPAN]
        // and only toggle `active` status when wrapping at road ends!
        let mut current_active = self.cars.iter().filter(|c| c.active).count();

        for idx in 0..self.cars.len() {
            let dir = self.cars[idx].dir;
            let wrapped = (dir > 0.0 && self.cars[idx].x > ROAD_HALF_SPAN)
                || (dir < 0.0 && self.cars[idx].x < -ROAD_HALF_SPAN);

            if wrapped {
                let lane_u8 = self.cars[idx].lane_index;
                let mut new_active = self.cars[idx].active;

                if new_active && current_active > target_active {
                    new_active = false;
                    current_active -= 1;
                } else if !new_active && current_active < target_active {
                    new_active = true;
                    current_active += 1;
                }

                // Compute entry X at the beginning of the lane, ensuring safe spacing behind the furthest-back car
                let base_entry_x = -dir * ROAD_HALF_SPAN;
                let mut entry_x = base_entry_x;

                if new_active {
                    for (other_idx, other) in self.cars.iter().enumerate() {
                        if other_idx != idx && other.lane_index == lane_u8 && other.active {
                            // Distance from base_entry_x along lane direction
                            let dist_from_entry = (other.x - base_entry_x) * dir;
                            let min_spacing = (self.cars[idx].length + other.length) * 0.5 + 3.2;
                            if dist_from_entry < min_spacing {
                                let candidate_x = other.x - dir * min_spacing;
                                if (candidate_x - base_entry_x) * dir < (entry_x - base_entry_x) * dir
                                {
                                    entry_x = candidate_x;
                                }
                            }
                        }
                    }
                }

                let car = &mut self.cars[idx];
                car.active = new_active;
                car.x = entry_x.clamp(-ROAD_HALF_SPAN, ROAD_HALF_SPAN);
                car.speed = car.cruise_speed * weather_speed_factor;
                car.brake_intensity = 0.0;
                let rear_x = car.rear_x();
                let trail_offset = dir * 1.2;
                car.trail_rear_x = [
                    rear_x,
                    (rear_x - trail_offset).clamp(-ROAD_HALF_SPAN, ROAD_HALF_SPAN),
                    (rear_x - trail_offset * 2.0).clamp(-ROAD_HALF_SPAN, ROAD_HALF_SPAN),
                ];
            }
        }
    }

    /// Pack all cars into `out` with `CAR_STRIDE = 10`:
    /// `[x, y, z, yaw, length, width, colorSlot, brakeIntensity, active, laneIndex]`.
    pub fn write_cars_buffer(&self, out: &mut Vec<f32>) {
        out.clear();
        out.reserve(self.cars.len() * CAR_STRIDE);

        for car in &self.cars {
            out.extend_from_slice(&[
                car.x.clamp(-ROAD_HALF_SPAN, ROAD_HALF_SPAN),
                0.0,
                car.z,
                car.yaw,
                car.length,
                car.width,
                car.color_slot as f32,
                car.brake_intensity.clamp(0.0, 1.0),
                if car.active { 1.0 } else { 0.0 },
                car.lane_index as f32,
            ]);
        }
    }

    /// Pack active moving car taillight trails into `out` with `TRAIL_STRIDE = 8`:
    /// `[x0, y0, z0, x1, y1, z1, intensity, colorSlot]`.
    pub fn write_trails_buffer(&self, out: &mut Vec<f32>, atmosphere: &AtmosphereState) {
        out.clear();

        // Intensity boosts at night and in wet/rainy weather
        let env_factor =
            (0.55 + 0.50 * (1.0 - atmosphere.daylight) + 0.30 * atmosphere.wetness).clamp(0.35, 1.4);

        for car in &self.cars {
            if !car.active || car.speed <= 1.5 {
                continue;
            }

            let speed_factor = ((car.speed - 1.5) / 9.5).clamp(0.12, 1.0);
            let brake_boost = 1.0 + 0.35 * car.brake_intensity;
            let base_intensity = (speed_factor * env_factor * brake_boost).clamp(0.1, 1.8);

            let rear_x = car.rear_x();
            // Ensure ribbon stretches cleanly behind the rear bumper proportional to speed
            let seg_len = (car.speed * 0.22).clamp(0.45, 2.8);
            let x0 = rear_x.clamp(-ROAD_HALF_SPAN, ROAD_HALF_SPAN);
            let x1 = (rear_x - car.dir * seg_len).clamp(-ROAD_HALF_SPAN, ROAD_HALF_SPAN);
            let x2 = (rear_x - car.dir * (seg_len * 2.1)).clamp(-ROAD_HALF_SPAN, ROAD_HALF_SPAN);

            if (x0 - x1).abs() < 0.05 {
                continue;
            }

            let y = 0.52;
            let color = car.color_slot as f32;
            let half_track = car.width * 0.36;

            for side in [-1.0_f32, 1.0_f32] {
                let z_light = car.z + side * half_track;
                // Primary bright near-tail segment
                out.extend_from_slice(&[x0, y, z_light, x1, y, z_light, base_intensity, color]);
                // Secondary fading wake segment
                if (x1 - x2).abs() >= 0.05 {
                    out.extend_from_slice(&[
                        x1,
                        y,
                        z_light,
                        x2,
                        y,
                        z_light,
                        base_intensity * 0.55,
                        color,
                    ]);
                }
            }
        }

        debug_assert_eq!(out.len() % TRAIL_STRIDE, 0);
    }

    /// Pack the 2 intersection traffic signal gantries into `out` with `TRAFFIC_LIGHT_STRIDE = 4`:
    /// `[x, z, phaseCode (0=green, 1=yellow, 2=red), facingSign]`.
    pub fn write_traffic_lights_buffer(&self, out: &mut Vec<f32>) {
        out.clear();
        out.reserve(2 * TRAFFIC_LIGHT_STRIDE);

        let phase_code = self.signal_phase().as_f32();
        // North-west gantry facing eastbound traffic (+1.0)
        out.extend_from_slice(&[-3.8, -6.3, phase_code, 1.0]);
        // South-east gantry facing westbound traffic (-1.0)
        out.extend_from_slice(&[3.8, 6.3, phase_code, -1.0]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signal_phase_cycle_and_crosswalk_safety() {
        let mut sim = TrafficSim::new(42);
        let atmo = AtmosphereState::default();

        // Initially at t = 0.0 -> Green (0..11.0s)
        assert_eq!(sim.signal_phase(), SignalPhase::Green);
        assert!(!sim.is_crosswalk_safe());

        // Step to t = 11.5s -> Yellow (11.0..13.5s)
        sim.set_light_timer(11.5);
        assert_eq!(sim.signal_phase(), SignalPhase::Yellow);
        assert!(!sim.is_crosswalk_safe());

        // Step to t = 14.0s -> Red (13.5..21.0s)
        sim.set_light_timer(14.0);
        assert_eq!(sim.signal_phase(), SignalPhase::Red);
        assert!(sim.is_crosswalk_safe());

        // Wrap around at 21.0s -> back to Green
        sim.step(7.2, &atmo);
        assert_eq!(sim.signal_phase(), SignalPhase::Green);
        assert!(!sim.is_crosswalk_safe());
    }

    #[test]
    fn test_red_light_stopping_and_brake_intensity() {
        let mut sim = TrafficSim::new(99);
        let atmo = AtmosphereState::default();

        // Jump straight to start of Red phase (13.5s) and keep stepping while holding Red
        sim.set_light_timer(13.6);
        assert_eq!(sim.signal_phase(), SignalPhase::Red);

        // Place an eastbound (+X) car at x = -12.0 and a westbound (-X) car at x = +12.0
        for car in &mut sim.cars {
            if car.lane_index == 2 {
                car.x = -30.0;
            } else if car.lane_index == 0 {
                car.x = 30.0;
            }
        }
        // Put the first car in lane 2 (+X) at x = -11.0 and first car in lane 0 (-X) at x = +11.0
        let east_idx = sim.cars.iter().position(|c| c.lane_index == 2).unwrap();
        let west_idx = sim.cars.iter().position(|c| c.lane_index == 0).unwrap();
        sim.cars[east_idx].x = -11.0;
        sim.cars[east_idx].speed = 9.0;
        sim.cars[west_idx].x = 11.0;
        sim.cars[west_idx].speed = 9.0;

        // Simulate 4.5 seconds during Red phase
        for _ in 0..90 {
            sim.set_light_timer(15.0); // Hold Red phase
            sim.step(0.05, &atmo);

            let east_car = &sim.cars[east_idx];
            let west_car = &sim.cars[west_idx];

            assert!(
                east_car.front_x() <= EASTBOUND_STOP_X + 0.01,
                "Eastbound car crossed stop line during Red: front_x = {}, x = {}",
                east_car.front_x(),
                east_car.x
            );
            assert!(
                west_car.front_x() >= WESTBOUND_STOP_X - 0.01,
                "Westbound car crossed stop line during Red: front_x = {}, x = {}",
                west_car.front_x(),
                west_car.x
            );
        }

        // Both cars should now be stopped before the stop lines with brake_intensity == 1.0
        let east_car = &sim.cars[east_idx];
        let west_car = &sim.cars[west_idx];
        assert!(east_car.speed < 0.05, "Eastbound car should be stopped, speed = {}", east_car.speed);
        assert_eq!(east_car.brake_intensity, 1.0);
        assert!(west_car.speed < 0.05, "Westbound car should be stopped, speed = {}", west_car.speed);
        assert_eq!(west_car.brake_intensity, 1.0);
    }

    #[test]
    fn test_buffers_and_density_scaling() {
        let mut sim = TrafficSim::new(42);
        let mut atmo = AtmosphereState {
            traffic_density: 0.38, // Late-night low traffic density -> target 10 cars
            ..AtmosphereState::default()
        };

        // Step long enough for several cars to wrap at road ends and deactivate
        for _ in 0..240 {
            sim.step(0.1, &atmo);
        }

        let active_low = sim.cars().iter().filter(|c| c.active).count();
        assert_eq!(active_low, TrafficSim::target_active_cars(0.38));

        // Increase to peak density -> cars reactivate smoothly at road ends
        atmo.traffic_density = 0.95;
        for _ in 0..240 {
            sim.step(0.1, &atmo);
        }
        let active_high = sim.cars().iter().filter(|c| c.active).count();
        assert_eq!(active_high, TrafficSim::target_active_cars(0.95));

        let mut cars_buf = Vec::new();
        let mut trails_buf = Vec::new();
        let mut lights_buf = Vec::new();

        sim.write_cars_buffer(&mut cars_buf);
        sim.write_trails_buffer(&mut trails_buf, &atmo);
        sim.write_traffic_lights_buffer(&mut lights_buf);

        assert_eq!(cars_buf.len(), TOTAL_CAR_SLOTS * CAR_STRIDE);
        assert_eq!(trails_buf.len() % TRAIL_STRIDE, 0);
        assert!(!trails_buf.is_empty());
        assert_eq!(lights_buf.len(), 2 * TRAFFIC_LIGHT_STRIDE);
    }
}
