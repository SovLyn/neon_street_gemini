//! Core shared types, constants, and layout specifications for the Neon Street simulation.
//!
//! Every JSON field, enum string, coordinate bound, and buffer stride EXACTLY matches `web/types/sim.ts`.

use serde::{Deserialize, Serialize};

// =============================================================================
// World Layout Constants (in three.js world units / meters)
// =============================================================================

pub const BLOCK_HALF_LENGTH: f32 = 36.0;
pub const STREET_HALF_WIDTH: f32 = 6.0;
pub const NORTH_SIDEWALK_Z_MIN: f32 = -10.0;
pub const NORTH_SIDEWALK_Z_MAX: f32 = -6.0;
pub const SOUTH_SIDEWALK_Z_MIN: f32 = 6.0;
pub const SOUTH_SIDEWALK_Z_MAX: f32 = 9.5;
pub const CANAL_Z_MIN: f32 = 9.5;
pub const CANAL_Z_MAX: f32 = 17.5;
pub const CANAL_WATER_Y: f32 = -0.35;
pub const SIDEWALK_Y: f32 = 0.18;
pub const MAX_RIPPLES: usize = 16;

// =============================================================================
// Buffer Stride Constants (number of float32 elements per entity in linear buffers)
// =============================================================================

/// [x, y, z, yaw, length, width, colorSlot, brakeIntensity, active, laneIndex]
pub const CAR_STRIDE: usize = 10;

/// [x0, y0, z0, x1, y1, z1, intensity, colorSlot]
pub const TRAIL_STRIDE: usize = 8;

/// [x, z, phaseCode, facingSign] (phaseCode: 0=green, 1=yellow, 2=red)
pub const TRAFFIC_LIGHT_STRIDE: usize = 4;

/// [x, y, z, yaw, walkPhase, hasUmbrella, umbrellaColorSlot, speed]
pub const PEDESTRIAN_STRIDE: usize = 8;

/// [x, y, z, vx, vy, kind] (kind: 0=rain, 1=snow)
pub const PARTICLE_STRIDE: usize = 6;

/// [x, z, radius, strength]
pub const RIPPLE_STRIDE: usize = 4;

/// [brightness, glitchAmount, flickerOffset]
pub const SIGN_STATE_STRIDE: usize = 3;

/// [isOn, flicker]
pub const STREETLIGHT_STATE_STRIDE: usize = 2;

// =============================================================================
// Simulation Enums
// =============================================================================

/// Weather conditions in the simulation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WeatherKind {
    Clear,
    Rain,
    HeavyRain,
    Snow,
}

impl WeatherKind {
    /// Losslessly parse from a string, falling back to `Clear` for unknown strings.
    pub fn from_str_lossy(s: &str) -> Self {
        match s {
            "rain" => Self::Rain,
            "heavy_rain" => Self::HeavyRain,
            "snow" => Self::Snow,
            _ => Self::Clear,
        }
    }

    /// String identifier matching TypeScript `WeatherKind`.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Clear => "clear",
            Self::Rain => "rain",
            Self::HeavyRain => "heavy_rain",
            Self::Snow => "snow",
        }
    }
}

/// Building row orientation along the block.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildingSide {
    North,
    South,
}

/// Orientation of a neon sign.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignOrientation {
    Horizontal,
    Vertical,
    Rooftop,
}

/// Cyberpunk roof architectural style.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoofStyle {
    Flat,
    Stepped,
    Antenna,
    Watertower,
}

/// Kind of street or architectural prop.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PropKind {
    Vending,
    AcUnit,
    Bollard,
    TrashBin,
    TrafficPole,
}

/// Active easter egg kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EasterEggKind {
    None,
    Ufo,
    Cat,
    NeonSync,
}

