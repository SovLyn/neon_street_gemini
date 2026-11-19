import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import type {
  AtmosphereState,
  BlockLayout,
  EasterEggState,
  NeonWorldBridge,
} from '../types/sim';
import type { ThemeDefinition } from '../config/themes';
import { SkyAtmosphere } from './builders/SkyAtmosphere';
import { BlockBuilder } from './builders/BlockBuilder';
import { WaterSystem } from './builders/WaterSystem';
import { DynamicActors } from './builders/DynamicActors';

export interface SceneCallbacks {
  onSignClick: (signId: number) => void;
  onStreetlightClick: (lightId: number) => void;
  onWaterClick: (x: number, z: number) => void;
  onUserCameraInteract?: () => void;
}

const PostFxExtraShader = {
  name: 'PostFxExtraShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uAberration: { value: 0.0022 },
    uGrain: { value: 0.038 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uGrain;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 dir = (uv - 0.5) * uAberration;
      float r = texture2D(tDiffuse, uv + dir).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir).b;
      vec3 col = vec3(r, g, b);

      float noise = (hash(uv * uResolution + fract(uTime * 23.0) * 100.0) - 0.5) * uGrain;
      col += noise;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class NeonScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;

  // Postprocessing
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly extraFxPass: ShaderPass;
  private readonly outputPass: OutputPass;

  // Builders
  private skyAtmosphere: SkyAtmosphere;
  private blockBuilder: BlockBuilder;
  private waterSystem: WaterSystem;
  private dynamicActors: DynamicActors;

  private theme: ThemeDefinition;
  private callbacks: SceneCallbacks;
  private autoOrbit: boolean;
  private customSignText: string;

  // Pointer Interaction
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouseNdc = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private isPointerDown = false;
  private isDragging = false;
  private lastHoverCheckTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    layout: BlockLayout,
    theme: ThemeDefinition,
    callbacks: SceneCallbacks,
    initialOptions: {
      postFxExtra?: boolean;
      autoOrbit?: boolean;
      customSignText?: string;
    } = {}
  ) {
    this.canvas = canvas;
    this.theme = theme;
    this.callbacks = callbacks;
    this.autoOrbit = initialOptions.autoOrbit ?? false;
    this.customSignText = initialOptions.customSignText ?? '';

    // 1. Scene setup
    this.scene = new THREE.Scene();

    // 2. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);

    // 3. Camera setup: 46 deg fov, hero position (-21, 9.2, 20.5)
    this.camera = new THREE.PerspectiveCamera(
      46,
      width / Math.max(1, height),
      0.2,
      320
    );
    this.camera.position.set(-21, 9.2, 20.5);

    // 4. OrbitControls: target (0.5, 4.0, -1.5), damping
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 58;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.target.set(0.5, 4.0, -1.5);
    this.controls.autoRotate = this.autoOrbit;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.update();

    // Stop auto-orbit when user begins camera interaction
    this.controls.addEventListener('start', this.handleControlsStart);

    // 5. Postprocessing: Composer + RenderPass + UnrealBloomPass + ShaderPass + OutputPass
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.72,
      0.45,
      0.62
    );
    this.composer.addPass(this.bloomPass);

    this.extraFxPass = new ShaderPass(PostFxExtraShader);
    this.extraFxPass.enabled = initialOptions.postFxExtra ?? true;
    if (this.extraFxPass.uniforms.uResolution) {
      this.extraFxPass.uniforms.uResolution.value.set(width, height);
    }
    this.composer.addPass(this.extraFxPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // 6. Subsystem Builders
    this.skyAtmosphere = new SkyAtmosphere(this.scene);

    this.blockBuilder = new BlockBuilder(
      layout,
      this.theme,
      this.customSignText
    );
    this.scene.add(this.blockBuilder.group);

    this.waterSystem = new WaterSystem(layout.puddles, this.theme);
    this.scene.add(this.waterSystem.group);

    this.dynamicActors = new DynamicActors(this.theme);
    this.scene.add(this.dynamicActors.group);

    // 7. Event listeners
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('resize', this.resize);
  }

  private handleControlsStart = (): void => {
    if (this.autoOrbit) {
      this.autoOrbit = false;
      this.controls.autoRotate = false;
      this.callbacks.onUserCameraInteract?.();
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    this.isPointerDown = true;
    this.isDragging = false;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.isPointerDown) {
      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );
      if (dist >= 6) {
        this.isDragging = true;
        if (this.autoOrbit) {
          this.autoOrbit = false;
          this.controls.autoRotate = false;
          this.callbacks.onUserCameraInteract?.();
        }
      }
    }

    // Lightly throttled cursor hover check (~20fps)
    const now = performance.now();
    if (now - this.lastHoverCheckTime > 50) {
      this.lastHoverCheckTime = now;
      const rect = this.canvas.getBoundingClientRect();
      this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseNdc.y = -((e.clientY - rect.top) / heightOr1(rect.height)) * 2 + 1;

      this.raycaster.setFromCamera(this.mouseNdc, this.camera);
      const hits = this.raycaster.intersectObjects(
        this.getCombinedClickables(),
        true
      );
      this.canvas.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );

    if (dist < 6 && !this.isDragging) {
      const rect = this.canvas.getBoundingClientRect();
      // Ensure click was within canvas bounds
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        this.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseNdc.y =
          -((e.clientY - rect.top) / heightOr1(rect.height)) * 2 + 1;

        this.raycaster.setFromCamera(this.mouseNdc, this.camera);
        const hits = this.raycaster.intersectObjects(
          this.getCombinedClickables(),
          true
        );

        if (hits.length > 0) {
          const hit = hits[0];
          let obj: THREE.Object3D | null = hit.object;
          let interactType: string | undefined;
          let interactId: number | undefined;

          while (obj) {
            if (obj.userData && obj.userData.interactType) {
              interactType = obj.userData.interactType;
              interactId = obj.userData.interactId;
              break;
            }
            obj = obj.parent;
          }

          if (interactType === 'sign' && typeof interactId === 'number') {
            this.callbacks.onSignClick(interactId);
          } else if (
            interactType === 'streetlight' &&
            typeof interactId === 'number'
          ) {
            this.callbacks.onStreetlightClick(interactId);
          } else if (interactType === 'water') {
            this.callbacks.onWaterClick(hit.point.x, hit.point.z);
          }
        }
      }
    }
  };

  private getCombinedClickables(): THREE.Object3D[] {
    return [
      ...this.blockBuilder.getClickableObjects(),
      ...this.waterSystem.getClickableObjects(),
    ];
  }

  public rebuildBlock(layout: BlockLayout, customSignText: string): void {
    this.customSignText = customSignText;

    // Remove & dispose old block and water
    this.scene.remove(this.blockBuilder.group);
    this.blockBuilder.dispose();

    this.scene.remove(this.waterSystem.group);
    this.waterSystem.dispose();

    // Create fresh builders
    this.blockBuilder = new BlockBuilder(
      layout,
      this.theme,
      this.customSignText
    );
    this.scene.add(this.blockBuilder.group);

    this.waterSystem = new WaterSystem(layout.puddles, this.theme);
    this.scene.add(this.waterSystem.group);
  }

  public setTheme(theme: ThemeDefinition): void {
    this.theme = theme;
    this.blockBuilder.updateTheme(theme);
    this.waterSystem.updateTheme(theme);
    this.dynamicActors.updateTheme(theme);
  }

  public setCustomSignText(text: string): void {
    this.customSignText = text;
    this.blockBuilder.updateCustomSignText(text);
  }

  public setPostFxExtra(enabled: boolean): void {
    this.extraFxPass.enabled = enabled;
  }

  public setAutoOrbit(enabled: boolean): void {
    this.autoOrbit = enabled;
    this.controls.autoRotate = enabled;
  }

  public updateFrame(
    bridge: NeonWorldBridge,
    dt: number
  ): { atmosphere: AtmosphereState; easterEgg: EasterEggState } {
    const atmosphere = bridge.getAtmosphere();
    const easterEgg = bridge.getEasterEgg();

    const cars = bridge.getCarsBuffer();
    const trails = bridge.getTrailsBuffer();
    const trafficLights = bridge.getTrafficLightsBuffer();
    const pedestrians = bridge.getPedestriansBuffer();
    const particles = bridge.getParticlesBuffer();
    const ripples = bridge.getRipplesBuffer();
    const signStates = bridge.getSignStatesBuffer();
    const streetlightStates = bridge.getStreetlightStatesBuffer();
    const wavePhase = bridge.getWaterWavePhase();

    const elapsed = atmosphere.elapsedSec;

    // 1. Update Sky & Atmosphere
    this.skyAtmosphere.update(atmosphere, this.theme, elapsed);

    // 2. Update Block Geometry (windows, signs, streetlights)
    this.blockBuilder.updateFrame(
      atmosphere,
      signStates,
      streetlightStates,
      elapsed
    );

    // 3. Update Water & Puddle reflections
    this.waterSystem.updateFrame(atmosphere, ripples, wavePhase);

    // 4. Update Dynamic Actors (cars, trails, pedestrians, weather particles, easter eggs)
    this.dynamicActors.updateFrame(
      atmosphere,
      cars,
      trails,
      trafficLights,
      pedestrians,
      particles,
      easterEgg,
      elapsed
    );

    // 5. Modulate UnrealBloomPass dynamically
    const syncSurge = this.dynamicActors.getNeonSyncIntensity();
    this.bloomPass.strength =
      0.72 + 0.16 * (1.0 - atmosphere.daylight) + syncSurge * 0.48;
    this.bloomPass.threshold = THREE.MathUtils.clamp(
      0.62 - syncSurge * 0.15,
      0.35,
      0.75
    );

    // 6. Extra Post-fx shader time update
    if (this.extraFxPass.enabled && this.extraFxPass.uniforms.uTime) {
      this.extraFxPass.uniforms.uTime.value = elapsed;
    }

    // 7. Update OrbitControls
    this.controls.update();

    // 8. Render full postprocessing pipeline
    this.composer.render();

    return { atmosphere, easterEgg };
  }

  public exportPng(seed: number): string {
    this.composer.render();
    const dataUrl = this.canvas.toDataURL('image/png');

    const downloadLink = document.createElement('a');
    downloadLink.href = dataUrl;
    downloadLink.download = `neon-street-${seed}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    return dataUrl;
  }

  public getScreenPointForInteraction(
    target: 'sign' | 'streetlight' | 'water'
  ): { x: number; y: number; id: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Viewport bounds avoiding right HUD dock [40, width-340] and top/bottom [60, height-60]
    const minX = 40;
    const maxX = Math.max(minX + 50, width - 340);
    const minY = 60;
    const maxY = Math.max(minY + 50, height - 60);

    const checkPointHits = (
      screenX: number,
      screenY: number,
      expectedType: 'sign' | 'streetlight' | 'water',
      expectedId?: number
    ): boolean => {
      if (screenX < minX || screenX > maxX || screenY < minY || screenY > maxY) {
        return false;
      }
      const ndcX = ((screenX - rect.left) / width) * 2 - 1;
      const ndcY = -((screenY - rect.top) / heightOr1(height)) * 2 + 1;

      this.mouseNdc.set(ndcX, ndcY);
      this.raycaster.setFromCamera(this.mouseNdc, this.camera);
      const hits = this.raycaster.intersectObjects(
        this.getCombinedClickables(),
        true
      );
      if (hits.length === 0) return false;

      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj.userData && obj.userData.interactType) {
          if (obj.userData.interactType !== expectedType) return false;
          if (expectedId !== undefined && expectedType !== 'water') {
            return obj.userData.interactId === expectedId;
          }
          return true;
        }
        obj = obj.parent;
      }
      return false;
    };

    const projectToScreen = (
      pos: THREE.Vector3
    ): { x: number; y: number } | null => {
      const p = pos.clone().project(this.camera);
      if (p.z >= 1.0) return null; // Behind camera
      const sx = ((p.x + 1) * 0.5) * width + rect.left;
      const sy = ((-p.y + 1) * 0.5) * height + rect.top;
      return { x: sx, y: sy };
    };

    if (target === 'sign') {
      const signIds = this.blockBuilder.getSignIds();
      // Test each sign
      for (const id of signIds) {
        const worldPos = this.blockBuilder.getSignWorldPosition(id);
        if (!worldPos) continue;
        const screen = projectToScreen(worldPos);
        if (screen && checkPointHits(screen.x, screen.y, 'sign', id)) {
          return {
            x: Math.round(screen.x),
            y: Math.round(screen.y),
            id,
          };
        }
      }

      // Fallback: search with slight offsets if exact center had minor occlusion
      for (const id of signIds) {
        const worldPos = this.blockBuilder.getSignWorldPosition(id);
        if (!worldPos) continue;
        const screen = projectToScreen(worldPos);
        if (
          screen &&
          screen.x >= minX &&
          screen.x <= maxX &&
          screen.y >= minY &&
          screen.y <= maxY
        ) {
          for (const ox of [-8, 0, 8]) {
            for (const oy of [-8, 0, 8]) {
              if (checkPointHits(screen.x + ox, screen.y + oy, 'sign', id)) {
                return {
                  x: Math.round(screen.x + ox),
                  y: Math.round(screen.y + oy),
                  id,
                };
              }
            }
          }
        }
      }
    } else if (target === 'streetlight') {
      const lightIds = this.blockBuilder.getStreetlightIds();
      for (const id of lightIds) {
        const worldPos = this.blockBuilder.getStreetlightWorldPosition(id);
        if (!worldPos) continue;
        const screen = projectToScreen(worldPos);
        if (screen && checkPointHits(screen.x, screen.y, 'streetlight', id)) {
          return {
            x: Math.round(screen.x),
            y: Math.round(screen.y),
            id,
          };
        }
      }

      // Fallback with slight offsets
      for (const id of lightIds) {
        const worldPos = this.blockBuilder.getStreetlightWorldPosition(id);
        if (!worldPos) continue;
        const screen = projectToScreen(worldPos);
        if (
          screen &&
          screen.x >= minX &&
          screen.x <= maxX &&
          screen.y >= minY &&
          screen.y <= maxY
        ) {
          for (const ox of [-10, 0, 10]) {
            for (const oy of [-10, 0, 10]) {
              if (
                checkPointHits(screen.x + ox, screen.y + oy, 'streetlight', id)
              ) {
                return {
                  x: Math.round(screen.x + ox),
                  y: Math.round(screen.y + oy),
                  id,
                };
              }
            }
          }
        }
      }
    } else if (target === 'water') {
      const canalWorld = this.waterSystem.getCanalWorldPoint();
      const offsets = [
        [0, 0],
        [0, -1],
        [2, -1],
        [-2, -1],
        [-10, 0],
        [10, 0],
        [0, 2],
        [-15, 2],
        [15, 2],
      ];
      for (const [ox, oz] of offsets) {
        const pt = canalWorld.clone().add(new THREE.Vector3(ox, 0, oz));
        const screen = projectToScreen(pt);
        if (screen && checkPointHits(screen.x, screen.y, 'water', 0)) {
          return {
            x: Math.round(screen.x),
            y: Math.round(screen.y),
            id: 0,
          };
        }
      }

      // Fallback: check visible wet street puddles
      for (const obj of this.waterSystem.getClickableObjects()) {
        if (obj.userData && obj.userData.interactType === 'water') {
          const worldPos = obj.position.clone();
          const screen = projectToScreen(worldPos);
          if (screen && checkPointHits(screen.x, screen.y, 'water', obj.userData.interactId)) {
            return {
              x: Math.round(screen.x),
              y: Math.round(screen.y),
              id: obj.userData.interactId ?? 0,
            };
          }
        }
      }
    }

    return null;
  }

  public resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.camera.aspect = width / heightOr1(height);
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    if (this.extraFxPass.uniforms.uResolution) {
      this.extraFxPass.uniforms.uResolution.value.set(width, height);
    }
  };

  public dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);

    this.controls.removeEventListener('start', this.handleControlsStart);
    this.controls.dispose();

    this.skyAtmosphere.dispose();
    this.blockBuilder.dispose();
    this.waterSystem.dispose();
    this.dynamicActors.dispose();

    this.bloomPass.dispose();
    this.extraFxPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

function heightOr1(h: number): number {
  return Math.max(1, h);
}
