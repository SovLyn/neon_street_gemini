import * as THREE from 'three';
import type { SignOrientation } from '../types/sim';

/**
 * Curated bank of 16 atmospheric cyberpunk / Tokyo / Kowloon neon sign labels
 */
export const NEON_SIGN_LABELS: readonly string[] = [
  '電脳拉麺',
  '夜光喫茶',
  '新東京24H',
  'CYBER BAR',
  '霓虹酒店',
  '光速飯店',
  'AKIBA ARCADE',
  '月光珈琲',
  'SYNTH LAB',
  '九龍夜市',
  '星屑食堂',
  'NEON 2099',
  '深夜書屋',
  '電撃音楽',
  '白昼夢館',
  'RAIN CLUB',
] as const;

const FONT_STACK =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK JP", "Segoe UI", system-ui, sans-serif';

const signTextureCache = new Map<string, THREE.CanvasTexture>();
let cachedAsphalt: { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } | null = null;
let cachedRadialGlow: THREE.CanvasTexture | null = null;

export function getSignLabelText(
  labelIndex: number,
  isHero: boolean,
  customSignText?: string
): string {
  if (isHero && customSignText && customSignText.trim().length > 0) {
    return customSignText.trim().slice(0, 24);
  }
  const safeIndex =
    ((Math.floor(labelIndex) % NEON_SIGN_LABELS.length) + NEON_SIGN_LABELS.length) %
    NEON_SIGN_LABELS.length;
  return NEON_SIGN_LABELS[safeIndex];
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  let r = 0;
  let g = 245;
  let b = 255;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) || 0;
    g = parseInt(clean[1] + clean[1], 16) || 0;
    b = parseInt(clean[2] + clean[2], 16) || 0;
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16) || 0;
    g = parseInt(clean.slice(2, 4), 16) || 0;
    b = parseInt(clean.slice(4, 6), 16) || 0;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generates a high-contrast glowing procedural CanvasTexture for horizontal, vertical, or rooftop neon signs.
 */
