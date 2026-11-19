//! Deterministic pseudo-random number generator (SplitMix64) and procedural value noise functions.
//!
//! Zero external crates and zero OS/hardware randomness dependencies.
//! All algorithms are 100% reproducible across platforms and WebAssembly targets.

/// Deterministic SplitMix64 pseudo-random number generator.
///
/// SplitMix64 has a period of 2^64, passes standard BigCrush statistical tests,
/// and has a fast, lightweight 64-bit state ideal for procedural generation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Initialize with a 64-bit seed.
    /// Any seed is valid; seed `0` is automatically mapped to a non-zero golden ratio constant.
    pub fn new(seed: u64) -> Self {
        let state = if seed == 0 {
            0x853c49e6748fea9b
        } else {
            seed
        };
        let mut rng = Self { state };
        // Warm up state with one step
        rng.next_u64();
        rng
    }

    /// Generate the next pseudo-random `u64`.
    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }

    /// Generate the next pseudo-random `u32`.
    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        (self.next_u64() >> 32) as u32
    }

    /// Generate a float in `[0.0, 1.0)` with 24 bits of uniform mantissa precision.
    #[inline]
    pub fn next_f32(&mut self) -> f32 {
        let v = (self.next_u32() >> 8) as f32;
        v / 16777216.0
    }

    /// Generate a float in `[min, max)`. If `max <= min`, returns `min`.
    #[inline]
    pub fn range_f32(&mut self, min: f32, max: f32) -> f32 {
        if max <= min {
            return min;
        }
        min + (max - min) * self.next_f32()
    }

    /// Generate an integer in `[min, max_exclusive)`. If `max_exclusive <= min`, returns `min`.
    #[inline]
    pub fn range_usize(&mut self, min: usize, max_exclusive: usize) -> usize {
        if max_exclusive <= min {
            return min;
        }
        let span = max_exclusive - min;
        min + ((self.next_u64() as usize) % span)
    }

    /// Returns `true` with probability `prob` clamped to `[0.0, 1.0]`.
    #[inline]
    pub fn chance(&mut self, prob: f32) -> bool {
        if prob <= 0.0 {
            false
        } else if prob >= 1.0 {
            true
        } else {
            self.next_f32() < prob
        }
    }
}

// Internal integer coordinate hash for 2D noise lattice
#[inline]
fn hash2(x: i32, y: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x27d4eb2d)
        ^ (y as u32).wrapping_mul(0x165667b1)
        ^ seed.wrapping_mul(0x9e3779b9);
    h = (h ^ (h >> 15)).wrapping_mul(0x85ebca6b);
    h = (h ^ (h >> 13)).wrapping_mul(0xc2b2ae35);
    h = h ^ (h >> 16);
    (h as f32 / 4294967295.0) * 2.0 - 1.0
}

// Internal integer coordinate hash for 3D noise lattice
#[inline]
fn hash3(x: i32, y: i32, z: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x27d4eb2d)
        ^ (y as u32).wrapping_mul(0x165667b1)
        ^ (z as u32).wrapping_mul(0x85157af5)
        ^ seed.wrapping_mul(0x9e3779b9);
    h = (h ^ (h >> 15)).wrapping_mul(0x85ebca6b);
    h = (h ^ (h >> 13)).wrapping_mul(0xc2b2ae35);
    h = h ^ (h >> 16);
    (h as f32 / 4294967295.0) * 2.0 - 1.0
}

// Quintic interpolation curve: 6t^5 - 15t^4 + 10t^3 (zero 1st & 2nd derivatives at ends)
#[inline]
fn quintic(t: f32) -> f32 {
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

/// Deterministic 2D smooth value noise.
///
/// Returns continuous noise in `[-1.0, 1.0]`.
/// To map to `[0.0, 1.0]`, compute `val * 0.5 + 0.5`.
pub fn noise2d(x: f32, y: f32, seed: u32) -> f32 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let fx = x - x.floor();
    let fy = y - y.floor();

    let sx = quintic(fx);
    let sy = quintic(fy);

    let v00 = hash2(x0, y0, seed);
    let v10 = hash2(x0.wrapping_add(1), y0, seed);
    let v01 = hash2(x0, y0.wrapping_add(1), seed);
    let v11 = hash2(x0.wrapping_add(1), y0.wrapping_add(1), seed);

    let ix0 = v00 + sx * (v10 - v00);
    let ix1 = v01 + sx * (v11 - v01);
    ix0 + sy * (ix1 - ix0)
}

