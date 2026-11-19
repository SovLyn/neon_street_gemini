import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import {
  BLOCK_HALF_LENGTH,
  CANAL_WATER_Y,
  CANAL_Z_MAX,
  CANAL_Z_MIN,
  MAX_RIPPLES,
  RIPPLE_STRIDE,
  type AtmosphereState,
  type PuddleSpec,
} from '../../types/sim';
import type { ThemeDefinition } from '../../config/themes';

function createInitialRippleArray(): THREE.Vector4[] {
  const arr: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_RIPPLES; i++) {
    arr.push(new THREE.Vector4(0, 0, 0, 0));
  }
  return arr;
}

const CANAL_REFLECTOR_SHADER = {
  name: 'NeonCanalReflectorShader',
  uniforms: {
    color: { value: new THREE.Color('#00f5ff') },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0.0 },
    uWetness: { value: 0.85 },
    uRainIntensity: { value: 0.5 },
    uWaterTint: { value: new THREE.Color('#00f5ff') },
    uWaterDeep: { value: new THREE.Color('#040a12') },
    uRippleCount: { value: 0 },
    uRipples: { value: createInitialRippleArray() },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorldPos;

    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uWetness;
    uniform float uRainIntensity;
    uniform vec3 uWaterTint;
    uniform vec3 uWaterDeep;
    uniform int uRippleCount;
    uniform vec4 uRipples[16];

    varying vec4 vUv;
    varying vec3 vWorldPos;

    #include <logdepthbuf_pars_fragment>

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      #include <logdepthbuf_fragment>

      vec2 wp = vWorldPos.xz;

      // Layered flowing canal waves
      float w1 = sin(wp.x * 0.85 + uTime * 2.1 + wp.y * 0.35);
      float w2 = cos(wp.y * 1.65 - uTime * 1.75 + wp.x * 0.25);
      float w3 = sin((wp.x - wp.y) * 2.4 + uTime * 3.1);
      vec2 waveOffset = vec2(w1 + w3 * 0.5, w2 + w3 * 0.5) * 0.022 * (0.65 + 0.35 * uWetness);

      // Raindrop micro-shimmer on water surface
      float rainSparkle = 0.0;
      if (uRainIntensity > 0.01) {
        vec2 cell = floor(wp * 3.5);
        float h = hash21(cell);
        float phase = fract(uTime * (1.8 + h * 1.5) + h * 10.0);
        vec2 localPos = fract(wp * 3.5) - 0.5;
        float rDist = length(localPos);
        float ring = exp(-pow((rDist - phase * 0.48) * 18.0, 2.0)) * (1.0 - phase);
        waveOffset += localPos * ring * uRainIntensity * 0.08;
        rainSparkle = ring * uRainIntensity * 0.38;
      }

      // Interactive & ambient expanding water ripples from Rust buffer
      float rippleHighlight = 0.0;
      for (int i = 0; i < 16; i++) {
        if (i >= uRippleCount) break;
        vec4 rip = uRipples[i];
        float strength = rip.w;
        if (strength > 0.001) {
          vec2 delta = wp - rip.xy;
          float dist = length(delta);
          float diff = dist - rip.z;
          float envelope = exp(-diff * diff * 4.5);
          float osc = sin(diff * 15.0 - uTime * 4.0);
          vec2 dir = dist > 0.001 ? (delta / dist) : vec2(1.0, 0.0);
          waveOffset += dir * osc * envelope * strength * 0.095;
          rippleHighlight += envelope * (0.55 + 0.45 * osc) * strength;
        }
      }

      vec4 distortedUv = vUv;
      distortedUv.xy += waveOffset * max(0.25, distortedUv.w);

      vec4 reflSample = texture2DProj(tDiffuse, distortedUv);
      vec3 reflColor = reflSample.rgb;

      // Combine deep water base, planar reflection, neon water tint, and ripple crest glow
      float fresnelApprox = 0.68 + 0.22 * uWetness;
      vec3 waterCol = mix(uWaterDeep, reflColor * (0.88 + uWaterTint * 0.28), fresnelApprox);
      waterCol += uWaterTint * (0.045 + rainSparkle * 0.42 + rippleHighlight * 0.95);

      gl_FragColor = vec4(waterCol, 1.0);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

const PUDDLE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const PUDDLE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uWetness;
  uniform float uRainIntensity;
  uniform vec3 uNeon0;
  uniform vec3 uNeon1;
  uniform vec3 uWaterTint;
  uniform vec3 uWaterDeep;
  uniform int uRippleCount;
  uniform vec4 uRipples[16];

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    float angle = atan(centered.y, centered.x);
    float organicRadius = 1.0 - 0.12 * sin(angle * 3.0 + vWorldPos.x) - 0.08 * cos(angle * 5.0 - vWorldPos.z);
    float distNorm = length(centered) / max(0.2, organicRadius);
    if (distNorm > 1.0) discard;

    float edgeAlpha = smoothstep(1.0, 0.52, distNorm);

    // Shimmering neon street reflection bands across the puddle
    vec2 wp = vWorldPos.xz;
    float shimmer = sin(wp.x * 1.4 + uTime * 1.8) * cos(wp.y * 2.2 - uTime * 1.3);
    float streak0 = smoothstep(0.2, 0.85, sin(wp.x * 0.45 + shimmer * 0.45) * 0.5 + 0.5);
    float streak1 = smoothstep(0.3, 0.9, cos(wp.x * 0.62 - wp.y * 0.5 + shimmer * 0.35) * 0.5 + 0.5);

    vec3 puddleCol = mix(uWaterDeep, uNeon0 * 0.55, streak0 * 0.65);
    puddleCol = mix(puddleCol, uNeon1 * 0.52, streak1 * 0.55);

    // Interactive click ripples on puddles
    float rippleGlow = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uRippleCount) break;
      vec4 rip = uRipples[i];
      if (rip.w > 0.001) {
        float d = length(wp - rip.xy);
        float diff = d - rip.z;
        float env = exp(-diff * diff * 5.5);
        rippleGlow += env * rip.w;
      }
    }

    puddleCol += uWaterTint * (0.12 + rippleGlow * 1.15 + uRainIntensity * 0.12);
    float finalAlpha = edgeAlpha * (0.38 + 0.52 * uWetness);

    gl_FragColor = vec4(puddleCol, finalAlpha);
  }