export function createNeonSignTexture(
  text: string,
  orientation: SignOrientation,
  primaryHex: string,
  accentHex: string
): THREE.CanvasTexture {
  const displayLabel = (text && text.trim().length > 0 ? text.trim() : '電脳拉麺').slice(0, 24);
  const cacheKey = `${displayLabel}|${orientation}|${primaryHex}|${accentHex}`;
  const existing = signTextureCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const isVertical = orientation === 'vertical';
  const width = isVertical ? 192 : 512;
  const height = isVertical ? 512 : 192;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // 1. Deep dark glass backing
    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, width, height);

    // 2. Ambient interior neon backlight gradient
    const radial = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      10,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.62
    );
    radial.addColorStop(0, hexToRgba(primaryHex, 0.24));
    radial.addColorStop(0.55, hexToRgba(accentHex, 0.1));
    radial.addColorStop(1, 'rgba(4, 6, 12, 0.96)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);

    // 3. Outer glowing neon border tube
    const pad = 12;
    ctx.save();
    drawRoundedRect(ctx, pad, pad, width - pad * 2, height - pad * 2, 12);
    ctx.shadowColor = primaryHex;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = primaryHex;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Hot white-tinted inner core of border tube
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // 4. Inner accent frame & corner brackets
    const innerPad = 21;
    ctx.save();
    drawRoundedRect(
      ctx,
      innerPad,
      innerPad,
      width - innerPad * 2,
      height - innerPad * 2,
      7
    );
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = hexToRgba(accentHex, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Corner decorative ticks / rooftop hazard bar
    ctx.save();
    ctx.fillStyle = accentHex;
    ctx.shadowColor = accentHex;
    ctx.shadowBlur = 8;
    if (orientation === 'rooftop') {
      const stripeY = height - 30;
      for (let sx = 30; sx < width - 36; sx += 24) {
        ctx.fillRect(sx, stripeY, 12, 4);
      }
    } else {
      ctx.fillRect(26, 26, 14, 3);
      ctx.fillRect(width - 40, 26, 14, 3);
      ctx.fillRect(26, height - 29, 14, 3);
      ctx.fillRect(width - 40, height - 29, 14, 3);
    }
    ctx.restore();

    // 5. Crisp multi-layered neon typography
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isVertical) {
      const chars = Array.from(displayLabel.replace(/\s+/g, ''));
      const visibleChars = chars.slice(0, 10);
      const count = Math.max(1, visibleChars.length);
      const usableHeight = height - 88;
      const stepY = usableHeight / count;
      const fontSize = Math.max(24, Math.min(72, Math.floor(stepY * 0.82)));
      ctx.font = `900 ${fontSize}px ${FONT_STACK}`;

      const startY = 44 + stepY * 0.5;
      const centerX = width * 0.5;

      for (let i = 0; i < visibleChars.length; i++) {
        const ch = visibleChars[i];
        const cy = startY + i * stepY;

        // Outer neon bloom
        ctx.shadowColor = primaryHex;
        ctx.shadowBlur = 24;
        ctx.fillStyle = primaryHex;
        ctx.fillText(ch, centerX, cy);

        // Secondary accent halo
        ctx.shadowColor = accentHex;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = primaryHex;
        ctx.lineWidth = 3.5;
        ctx.strokeText(ch, centerX, cy);

        // White-hot neon tube core
        ctx.shadowColor = primaryHex;
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ch, centerX, cy);
      }
    } else {
      const maxTextWidth = width - 76;
      let fontSize = orientation === 'rooftop' ? 76 : 68;
      ctx.font = `900 ${fontSize}px ${FONT_STACK}`;
      let measured = ctx.measureText(displayLabel).width;
      while (measured > maxTextWidth && fontSize > 22) {
        fontSize -= 3;
        ctx.font = `900 ${fontSize}px ${FONT_STACK}`;
        measured = ctx.measureText(displayLabel).width;
      }

      const centerX = width * 0.5;
      const centerY = orientation === 'rooftop' ? height * 0.46 : height * 0.5;

      // Pass 1: Wide outer neon bloom
      ctx.shadowColor = primaryHex;
      ctx.shadowBlur = 26;
      ctx.fillStyle = primaryHex;
      ctx.fillText(displayLabel, centerX, centerY);

      // Pass 2: Rich stroke glow
      ctx.shadowColor = accentHex;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = primaryHex;
      ctx.lineWidth = 4;
      ctx.strokeText(displayLabel, centerX, centerY);

      // Pass 3: Crisp white-hot core
      ctx.shadowColor = primaryHex;
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(displayLabel, centerX, centerY);
    }
    ctx.restore();

    // 6. Subtle horizontal CRT/neon scanline overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 1.5);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  signTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Generates dark wet asphalt diffuse map and roughness map with lane markings and central crosswalk.
 */
