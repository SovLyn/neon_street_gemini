//! Procedural layout generator for the Neon Street block.
//!
//! Generates a visually rich, atmospheric, cyberpunk city block with
//! north storefronts, south canal promenade buildings, glowing neon signs,
//! streetlights, puddles, and street props.
//!
//! 100% deterministic for any given seed.

use std::f32::consts::{FRAC_PI_2, PI};

use crate::rng::Rng;
use crate::types::{
    BlockLayout, BuildingSide, BuildingSpec, NeonSignSpec, PropKind, PropSpec, PuddleSpec,
    RoofStyle, SignOrientation, StreetlightSpec, SIDEWALK_Y,
};

/// Procedurally generate a complete, deterministic block layout from a seed.
pub fn generate_block(seed: u32) -> BlockLayout {
    let mut rng = Rng::new(seed as u64 ^ 0x517cc1b727220a95);

    let mut buildings = Vec::new();
    let mut signs = Vec::new();
    let mut streetlights = Vec::new();
    let mut puddles = Vec::new();
    let mut props = Vec::new();

    let mut next_building_id = 0u32;
    let mut next_sign_id = 0u32;
    let mut next_prop_id = 0u32;

    // =========================================================================
    // 1. North Building Row (side: North)
    // =========================================================================
    // Pack 7–10 buildings cleanly along x from -35.0 to +35.0 with alley gaps (0.5..1.4m).
    // Front facade sits at z = -10.0 (center z = -10.0 - depth / 2.0).
    let north_count = rng.range_usize(8, 11); // 8 to 10 buildings
    let mut raw_north_widths = Vec::with_capacity(north_count);
    let mut raw_north_gaps = Vec::with_capacity(north_count.saturating_sub(1));

    for _ in 0..north_count {
        raw_north_widths.push(rng.range_f32(6.2, 9.8));
    }
    for _ in 0..north_count.saturating_sub(1) {
        raw_north_gaps.push(rng.range_f32(0.7, 1.25));
    }

    let raw_north_total: f32 =
        raw_north_widths.iter().sum::<f32>() + raw_north_gaps.iter().sum::<f32>();
    let target_north_span = 68.8; // spans from -34.4 to +34.4
    let north_scale = target_north_span / raw_north_total;

    let mut cur_north_x = -34.4;
    let mut north_buildings_meta = Vec::with_capacity(north_count);

    for i in 0..north_count {
        let width = raw_north_widths[i] * north_scale;
        let x = cur_north_x + width * 0.5;
        if i < raw_north_gaps.len() {
            cur_north_x += width + raw_north_gaps[i] * north_scale;
        } else {
            cur_north_x += width;
        }

        let depth = rng.range_f32(8.5, 13.0);
        let z = -10.0 - depth * 0.5;

        // Height: dramatic cyberpunk skyline with tallest towers slightly off-center (x ~ +2.0)
        let focal_dist = ((x - 2.0) / 32.0).abs();
        let composition_boost = (1.0 - focal_dist).clamp(0.0, 1.0) * 11.5;
        let height = rng.range_f32(11.0, 15.5) + composition_boost;

        let roof_style = match rng.range_usize(0, 4) {
            0 => RoofStyle::Flat,
            1 => RoofStyle::Stepped,
            2 => RoofStyle::Antenna,
            _ => RoofStyle::Watertower,
        };

        let color_tint = rng.range_usize(0, 6) as u32;
        let window_rows = ((height - 1.5) / 1.75).round().max(4.0) as u32;
        let window_cols = ((width - 0.8) / 1.35).round().max(3.0) as u32;
        let window_seed = rng.next_u32();

        let b_id = next_building_id;
        next_building_id += 1;

        let spec = BuildingSpec {
            id: b_id,
            side: BuildingSide::North,
            x,
            z,
            width,
            depth,
            height,
            roof_style,
            color_tint,
            window_rows,
            window_cols,
            window_seed,
        };

        buildings.push(spec.clone());
        north_buildings_meta.push(spec);
    }

    // =========================================================================
    // 2. South Canal-Front Row (side: South)
    // =========================================================================
    // Pack 6–9 lower-to-mid-rise buildings along far side of canal (x from -34.0 to +34.0).
    // Front facade facing canal at z = 18.4 (center z = 18.4 + depth / 2.0).
    let south_count = rng.range_usize(7, 10); // 7 to 9 buildings
    let mut raw_south_widths = Vec::with_capacity(south_count);
    let mut raw_south_gaps = Vec::with_capacity(south_count.saturating_sub(1));

    for _ in 0..south_count {
        raw_south_widths.push(rng.range_f32(6.5, 9.8));
    }
    for _ in 0..south_count.saturating_sub(1) {
        raw_south_gaps.push(rng.range_f32(0.65, 1.2));
    }

    let raw_south_total: f32 =
        raw_south_widths.iter().sum::<f32>() + raw_south_gaps.iter().sum::<f32>();
    let target_south_span = 67.5; // spans from -33.75 to +33.75
    let south_scale = target_south_span / raw_south_total;

    let mut cur_south_x = -33.75;
    let mut south_buildings_meta = Vec::with_capacity(south_count);

    for i in 0..south_count {
        let width = raw_south_widths[i] * south_scale;
        let x = cur_south_x + width * 0.5;
        if i < raw_south_gaps.len() {
            cur_south_x += width + raw_south_gaps[i] * south_scale;
        } else {
            cur_south_x += width;
        }

        let depth = rng.range_f32(7.2, 10.5);
        let z = 18.4 + depth * 0.5;

        // Keep south buildings near x = [-24.0, -12.0] shorter for unobstructed framing from southwest camera
        let in_view_corridor = (-24.0..=-12.0).contains(&x);
        let height = if in_view_corridor {
            rng.range_f32(7.5, 10.0)
        } else {
            rng.range_f32(8.5, 14.0)
        };

        let roof_style = match rng.range_usize(0, 4) {
            0 => RoofStyle::Flat,
            1 => RoofStyle::Stepped,
            2 => RoofStyle::Antenna,
            _ => RoofStyle::Watertower,
        };

        let color_tint = rng.range_usize(0, 6) as u32;
        let window_rows = ((height - 1.2) / 1.75).round().max(3.0) as u32;
        let window_cols = ((width - 0.8) / 1.35).round().max(3.0) as u32;
        let window_seed = rng.next_u32();

        let b_id = next_building_id;
        next_building_id += 1;

        let spec = BuildingSpec {
            id: b_id,
            side: BuildingSide::South,
            x,
            z,
            width,
            depth,
            height,
            roof_style,
            color_tint,
            window_rows,
            window_cols,
            window_seed,
        };

        buildings.push(spec.clone());
        south_buildings_meta.push(spec);
    }

    // =========================================================================
    // 3. Neon Signs (signs)
    // =========================================================================
    // Generate ~22–34 signs with guaranteed diversity of all three orientations:
    // Horizontal, Vertical, Rooftop.
    let mut sign_color_counter = 0usize;

    // 3a. North Storefront & Mid-facade Horizontal Signs (facing +Z toward street)
    for b in &north_buildings_meta {
        let sign_w = rng.range_f32(3.5, 6.2).min(b.width - 0.8);
        let sign_h = rng.range_f32(1.1, 2.2);
        let x_offset = rng.range_f32(-0.8, 0.8);
        let y = rng.range_f32(3.2, 5.8);
        let color_slot = (sign_color_counter % 3) as u8;
        sign_color_counter += 1;

        signs.push(NeonSignSpec {
            id: next_sign_id,
            building_id: b.id,
            orientation: SignOrientation::Horizontal,
            x: b.x + x_offset,
            y,
            z: -9.75,
            width: sign_w,
            height: sign_h,
            depth: 0.22,
            facing_y: 0.0,
            color_slot,
            label_index: rng.range_usize(0, 16) as u32,
            is_hero: false,
        });
        next_sign_id += 1;
    }

    // 3b. North Vertical Blade Signs (projecting over north sidewalk, visible down street)
    for (idx, b) in north_buildings_meta.iter().enumerate() {
        if idx % 2 == 1 || rng.chance(0.65) {
            let sign_w = rng.range_f32(1.05, 1.45);
            let sign_h = rng.range_f32(4.0, 6.8);
            let y = rng.range_f32(5.0, 8.5).min(b.height - sign_h * 0.5 - 0.5);
            let facing_y = if rng.chance(0.5) {
                FRAC_PI_2
            } else {
                -FRAC_PI_2
            };
            let color_slot = (sign_color_counter % 3) as u8;
            sign_color_counter += 1;

            signs.push(NeonSignSpec {
                id: next_sign_id,
                building_id: b.id,
                orientation: SignOrientation::Vertical,
                x: b.x + if facing_y > 0.0 { -b.width * 0.28 } else { b.width * 0.28 },
                y,
                z: -8.9,
                width: sign_w,
                height: sign_h,
                depth: 0.28,
                facing_y,
                color_slot,
                label_index: rng.range_usize(0, 16) as u32,
                is_hero: false,
            });
            next_sign_id += 1;
        }
    }

    // 3c. North Rooftop Billboard Signs (crowning selected north buildings)
    for b in &north_buildings_meta {
        // Select prominent or tall buildings for rooftop billboards (at least 3-4 billboards)
        if b.height >= 14.5 || (b.x.abs() < 12.0 && rng.chance(0.75)) {
            let sign_w = rng.range_f32(4.8, 7.8).min(b.width - 0.6);
            let sign_h = rng.range_f32(2.2, 3.5);
            let y = b.height + sign_h * 0.5 + 0.5;
            let color_slot = (sign_color_counter % 3) as u8;
            sign_color_counter += 1;

            signs.push(NeonSignSpec {
                id: next_sign_id,
                building_id: b.id,
                orientation: SignOrientation::Rooftop,
                x: b.x,
                y,
                z: -10.5,
                width: sign_w,
                height: sign_h,
                depth: 0.35,
                facing_y: 0.0,
                color_slot,
                label_index: rng.range_usize(0, 16) as u32,
                is_hero: false,
            });
            next_sign_id += 1;
        }
    }

    // 3d. South Canal-Facing Horizontal Signs (reflecting into canal, facing -Z toward canal)
    for (idx, b) in south_buildings_meta.iter().enumerate() {
        if idx % 2 == 0 || rng.chance(0.7) {
            let sign_w = rng.range_f32(3.0, 5.5).min(b.width - 0.8);
            let sign_h = rng.range_f32(1.0, 2.0);
            let y = rng.range_f32(2.8, 5.5);
            let color_slot = (sign_color_counter % 3) as u8;
            sign_color_counter += 1;

            signs.push(NeonSignSpec {
                id: next_sign_id,
                building_id: b.id,
                orientation: SignOrientation::Horizontal,
                x: b.x,
                y,
                z: 18.15,
                width: sign_w,
                height: sign_h,
                depth: 0.22,
                facing_y: PI,
                color_slot,
                label_index: rng.range_usize(0, 16) as u32,
                is_hero: false,
            });
            next_sign_id += 1;
        }
    }

    // 3e. South Vertical Blade Signs
    for (idx, b) in south_buildings_meta.iter().enumerate() {
        if idx % 3 == 1 {
            let sign_w = rng.range_f32(0.9, 1.3);
            let sign_h = rng.range_f32(3.2, 5.2);
            let y = rng.range_f32(4.0, 6.5).min(b.height - sign_h * 0.5 - 0.5);
            let facing_y = if rng.chance(0.5) {
                FRAC_PI_2
            } else {
                -FRAC_PI_2
            };
            let color_slot = (sign_color_counter % 3) as u8;
            sign_color_counter += 1;

            signs.push(NeonSignSpec {
                id: next_sign_id,
                building_id: b.id,
                orientation: SignOrientation::Vertical,
                x: b.x + if facing_y > 0.0 { -b.width * 0.25 } else { b.width * 0.25 },
                y,
                z: 17.4,
                width: sign_w,
                height: sign_h,
                depth: 0.25,
                facing_y,
                color_slot,
                label_index: rng.range_usize(0, 16) as u32,
                is_hero: false,
            });
            next_sign_id += 1;
        }
    }

    // 3f. Mark EXACTLY ONE prominent North building sign near center (x closest to 0) as hero sign
    let hero_candidates: Vec<usize> = signs
        .iter()
        .enumerate()
        .filter(|(_, s)| {
            (s.orientation == SignOrientation::Rooftop
                || s.orientation == SignOrientation::Horizontal)
                && s.z < 0.0
                && s.width >= 4.8
        })
        .map(|(i, _)| i)
        .collect();

    let hero_idx = if !hero_candidates.is_empty() {
        hero_candidates
            .into_iter()
            .min_by(|&a, &b| {
                signs[a]
                    .x
                    .abs()
                    .partial_cmp(&signs[b].x.abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap()
    } else {
        // Fallback: pick any North sign closest to x = 0
        signs
            .iter()
            .enumerate()
            .filter(|(_, s)| s.z < 0.0)
            .min_by(|(_, a), (_, b)| {
                a.x.abs()
                    .partial_cmp(&b.x.abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(i, _)| i)
            .unwrap_or(0)
    };

    if !signs.is_empty() {
        signs[hero_idx].is_hero = true;
    }

    // =========================================================================
    // 4. Streetlights (streetlights)
    // =========================================================================
    // 6 along north sidewalk (z = -6.4, armDirZ = 1.0)
    // 6 along south promenade (z = 6.4, armDirZ = -1.0)
    // Spaced evenly along x, avoiding crosswalk [-3.5, 3.5]
    let light_x_positions = [-28.0, -17.0, -7.0, 7.0, 17.0, 28.0];
    let mut next_light_id = 0u32;

    for &lx in &light_x_positions {
        streetlights.push(StreetlightSpec {
            id: next_light_id,
            x: lx,
            z: -6.4,
            side: BuildingSide::North,
            height: 5.8,
            arm_dir_z: 1.0,
            initial_on: true,
        });
        next_light_id += 1;
    }

    for &lx in &light_x_positions {
        streetlights.push(StreetlightSpec {
            id: next_light_id,
            x: lx,
            z: 6.4,
            side: BuildingSide::South,
            height: 5.8,
            arm_dir_z: -1.0,
            initial_on: true,
        });
        next_light_id += 1;
    }

    // =========================================================================
    // 5. Street Puddles (puddles)
    // =========================================================================
    // 6–10 organic puddles scattered on the wet asphalt (x in [-30, 30], z in [-5.0, 5.0])
    let puddle_count = rng.range_usize(7, 10);
    let x_step = 54.0 / puddle_count as f32;

    for i in 0..puddle_count {
        let base_x = -27.0 + (i as f32 + 0.5) * x_step;
        let px = base_x + rng.range_f32(-2.2, 2.2);
        let pz = rng.range_f32(-4.2, 4.2);
        let radius_x = rng.range_f32(1.4, 3.1);
        let radius_z = rng.range_f32(0.9, 1.95);
        let rotation = rng.range_f32(0.0, PI);

        puddles.push(PuddleSpec {
            id: i as u32,
            x: px,
            z: pz,
            radius_x,
            radius_z,
            rotation,
        });
    }

    // =========================================================================
    // 6. Street Props (props)
    // =========================================================================
    // 6a. Glowing Vending Machines on North Sidewalk (z = -9.2, y = SIDEWALK_Y, facing +Z)
    let vending_x_coords = [-23.5, -12.0, 11.5, 24.0];
    for (i, &vx) in vending_x_coords.iter().enumerate() {
        props.push(PropSpec {
            id: next_prop_id,
            kind: PropKind::Vending,
            x: vx + rng.range_f32(-0.8, 0.8),
            y: SIDEWALK_Y,
            z: -9.2,
            rotation_y: 0.0,
            scale: 1.0,
            color_slot: (i % 3) as u8,
        });
        next_prop_id += 1;
    }

    // 6b. AC Units on building facades (z = -9.85 for North buildings)
    for b in &north_buildings_meta {
        let ac_count = rng.range_usize(1, 3);
        for a in 0..ac_count {
            let offset_x = if a == 0 { -b.width * 0.3 } else { b.width * 0.3 };
            let ac_y = rng.range_f32(3.5, 11.5).min(b.height - 1.2);
            props.push(PropSpec {
                id: next_prop_id,
                kind: PropKind::AcUnit,
                x: b.x + offset_x,
                y: ac_y,
                z: -9.85,
                rotation_y: 0.0,
                scale: rng.range_f32(0.85, 1.05),
                color_slot: 0,
            });
            next_prop_id += 1;
        }
    }

    // 6c. Canal-edge Neon Bollards (along z = 9.25, skipping footbridge opening [-2.2, 2.2])
    let mut bx = -31.5f32;
    let mut bollard_idx = 0usize;
    while bx <= 31.5 {
        if bx.abs() > 2.4 {
            props.push(PropSpec {
                id: next_prop_id,
                kind: PropKind::Bollard,
                x: bx,
                y: SIDEWALK_Y,
                z: 9.25,
                rotation_y: 0.0,
                scale: 1.0,
                color_slot: (bollard_idx % 3) as u8,
            });
            next_prop_id += 1;
            bollard_idx += 1;
        }
        bx += 3.2;
    }

    // 6d. Trash Bins on Sidewalks
    let trash_coords = [(-20.0, -6.8), (14.0, -6.8), (-14.0, 6.8), (20.0, 6.8)];
    for &(tx, tz) in &trash_coords {
        props.push(PropSpec {
            id: next_prop_id,
            kind: PropKind::TrashBin,
            x: tx,
            y: SIDEWALK_Y,
            z: tz,
            rotation_y: rng.range_f32(-0.3, 0.3),
            scale: 1.0,
            color_slot: 0,
        });
        next_prop_id += 1;
    }

    // 6e. 2 Intersection Traffic Poles at (-3.8, -6.3) and (3.8, 6.3)
    props.push(PropSpec {
        id: next_prop_id,
        kind: PropKind::TrafficPole,
        x: -3.8,
        y: SIDEWALK_Y,
        z: -6.3,
        rotation_y: 0.0,
        scale: 1.0,
        color_slot: 0,
    });
    next_prop_id += 1;

    props.push(PropSpec {
        id: next_prop_id,
        kind: PropKind::TrafficPole,
        x: 3.8,
        y: SIDEWALK_Y,
        z: 6.3,
        rotation_y: PI,
        scale: 1.0,
        color_slot: 0,
    });

    BlockLayout {
        seed,
        buildings,
        signs,
        streetlights,
        puddles,
        props,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BLOCK_HALF_LENGTH;

    #[test]
    fn test_generator_determinism() {
        let layout1 = generate_block(42);
        let layout2 = generate_block(42);
        assert_eq!(layout1, layout2);

        let layout3 = generate_block(1337);
        assert_ne!(layout1.buildings, layout3.buildings);
        assert_ne!(layout1.signs, layout3.signs);
    }

    #[test]
    fn test_sign_orientations_and_exact_one_hero() {
        for seed in [1, 42, 999, 123456] {
            let layout = generate_block(seed);

            let has_horizontal = layout
                .signs
                .iter()
                .any(|s| s.orientation == SignOrientation::Horizontal);
            let has_vertical = layout
                .signs
                .iter()
                .any(|s| s.orientation == SignOrientation::Vertical);
            let has_rooftop = layout
                .signs
                .iter()
                .any(|s| s.orientation == SignOrientation::Rooftop);

            assert!(
                has_horizontal,
                "Seed {seed} missing Horizontal signs"
            );
            assert!(has_vertical, "Seed {seed} missing Vertical signs");
            assert!(has_rooftop, "Seed {seed} missing Rooftop signs");

            let hero_count = layout.signs.iter().filter(|s| s.is_hero).count();
            assert_eq!(
                hero_count, 1,
                "Seed {seed} must have exactly 1 hero sign, found {hero_count}"
            );

            // Total signs should be in the ~22-34 range
            assert!(
                layout.signs.len() >= 20 && layout.signs.len() <= 38,
                "Seed {seed} unexpected sign count: {}",
                layout.signs.len()
            );
        }
    }

    #[test]
    fn test_coordinate_bounds() {
        for seed in [7, 42, 888] {
            let layout = generate_block(seed);

            // Buildings within x bounds [-BLOCK_HALF_LENGTH, BLOCK_HALF_LENGTH]
            for b in &layout.buildings {
                let half_w = b.width * 0.5;
                assert!(
                    b.x - half_w >= -BLOCK_HALF_LENGTH - 1.0,
                    "Building {} x_min out of bounds: {}",
                    b.id,
                    b.x - half_w
                );
                assert!(
                    b.x + half_w <= BLOCK_HALF_LENGTH + 1.0,
                    "Building {} x_max out of bounds: {}",
                    b.id,
                    b.x + half_w
                );

                if b.side == BuildingSide::North {
                    // Front facade at z = -10.0
                    let front_z = b.z + b.depth * 0.5;
                    assert!(
                        (front_z - (-10.0)).abs() < 0.01,
                        "North building front facade not at -10.0: {front_z}"
                    );
                } else {
                    // Front facade at z = 18.4
                    let front_z = b.z - b.depth * 0.5;
                    assert!(
                        (front_z - 18.4).abs() < 0.01,
                        "South building front facade not at 18.4: {front_z}"
                    );
                }
            }

            // Streetlights
            assert_eq!(layout.streetlights.len(), 12);
            for l in &layout.streetlights {
                assert!(l.x.abs() <= 30.0);
                assert!((l.z.abs() - 6.4).abs() < 0.01);
            }

            // Puddles on asphalt
            for p in &layout.puddles {
                assert!(p.x.abs() <= 32.0);
                assert!(p.z.abs() <= 5.5);
            }

            // Traffic poles exist at specified coordinates
            let pole_north = layout.props.iter().find(|p| {
                p.kind == PropKind::TrafficPole && (p.x - (-3.8)).abs() < 0.1
            });
            let pole_south = layout.props.iter().find(|p| {
                p.kind == PropKind::TrafficPole && (p.x - 3.8).abs() < 0.1
            });
            assert!(pole_north.is_some(), "Missing north traffic pole");
            assert!(pole_south.is_some(), "Missing south traffic pole");
        }
    }

    #[test]
    fn test_full_generated_layout_json_serialization() {
        let layout = generate_block(42);
        let json = serde_json::to_string(&layout).unwrap();

        // Verify top-level and nested camelCase fields
        assert!(json.contains("\"roofStyle\":"));
        assert!(json.contains("\"colorTint\":"));
        assert!(json.contains("\"windowRows\":"));
        assert!(json.contains("\"windowCols\":"));
        assert!(json.contains("\"windowSeed\":"));
        assert!(json.contains("\"buildingId\":"));
        assert!(json.contains("\"facingY\":"));
        assert!(json.contains("\"colorSlot\":"));
        assert!(json.contains("\"labelIndex\":"));
        assert!(json.contains("\"isHero\":"));
        assert!(json.contains("\"armDirZ\":"));
        assert!(json.contains("\"initialOn\":"));
        assert!(json.contains("\"radiusX\":"));
        assert!(json.contains("\"radiusZ\":"));
        assert!(json.contains("\"rotationY\":"));

        // Roundtrip deserialization
        let roundtrip: BlockLayout = serde_json::from_str(&json).unwrap();
        assert_eq!(layout, roundtrip);
    }
}