/// Deterministic 3D smooth value noise.
///
/// Returns continuous noise in `[-1.0, 1.0]`.
/// To map to `[0.0, 1.0]`, compute `val * 0.5 + 0.5`.
pub fn noise3d(x: f32, y: f32, z: f32, seed: u32) -> f32 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let z0 = z.floor() as i32;

    let fx = x - x.floor();
    let fy = y - y.floor();
    let fz = z - z.floor();

    let sx = quintic(fx);
    let sy = quintic(fy);
    let sz = quintic(fz);

    let v000 = hash3(x0, y0, z0, seed);
    let v100 = hash3(x0.wrapping_add(1), y0, z0, seed);
    let v010 = hash3(x0, y0.wrapping_add(1), z0, seed);
    let v110 = hash3(x0.wrapping_add(1), y0.wrapping_add(1), z0, seed);
    let v001 = hash3(x0, y0, z0.wrapping_add(1), seed);
    let v101 = hash3(x0.wrapping_add(1), y0, z0.wrapping_add(1), seed);
    let v011 = hash3(x0, y0.wrapping_add(1), z0.wrapping_add(1), seed);
    let v111 = hash3(x0.wrapping_add(1), y0.wrapping_add(1), z0.wrapping_add(1), seed);

    let ix00 = v000 + sx * (v100 - v000);
    let ix10 = v010 + sx * (v110 - v010);
    let ix01 = v001 + sx * (v101 - v001);
    let ix11 = v011 + sx * (v111 - v011);

    let iy0 = ix00 + sy * (ix10 - ix00);
    let iy1 = ix01 + sy * (ix11 - ix01);

    iy0 + sz * (iy1 - iy0)
}

/// Deterministic 2D Fractal Brownian Motion (fBm).
///
/// Sums multiple octaves of `noise2d` with lacunarity = 2.0 and persistence = 0.5.
/// Normalized to return values strictly in `[-1.0, 1.0]`.
pub fn fbm2d(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
    let count = octaves.clamp(1, 8);
    let mut total = 0.0;
    let mut frequency = 1.0;
    let mut amplitude = 0.5;
    let mut max_amp = 0.0;

    for i in 0..count {
        let n = noise2d(
            x * frequency,
            y * frequency,
            seed.wrapping_add(i.wrapping_mul(1013)),
        );
        total += n * amplitude;
        max_amp += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }

    if max_amp > 0.0 {
        total / max_amp
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rng_determinism() {
        let mut rng1 = Rng::new(42);
        let mut rng2 = Rng::new(42);

        for _ in 0..100 {
            assert_eq!(rng1.next_u64(), rng2.next_u64());
            assert_eq!(rng1.next_u32(), rng2.next_u32());
            assert_eq!(rng1.next_f32(), rng2.next_f32());
        }
    }

    #[test]
    fn test_rng_distinct_seeds() {
        let mut rng1 = Rng::new(1);
        let mut rng2 = Rng::new(2);

        let v1: Vec<u64> = (0..10).map(|_| rng1.next_u64()).collect();
        let v2: Vec<u64> = (0..10).map(|_| rng2.next_u64()).collect();
        assert_ne!(v1, v2);
    }

    #[test]
    fn test_rng_ranges() {
        let mut rng = Rng::new(12345);

        for _ in 0..1000 {
            let f = rng.next_f32();
            assert!((0.0..1.0).contains(&f), "next_f32 out of range: {f}");

            let rf = rng.range_f32(5.5, 10.5);
            assert!(
                (5.5..10.5).contains(&rf),
                "range_f32 out of range: {rf}"
            );

            let ri = rng.range_usize(3, 7);
            assert!((3..7).contains(&ri), "range_usize out of range: {ri}");
        }

        assert_eq!(rng.range_f32(10.0, 5.0), 10.0);
        assert_eq!(rng.range_usize(5, 5), 5);
        assert_eq!(rng.range_usize(5, 2), 5);
    }

    #[test]
    fn test_rng_chance() {
        let mut rng = Rng::new(999);
        assert!(!rng.chance(0.0));
        assert!(!rng.chance(-0.5));
        assert!(rng.chance(1.0));
        assert!(rng.chance(1.5));

        let count = 10_000;
        let hits = (0..count).filter(|_| rng.chance(0.3)).count();
        let ratio = hits as f32 / count as f32;
        assert!(
            (ratio - 0.3).abs() < 0.02,
            "chance(0.3) ratio unexpected: {ratio}"
        );
    }

    #[test]
    fn test_noise_bounds_and_determinism() {
        for seed in [0, 42, 99999] {
            for i in -20..20 {
                let x = i as f32 * 0.37;
                let y = (i as f32 + 5.0) * 0.41;
                let z = (i as f32 - 3.0) * 0.29;

                let n2 = noise2d(x, y, seed);
                assert!(
                    (-1.0..=1.0).contains(&n2),
                    "noise2d out of bounds [-1, 1]: {n2}"
                );
                assert_eq!(n2, noise2d(x, y, seed), "noise2d non-deterministic");

                let n3 = noise3d(x, y, z, seed);
                assert!(
                    (-1.0..=1.0).contains(&n3),
                    "noise3d out of bounds [-1, 1]: {n3}"
                );
                assert_eq!(n3, noise3d(x, y, z, seed), "noise3d non-deterministic");

                let f = fbm2d(x, y, 4, seed);
                assert!(
                    (-1.0..=1.0).contains(&f),
                    "fbm2d out of bounds [-1, 1]: {f}"
                );
                assert_eq!(f, fbm2d(x, y, 4, seed), "fbm2d non-deterministic");
            }
        }
    }
}