export function createAsphaltTextures(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  if (cachedAsphalt) {
    return cachedAsphalt;
  }

  const width = 1024;
  const height = 512;

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = width;
  mapCanvas.height = height;
  const mCtx = mapCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d');

  if (mCtx && rCtx) {
    // Base dark wet asphalt
    mCtx.fillStyle = '#0b0e15';
    mCtx.fillRect(0, 0, width, height);

    // Base wet roughness (low values = glossy wet reflection)
    rCtx.fillStyle = 'rgb(72, 72, 72)';
    rCtx.fillRect(0, 0, width, height);

    // Deterministic mineral grain & wet streaks
    let seed = 1337;
    const nextRand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < 3600; i++) {
      const gx = nextRand() * width;
      const gy = nextRand() * height;
      const gw = 1 + nextRand() * 3;
      const gh = 1 + nextRand() * 2;
      const shade = Math.floor(10 + nextRand() * 18);
      mCtx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 9})`;
      mCtx.fillRect(gx, gy, gw, gh);
    }

    // Glossy tire track strips along the 4 lanes
    const laneCentersV = [0.14, 0.36, 0.64, 0.86];
    for (const lv of laneCentersV) {
      const cy = lv * height;
      const grad = rCtx.createLinearGradient(0, cy - 34, 0, cy + 34);
      grad.addColorStop(0, 'rgba(72, 72, 72, 0)');
      grad.addColorStop(0.3, 'rgba(30, 30, 30, 0.85)');
      grad.addColorStop(0.5, 'rgba(42, 42, 42, 0.5)');
      grad.addColorStop(0.7, 'rgba(30, 30, 30, 0.85)');
      grad.addColorStop(1, 'rgba(72, 72, 72, 0)');
      rCtx.fillStyle = grad;
      rCtx.fillRect(0, cy - 34, width, 68);
    }

    // Crosswalk zone in U coordinates: centered at x = 0, spanning [-2.6, 2.6] across 74m road
    const crosswalkHalfU = 2.6 / 74;
    const cwMinX = (0.5 - crosswalkHalfU) * width;
    const cwMaxX = (0.5 + crosswalkHalfU) * width;
    const stopLeftX = (0.5 - 3.6 / 74) * width;
    const stopRightX = (0.5 + 3.6 / 74) * width;

    // Outer shoulder solid lines
    mCtx.fillStyle = 'rgba(180, 198, 220, 0.42)';
    rCtx.fillStyle = 'rgb(155, 155, 155)';
    const edgeOffset = 18;
    mCtx.fillRect(0, edgeOffset, width, 5);
    mCtx.fillRect(0, height - edgeOffset - 5, width, 5);
    rCtx.fillRect(0, edgeOffset, width, 5);
    rCtx.fillRect(0, height - edgeOffset - 5, width, 5);

    // Double center amber divider (paused across crosswalk)
    mCtx.fillStyle = 'rgba(235, 168, 42, 0.68)';
    const midY = height * 0.5;
    mCtx.fillRect(0, midY - 6, stopLeftX - 8, 4);
    mCtx.fillRect(0, midY + 2, stopLeftX - 8, 4);
    mCtx.fillRect(stopRightX + 8, midY - 6, width - stopRightX - 8, 4);
    mCtx.fillRect(stopRightX + 8, midY + 2, width - stopRightX - 8, 4);

    // Dashed white lane dividers at 1/4 and 3/4 road depth
    mCtx.fillStyle = 'rgba(210, 226, 245, 0.52)';
    const quarterY1 = height * 0.25;
    const quarterY2 = height * 0.75;
    for (let dx = 16; dx < width - 16; dx += 44) {
      if (dx + 24 > stopLeftX - 6 && dx < stopRightX + 6) {
        continue;
      }
      mCtx.fillRect(dx, quarterY1 - 2, 24, 4);
      mCtx.fillRect(dx, quarterY2 - 2, 24, 4);
      rCtx.fillRect(dx, quarterY1 - 2, 24, 4);
      rCtx.fillRect(dx, quarterY2 - 2, 24, 4);
    }

    // Stop bars flanking the crosswalk
    mCtx.fillStyle = 'rgba(226, 238, 252, 0.72)';
    mCtx.fillRect(stopLeftX - 6, edgeOffset + 6, 6, midY - edgeOffset - 12);
    mCtx.fillRect(stopRightX, midY + 6, 6, height - edgeOffset - midY - 12);

    // Central Zebra Crosswalk stripes
    const cwWidth = cwMaxX - cwMinX;
    mCtx.fillStyle = 'rgba(232, 242, 255, 0.78)';
    rCtx.fillStyle = 'rgb(170, 170, 170)';
    const stripeCount = 11;
    const totalVertical = height - (edgeOffset + 14) * 2;
    const stripePitch = totalVertical / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      const sy = edgeOffset + 14 + i * stripePitch + stripePitch * 0.16;
      const sh = stripePitch * 0.62;
      mCtx.fillRect(cwMinX, sy, cwWidth, sh);
      rCtx.fillRect(cwMinX, sy, cwWidth, sh);
    }
  }

  const map = new THREE.CanvasTexture(mapCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  cachedAsphalt = { map, roughnessMap };
  return cachedAsphalt;
}

/**
 * Generates a soft radial glow texture for light pools, streetlight halos, and headlights.
 */
export function createRadialGlowTexture(): THREE.CanvasTexture {
  if (cachedRadialGlow) {
    return cachedRadialGlow;
  }

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.68)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedRadialGlow = tex;
  return tex;
}

/**
 * Disposes only cached neon sign textures (useful when regenerating street or changing themes).
 */
export function disposeSignTextures(): void {
  for (const tex of signTextureCache.values()) {
    tex.dispose();
  }
  signTextureCache.clear();
}

/**
 * Disposes all procedural textures in the module cache.
 */
export function disposeProceduralTextures(): void {
  disposeSignTextures();
  if (cachedAsphalt) {
    cachedAsphalt.map.dispose();
    cachedAsphalt.roughnessMap.dispose();
    cachedAsphalt = null;
  }
  if (cachedRadialGlow) {
    cachedRadialGlow.dispose();
    cachedRadialGlow = null;
  }
}