// =============================================================================
// Layout Data Specifications
// =============================================================================

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingSpec {
    pub id: u32,
    pub side: BuildingSide,
    pub x: f32,
    pub z: f32,
    pub width: f32,
    pub depth: f32,
    pub height: f32,
    pub roof_style: RoofStyle,
    pub color_tint: u32,
    pub window_rows: u32,
    pub window_cols: u32,
    pub window_seed: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeonSignSpec {
    pub id: u32,
    pub building_id: u32,
    pub orientation: SignOrientation,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub width: f32,
    pub height: f32,
    pub depth: f32,
    pub facing_y: f32,
    pub color_slot: u8,
    pub label_index: u32,
    pub is_hero: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreetlightSpec {
    pub id: u32,
    pub x: f32,
    pub z: f32,
    pub side: BuildingSide,
    pub height: f32,
    pub arm_dir_z: f32,
    pub initial_on: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PuddleSpec {
    pub id: u32,
    pub x: f32,
    pub z: f32,
    pub radius_x: f32,
    pub radius_z: f32,
    pub rotation: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropSpec {
    pub id: u32,
    pub kind: PropKind,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rotation_y: f32,
    pub scale: f32,
    pub color_slot: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockLayout {
    pub seed: u32,
    pub buildings: Vec<BuildingSpec>,
    pub signs: Vec<NeonSignSpec>,
    pub streetlights: Vec<StreetlightSpec>,
    pub puddles: Vec<PuddleSpec>,
    pub props: Vec<PropSpec>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtmosphereState {
    pub time_hours: f32,
    pub auto_cycle: bool,
    pub weather: WeatherKind,
    pub fog_enabled: bool,
    pub sun_elevation: f32,
    pub daylight: f32,
    pub twilight: f32,
    pub neon_intensity: f32,
    pub window_lit_ratio: f32,
    pub traffic_density: f32,
    pub wetness: f32,
    pub fog_density: f32,
    pub rain_intensity: f32,
    pub snow_intensity: f32,
    pub wind_x: f32,
    pub elapsed_sec: f32,
}

impl Default for AtmosphereState {
    fn default() -> Self {
        Self {
            time_hours: 21.0,
            auto_cycle: false,
            weather: WeatherKind::Clear,
            fog_enabled: true,
            sun_elevation: -std::f32::consts::FRAC_1_SQRT_2,
            daylight: 0.0,
            twilight: 0.0,
            neon_intensity: 1.45,
            window_lit_ratio: 0.82,
            traffic_density: 0.95,
            wetness: 0.28,
            fog_density: 0.012,
            rain_intensity: 0.0,
            snow_intensity: 0.0,
            wind_x: 0.0,
            elapsed_sec: 0.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EasterEggState {
    pub active_kind: EasterEggKind,
    pub progress: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub yaw: f32,
    pub intensity: f32,
    pub triggered_count: u32,
}

impl Default for EasterEggState {
    fn default() -> Self {
        Self {
            active_kind: EasterEggKind::None,
            progress: 0.0,
            x: 0.0,
            y: 0.0,
            z: 0.0,
            yaw: 0.0,
            intensity: 0.0,
            triggered_count: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_weather_kind_serde_and_lossy() {
        assert_eq!(WeatherKind::from_str_lossy("clear"), WeatherKind::Clear);
        assert_eq!(WeatherKind::from_str_lossy("rain"), WeatherKind::Rain);
        assert_eq!(
            WeatherKind::from_str_lossy("heavy_rain"),
            WeatherKind::HeavyRain
        );
        assert_eq!(WeatherKind::from_str_lossy("snow"), WeatherKind::Snow);
        assert_eq!(WeatherKind::from_str_lossy("unknown"), WeatherKind::Clear);

        assert_eq!(
            serde_json::to_string(&WeatherKind::HeavyRain).unwrap(),
            "\"heavy_rain\""
        );
        assert_eq!(
            serde_json::to_string(&BuildingSide::North).unwrap(),
            "\"north\""
        );
        assert_eq!(
            serde_json::to_string(&SignOrientation::Vertical).unwrap(),
            "\"vertical\""
        );
        assert_eq!(
            serde_json::to_string(&RoofStyle::Watertower).unwrap(),
            "\"watertower\""
        );
        assert_eq!(
            serde_json::to_string(&PropKind::TrafficPole).unwrap(),
            "\"traffic_pole\""
        );
        assert_eq!(
            serde_json::to_string(&EasterEggKind::NeonSync).unwrap(),
            "\"neon_sync\""
        );
    }

    #[test]
    fn test_atmosphere_state_json_field_names() {
        let state = AtmosphereState::default();
        let json = serde_json::to_string(&state).unwrap();

        // Verify camelCase field names matching sim.ts
        assert!(json.contains("\"timeHours\":"));
        assert!(json.contains("\"autoCycle\":"));
        assert!(json.contains("\"weather\":\"clear\""));
        assert!(json.contains("\"fogEnabled\":"));
        assert!(json.contains("\"sunElevation\":"));
        assert!(json.contains("\"daylight\":"));
        assert!(json.contains("\"twilight\":"));
        assert!(json.contains("\"neonIntensity\":"));
        assert!(json.contains("\"windowLitRatio\":"));
        assert!(json.contains("\"trafficDensity\":"));
        assert!(json.contains("\"wetness\":"));
        assert!(json.contains("\"fogDensity\":"));
        assert!(json.contains("\"rainIntensity\":"));
        assert!(json.contains("\"snowIntensity\":"));
        assert!(json.contains("\"windX\":"));
        assert!(json.contains("\"elapsedSec\":"));
    }

    #[test]
    fn test_building_spec_json_field_names() {
        let b = BuildingSpec {
            id: 0,
            side: BuildingSide::North,
            x: 1.0,
            z: -15.0,
            width: 8.0,
            depth: 10.0,
            height: 20.0,
            roof_style: RoofStyle::Antenna,
            color_tint: 2,
            window_rows: 10,
            window_cols: 6,
            window_seed: 42,
        };
        let json = serde_json::to_string(&b).unwrap();
        assert!(json.contains("\"roofStyle\":\"antenna\""));
        assert!(json.contains("\"colorTint\":2"));
        assert!(json.contains("\"windowRows\":10"));
        assert!(json.contains("\"windowCols\":6"));
        assert!(json.contains("\"windowSeed\":42"));
    }

    #[test]
    fn test_neon_sign_spec_json_field_names() {
        let s = NeonSignSpec {
            id: 1,
            building_id: 0,
            orientation: SignOrientation::Horizontal,
            x: 0.0,
            y: 4.0,
            z: -9.75,
            width: 5.0,
            height: 1.5,
            depth: 0.25,
            facing_y: 0.0,
            color_slot: 1,
            label_index: 3,
            is_hero: true,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"buildingId\":0"));
        assert!(json.contains("\"facingY\":0.0"));
        assert!(json.contains("\"colorSlot\":1"));
        assert!(json.contains("\"labelIndex\":3"));
        assert!(json.contains("\"isHero\":true"));
    }

    #[test]
    fn test_easter_egg_state_json_field_names() {
        let e = EasterEggState::default();
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("\"activeKind\":\"none\""));
        assert!(json.contains("\"triggeredCount\":0"));
    }

    #[test]
    fn test_block_layout_json_roundtrip() {
        let layout = BlockLayout {
            seed: 42,
            buildings: vec![],
            signs: vec![],
            streetlights: vec![],
            puddles: vec![],
            props: vec![],
        };
        let json = serde_json::to_string(&layout).unwrap();
        assert!(json.contains("\"seed\":42"));
        assert!(json.contains("\"buildings\":[]"));
        assert!(json.contains("\"signs\":[]"));
        assert!(json.contains("\"streetlights\":[]"));
        assert!(json.contains("\"puddles\":[]"));
        assert!(json.contains("\"props\":[]"));

        let deser: BlockLayout = serde_json::from_str(&json).unwrap();
        assert_eq!(layout, deser);
    }
}