`;

export class WaterSystem {
  public readonly group = new THREE.Group();

  private canalReflector: Reflector;
  private readonly puddleMaterial: THREE.ShaderMaterial;
  private readonly puddleMeshes: THREE.Mesh[] = [];
  private readonly rippleRingMeshes: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private readonly clickableObjects: THREE.Object3D[] = [];
  private readonly rippleUniforms: THREE.Vector4[];

  constructor(puddles: PuddleSpec[], theme: ThemeDefinition) {
    this.group.name = 'WaterSystem';
    this.rippleUniforms = createInitialRippleArray();

    // 1. Canal Planar Reflector
    const canalWidth = (BLOCK_HALF_LENGTH + 1) * 2;
    const canalDepth = CANAL_Z_MAX - CANAL_Z_MIN;
    const canalCenterZ = (CANAL_Z_MIN + CANAL_Z_MAX) * 0.5;

    const canalGeo = new THREE.PlaneGeometry(canalWidth, canalDepth);
    this.canalReflector = new Reflector(canalGeo, {
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      color: theme.scene.waterTint,
      multisample: 0,
      shader: CANAL_REFLECTOR_SHADER,
    });
    this.canalReflector.rotation.x = -Math.PI * 0.5;
    this.canalReflector.position.set(0, CANAL_WATER_Y, canalCenterZ);
    this.canalReflector.userData = { interactType: 'water', interactId: 0 };

    // Link shared ripple array into reflector material
    const reflMat = this.canalReflector.material as THREE.ShaderMaterial;
    if (reflMat && reflMat.uniforms) {
      reflMat.uniforms.uWaterTint.value.set(theme.scene.waterTint);
      reflMat.uniforms.uWaterDeep.value.set(theme.scene.waterDeep);
      reflMat.uniforms.uRipples.value = this.rippleUniforms;
    }

    this.group.add(this.canalReflector);
    this.clickableObjects.push(this.canalReflector);

    // 2. Wet Street Puddles
    this.puddleMaterial = new THREE.ShaderMaterial({
      vertexShader: PUDDLE_VERTEX_SHADER,
      fragmentShader: PUDDLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0.0 },
        uWetness: { value: 0.85 },
        uRainIntensity: { value: 0.5 },
        uNeon0: { value: new THREE.Color(theme.scene.neon[0]) },
        uNeon1: { value: new THREE.Color(theme.scene.neon[1]) },
        uWaterTint: { value: new THREE.Color(theme.scene.waterTint) },
        uWaterDeep: { value: new THREE.Color(theme.scene.waterDeep) },
        uRippleCount: { value: 0 },
        uRipples: { value: this.rippleUniforms },
      },
    });

    for (const p of puddles) {
      const pGeo = new THREE.PlaneGeometry(p.radiusX * 2, p.radiusZ * 2);
      const pMesh = new THREE.Mesh(pGeo, this.puddleMaterial);
      pMesh.rotation.x = -Math.PI * 0.5;
      pMesh.rotation.z = p.rotation;
      pMesh.position.set(p.x, 0.016, p.z);
      pMesh.userData = { interactType: 'water', interactId: p.id + 1 };
      this.puddleMeshes.push(pMesh);
      this.clickableObjects.push(pMesh);
      this.group.add(pMesh);
    }

    // 3. Crisp 3D expanding neon ripple ring pool (for unmistakable grazing-angle feedback)
    const ringGeo = new THREE.RingGeometry(0.84, 1.0, 32);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: theme.scene.waterTint,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI * 0.5;
      ringMesh.visible = false;
      this.rippleRingMeshes.push(ringMesh);
      this.group.add(ringMesh);
    }
  }

  public getClickableObjects(): THREE.Object3D[] {
    return this.clickableObjects;
  }

  public getCanalWorldPoint(): THREE.Vector3 {
    // Return an unobstructed point in the foreground canal within camera frustum and away from the footbridge
    return new THREE.Vector3(-4.0, CANAL_WATER_Y, 11.2);
  }

  public updateTheme(theme: ThemeDefinition): void {
    const reflMat = this.canalReflector.material as THREE.ShaderMaterial;
    if (reflMat && reflMat.uniforms) {
      reflMat.uniforms.color.value.set(theme.scene.waterTint);
      reflMat.uniforms.uWaterTint.value.set(theme.scene.waterTint);
      reflMat.uniforms.uWaterDeep.value.set(theme.scene.waterDeep);
    }

    this.puddleMaterial.uniforms.uNeon0.value.set(theme.scene.neon[0]);
    this.puddleMaterial.uniforms.uNeon1.value.set(theme.scene.neon[1]);
    this.puddleMaterial.uniforms.uWaterTint.value.set(theme.scene.waterTint);
    this.puddleMaterial.uniforms.uWaterDeep.value.set(theme.scene.waterDeep);

    for (const ring of this.rippleRingMeshes) {
      ring.material.color.set(theme.scene.waterTint);
    }
  }

  public updateFrame(
    atmosphere: AtmosphereState,
    ripplesBuffer: Float32Array,
    wavePhase: number
  ): void {
    const activeRipples = Math.min(
      MAX_RIPPLES,
      Math.floor(ripplesBuffer.length / RIPPLE_STRIDE)
    );

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const ring = this.rippleRingMeshes[i];
      if (i < activeRipples) {
        const base = i * RIPPLE_STRIDE;
        const rx = ripplesBuffer[base];
        const rz = ripplesBuffer[base + 1];
        const radius = ripplesBuffer[base + 2];
        const strength = ripplesBuffer[base + 3];

        this.rippleUniforms[i].set(rx, rz, radius, strength);

        if (strength > 0.01 && radius > 0.02) {
          const isCanal = rz >= CANAL_Z_MIN - 0.2;
          const surfaceY = isCanal ? CANAL_WATER_Y + 0.022 : 0.024;
          ring.position.set(rx, surfaceY, rz);
          const scale = Math.max(0.15, radius);
          ring.scale.set(scale, scale, 1);
          ring.material.opacity = THREE.MathUtils.clamp(strength * 0.78, 0, 0.9);
          ring.visible = true;
        } else {
          ring.visible = false;
        }
      } else {
        this.rippleUniforms[i].set(0, 0, 0, 0);
        ring.visible = false;
      }
    }

    const reflMat = this.canalReflector.material as THREE.ShaderMaterial;
    if (reflMat && reflMat.uniforms) {
      reflMat.uniforms.uTime.value = wavePhase;
      reflMat.uniforms.uWetness.value = atmosphere.wetness;
      reflMat.uniforms.uRainIntensity.value = atmosphere.rainIntensity;
      reflMat.uniforms.uRippleCount.value = activeRipples;
    }

    this.puddleMaterial.uniforms.uTime.value = wavePhase;
    this.puddleMaterial.uniforms.uWetness.value = atmosphere.wetness;
    this.puddleMaterial.uniforms.uRainIntensity.value = atmosphere.rainIntensity;
    this.puddleMaterial.uniforms.uRippleCount.value = activeRipples;
  }

  public dispose(): void {
    this.clickableObjects.length = 0;
    this.canalReflector.geometry.dispose();
    this.canalReflector.dispose();

    for (const pm of this.puddleMeshes) {
      pm.geometry.dispose();
    }
    this.puddleMeshes.length = 0;
    this.puddleMaterial.dispose();

    for (const ring of this.rippleRingMeshes) {
      ring.geometry.dispose();
      ring.material.dispose();
    }
    this.rippleRingMeshes.length = 0;
  }
}
