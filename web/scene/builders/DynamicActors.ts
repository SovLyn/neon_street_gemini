import * as THREE from 'three';
import {
  BLOCK_HALF_LENGTH,
  CAR_STRIDE,
  PARTICLE_STRIDE,
  PEDESTRIAN_STRIDE,
  TRAFFIC_LIGHT_STRIDE,
  TRAIL_STRIDE,
  type AtmosphereState,
  type EasterEggState,
} from '../../types/sim';
import type { ThemeDefinition } from '../../config/themes';

const MAX_CARS = 16;
const MAX_TRAIL_SEGMENTS = 64;
const MAX_TRAFFIC_LIGHTS = 2;
const MAX_PEDESTRIANS = 28;
const MAX_RAIN_PARTICLES = 800;
const MAX_SNOW_PARTICLES = 600;

interface CarVisualSlot {
  root: THREE.Group;
  chassisMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  cabinMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  headlightMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  taillightMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  underglowMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

interface TrafficLightVisualSlot {
  root: THREE.Group;
  postMesh: THREE.Mesh;
  housingMesh: THREE.Mesh;
  redLens: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  yellowLens: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  greenLens: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
}

interface PedestrianVisualSlot {
  root: THREE.Group;
  coatMesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  headMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  umbrellaGroup: THREE.Group;
  umbrellaDome: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  umbrellaRim: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

interface InternalParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  kind: 0 | 1;
}

export class DynamicActors {
  public readonly group = new THREE.Group();

  private theme: ThemeDefinition;
  private neonSyncIntensity = 0;

  // Visual Entity Pools
  private readonly carSlots: CarVisualSlot[] = [];
  private readonly trafficLightSlots: TrafficLightVisualSlot[] = [];
  private readonly pedestrianSlots: PedestrianVisualSlot[] = [];

  // Taillight trails mesh & buffers
  private readonly trailGeometry: THREE.BufferGeometry;
  private readonly trailPosAttr: THREE.BufferAttribute;
  private readonly trailColAttr: THREE.BufferAttribute;
  private readonly trailMesh: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;

  // Weather particles InstancedMeshes
  private readonly rainInstancedMesh: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly snowInstancedMesh: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly fallbackParticles: InternalParticle[] = [];

  // Easter Eggs
  private readonly easterEggGroup = new THREE.Group();
  private readonly ufoGroup = new THREE.Group();
  private readonly ufoSaucerMesh: THREE.Mesh;
  private readonly ufoBulbsGroup = new THREE.Group();
  private readonly ufoBulbMeshes: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private readonly ufoTractorBeamMesh: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;

  private readonly catGroup = new THREE.Group();
  private readonly catBodyMesh: THREE.Mesh;
  private readonly catHeadMesh: THREE.Mesh;
  private readonly catLeftEar: THREE.Mesh;
  private readonly catRightEar: THREE.Mesh;
  private readonly catTailMesh: THREE.Mesh;
  private readonly catLeftEye: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly catRightEye: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;

  // Scratch memory for zero per-frame allocation
  private readonly dummyObject = new THREE.Object3D();
  private readonly dummyMatrix = new THREE.Matrix4();
  private readonly scratchColor = new THREE.Color();
  private readonly scratchColorAlt = new THREE.Color();

  constructor(theme: ThemeDefinition) {
    this.theme = theme;

    // ------------------------------------------------------------------------
    // 1. Cars Pool (16 low-poly cyberpunk wedge cars)
    // ------------------------------------------------------------------------
    const carsGroup = new THREE.Group();
    carsGroup.name = 'cars_pool';
    this.group.add(carsGroup);

    const chassisGeo = new THREE.BoxGeometry(4.2, 0.42, 1.84);
    const cabinGeo = new THREE.BoxGeometry(2.3, 0.36, 1.48);
    const headGeo = new THREE.BoxGeometry(0.12, 0.08, 1.56);
    const tailGeo = new THREE.BoxGeometry(0.12, 0.08, 1.56);
    const glowGeo = new THREE.PlaneGeometry(3.8, 1.8);
    glowGeo.rotateX(-Math.PI * 0.5);

    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10);
    wheelGeo.rotateZ(Math.PI * 0.5);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.8,
      metalness: 0.2,
    });

    for (let i = 0; i < MAX_CARS; i++) {
      const root = new THREE.Group();
      root.visible = false;

      const chassisMat = new THREE.MeshStandardMaterial({
        color: 0x0f1219,
        roughness: 0.25,
        metalness: 0.85,
      });
      const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
      chassisMesh.position.y = 0.24;
      chassisMesh.castShadow = false;
      root.add(chassisMesh);

      const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x06090f,
        roughness: 0.1,
        metalness: 0.95,
      });
      const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
      cabinMesh.position.set(-0.35, 0.54, 0);
      root.add(cabinMesh);

      // 4 Wheels
      for (const [wx, wz] of [
        [1.3, 0.95],
        [1.3, -0.95],
        [-1.3, 0.95],
        [-1.3, -0.95],
      ]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(wx, 0.2, wz);
        root.add(wheel);
      }

      // Emissive white front headlight bar
      const headlightMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        toneMapped: false,
      });
      const headlightMesh = new THREE.Mesh(headGeo, headlightMat);
      headlightMesh.position.set(2.05, 0.25, 0);
      root.add(headlightMesh);

      // Emissive red rear brake tailbar
      const taillightMat = new THREE.MeshBasicMaterial({
        color: 0xff1e38,
        toneMapped: false,
      });
      const taillightMesh = new THREE.Mesh(tailGeo, taillightMat);
      taillightMesh.position.set(-2.05, 0.28, 0);
      root.add(taillightMesh);

      // Underglow neon plane
      const underglowMat = new THREE.MeshBasicMaterial({
        color: theme.scene.neon[i % 3],
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const underglowMesh = new THREE.Mesh(glowGeo, underglowMat);
      underglowMesh.position.y = 0.04;
      root.add(underglowMesh);

      carsGroup.add(root);
      this.carSlots.push({
        root,
        chassisMesh,
        cabinMesh,
        headlightMesh,
        taillightMesh,
        underglowMesh,
      });
    }

    // ------------------------------------------------------------------------
    // 2. Taillight Trails Ribbon Mesh (Up to 64 segments)
    // ------------------------------------------------------------------------
    this.trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(MAX_TRAIL_SEGMENTS * 6 * 3);
    const trailColors = new Float32Array(MAX_TRAIL_SEGMENTS * 6 * 3);

    this.trailPosAttr = new THREE.BufferAttribute(trailPositions, 3);
    this.trailPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.trailColAttr = new THREE.BufferAttribute(trailColors, 3);
    this.trailColAttr.setUsage(THREE.DynamicDrawUsage);

    this.trailGeometry.setAttribute('position', this.trailPosAttr);
    this.trailGeometry.setAttribute('color', this.trailColAttr);
    this.trailGeometry.setDrawRange(0, 0);

    const trailMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.trailMesh = new THREE.Mesh(this.trailGeometry, trailMaterial);
    this.trailMesh.frustumCulled = false;
    this.group.add(this.trailMesh);

    // ------------------------------------------------------------------------
    // 3. Traffic Lights Gantries (2 intersection gantries)
    // ------------------------------------------------------------------------
    const lightsGroup = new THREE.Group();
    lightsGroup.name = 'traffic_lights';
    this.group.add(lightsGroup);

    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 5.4, 8);
    const armGeo = new THREE.BoxGeometry(3.6, 0.16, 0.16);
    const boxGeo = new THREE.BoxGeometry(0.36, 1.1, 0.42);
    const lensGeo = new THREE.SphereGeometry(0.1, 10, 8);

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      roughness: 0.45,
      metalness: 0.8,
    });

    for (let i = 0; i < MAX_TRAFFIC_LIGHTS; i++) {
      const root = new THREE.Group();

      const postMesh = new THREE.Mesh(poleGeo, metalMat);
      postMesh.position.y = 2.7;
      root.add(postMesh);

      const armMesh = new THREE.Mesh(armGeo, metalMat);
      armMesh.position.set(0, 5.1, 1.6);
      root.add(armMesh);

      const housingMesh = new THREE.Mesh(boxGeo, metalMat);
      housingMesh.position.set(0, 4.7, 3.2);
      root.add(housingMesh);

      const redMat = new THREE.MeshBasicMaterial({
        color: 0x220505,
        toneMapped: false,
      });
      const yellowMat = new THREE.MeshBasicMaterial({
        color: 0x221800,
        toneMapped: false,
      });
      const greenMat = new THREE.MeshBasicMaterial({
        color: 0x052210,
        toneMapped: false,
      });

      const redLens = new THREE.Mesh(lensGeo, redMat);
      redLens.position.set(0.19, 5.05, 3.2);
      root.add(redLens);

      const yellowLens = new THREE.Mesh(lensGeo, yellowMat);
      yellowLens.position.set(0.19, 4.7, 3.2);
      root.add(yellowLens);

      const greenLens = new THREE.Mesh(lensGeo, greenMat);
      greenLens.position.set(0.19, 4.35, 3.2);
      root.add(greenLens);

      lightsGroup.add(root);
      this.trafficLightSlots.push({
        root,
        postMesh,
        housingMesh,
        redLens,
        yellowLens,
        greenLens,
      });
    }

    // ------------------------------------------------------------------------
    // 4. Pedestrians Pool (28 stylized dark silhouettes)
    // ------------------------------------------------------------------------
    const pedGroup = new THREE.Group();
    pedGroup.name = 'pedestrians_pool';
    this.group.add(pedGroup);

    const coatGeo = new THREE.CylinderGeometry(0.14, 0.28, 1.05, 8);
    const headGeoPed = new THREE.SphereGeometry(0.13, 10, 8);
    const domeGeo = new THREE.SphereGeometry(
      0.62,
      14,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.46
    );
    const rimGeo = new THREE.TorusGeometry(0.62, 0.022, 6, 24);
    rimGeo.rotateX(Math.PI * 0.5);

    for (let i = 0; i < MAX_PEDESTRIANS; i++) {
      const root = new THREE.Group();
      root.visible = false;

      const coatMat = new THREE.MeshStandardMaterial({
        color: 0x090c12,
        roughness: 0.75,
        metalness: 0.15,
      });
      const coatMesh = new THREE.Mesh(coatGeo, coatMat);
      coatMesh.position.y = 0.54;
      root.add(coatMesh);

      const headMat = new THREE.MeshStandardMaterial({
        color: 0x0b0e16,
        roughness: 0.6,
        metalness: 0.2,
      });
      const headMesh = new THREE.Mesh(headGeoPed, headMat);
      headMesh.position.y = 1.2;
      root.add(headMesh);

      // Umbrella
      const umbrellaGroup = new THREE.Group();
      umbrellaGroup.position.y = 1.35;

      const domeMat = new THREE.MeshStandardMaterial({
        color: 0x141e2c,
        roughness: 0.2,
        metalness: 0.25,
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
      });
      const umbrellaDome = new THREE.Mesh(domeGeo, domeMat);
      umbrellaGroup.add(umbrellaDome);

      const rimMat = new THREE.MeshBasicMaterial({
        color: theme.scene.neon[i % 3],
        toneMapped: false,
      });
      const umbrellaRim = new THREE.Mesh(rimGeo, rimMat);
      umbrellaRim.position.y = 0.01;
      umbrellaGroup.add(umbrellaRim);

      root.add(umbrellaGroup);
      pedGroup.add(root);

      this.pedestrianSlots.push({
        root,
        coatMesh,
        headMesh,
        umbrellaGroup,
        umbrellaDome,
        umbrellaRim,
      });
    }

    // ------------------------------------------------------------------------
    // 5. Weather Particles (Rain & Snow InstancedMesh Pools)
    // ------------------------------------------------------------------------
    const particlesGroup = new THREE.Group();
    particlesGroup.name = 'weather_particles';
    this.group.add(particlesGroup);

    const rainGeo = new THREE.BoxGeometry(0.025, 0.75, 0.025);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0x98d4f8,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.rainInstancedMesh = new THREE.InstancedMesh(
      rainGeo,
      rainMat,
      MAX_RAIN_PARTICLES
    );
    this.rainInstancedMesh.count = 0;
    this.rainInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    particlesGroup.add(this.rainInstancedMesh);

    const snowGeo = new THREE.OctahedronGeometry(0.065, 0);
    const snowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    this.snowInstancedMesh = new THREE.InstancedMesh(
      snowGeo,
      snowMat,
      MAX_SNOW_PARTICLES
    );
    this.snowInstancedMesh.count = 0;
    this.snowInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    particlesGroup.add(this.snowInstancedMesh);

    // Seed fallback particles pool
    for (let i = 0; i < MAX_RAIN_PARTICLES; i++) {
      this.fallbackParticles.push({
        x: (Math.random() - 0.5) * BLOCK_HALF_LENGTH * 2.1,
        y: Math.random() * 26.0,
        z: (Math.random() - 0.5) * 36.0,
        vx: 0,
        vy: -26.0 - Math.random() * 12.0,
        kind: i < MAX_SNOW_PARTICLES ? 1 : 0,
      });
    }

    // ------------------------------------------------------------------------
    // 6. Easter Eggs (UFO & Black Alley Cat)
    // ------------------------------------------------------------------------
    this.easterEggGroup.name = 'easter_eggs';
    this.group.add(this.easterEggGroup);

    // UFO: Saucer + 8 ring bulbs + translucent tractor beam
    this.ufoGroup.visible = false;
    const saucerGeo = new THREE.CylinderGeometry(0.8, 2.4, 0.55, 20);
    const saucerMat = new THREE.MeshStandardMaterial({
      color: 0x1a2130,
      metalness: 0.95,
      roughness: 0.15,
    });
    this.ufoSaucerMesh = new THREE.Mesh(saucerGeo, saucerMat);
    this.ufoGroup.add(this.ufoSaucerMesh);

    const ufoBulbGeo = new THREE.SphereGeometry(0.11, 8, 8);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bulbMat = new THREE.MeshBasicMaterial({
        color: theme.scene.neon[i % 3],
        toneMapped: false,
      });
      const bulb = new THREE.Mesh(ufoBulbGeo, bulbMat);
      bulb.position.set(Math.cos(angle) * 2.2, -0.05, Math.sin(angle) * 2.2);
      this.ufoBulbMeshes.push(bulb);
      this.ufoBulbsGroup.add(bulb);
    }
    this.ufoGroup.add(this.ufoBulbsGroup);

    const beamGeo = new THREE.CylinderGeometry(0.35, 3.4, 14.0, 18, 1, true);
    beamGeo.translate(0, -7.0, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: theme.scene.neon[0],
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.ufoTractorBeamMesh = new THREE.Mesh(beamGeo, beamMat);
    this.ufoGroup.add(this.ufoTractorBeamMesh);
    this.easterEggGroup.add(this.ufoGroup);

    // Cat: Black alley cat silhouette with glowing eyes
    this.catGroup.visible = false;
    const catBodyGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.52, 8);
    catBodyGeo.rotateZ(Math.PI * 0.5);
    const catMat = new THREE.MeshStandardMaterial({
      color: 0x07080c,
      roughness: 0.8,
      metalness: 0.1,
    });
    this.catBodyMesh = new THREE.Mesh(catBodyGeo, catMat);
    this.catBodyMesh.position.y = 0.22;
    this.catGroup.add(this.catBodyMesh);

    const catHeadGeo = new THREE.SphereGeometry(0.12, 10, 8);
    this.catHeadMesh = new THREE.Mesh(catHeadGeo, catMat);
    this.catHeadMesh.position.set(0.32, 0.32, 0);
    this.catGroup.add(this.catHeadMesh);

    const earGeo = new THREE.ConeGeometry(0.05, 0.1, 4);
    this.catLeftEar = new THREE.Mesh(earGeo, catMat);
    this.catLeftEar.position.set(0.32, 0.44, 0.06);
    this.catLeftEar.rotation.x = 0.2;
    this.catGroup.add(this.catLeftEar);

    this.catRightEar = new THREE.Mesh(earGeo, catMat);
    this.catRightEar.position.set(0.32, 0.44, -0.06);
    this.catRightEar.rotation.x = -0.2;
    this.catGroup.add(this.catRightEar);

    const catTailGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6);
    catTailGeo.rotateZ(0.65);
    this.catTailMesh = new THREE.Mesh(catTailGeo, catMat);
    this.catTailMesh.position.set(-0.35, 0.36, 0);
    this.catGroup.add(this.catTailMesh);

    const eyeGeo = new THREE.SphereGeometry(0.024, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      toneMapped: false,
    });
    this.catLeftEye = new THREE.Mesh(eyeGeo, eyeMat);
    this.catLeftEye.position.set(0.42, 0.33, 0.045);
    this.catGroup.add(this.catLeftEye);

    this.catRightEye = new THREE.Mesh(eyeGeo, eyeMat);
    this.catRightEye.position.set(0.42, 0.33, -0.045);
    this.catGroup.add(this.catRightEye);

    this.easterEggGroup.add(this.catGroup);
  }

  public updateTheme(theme: ThemeDefinition): void {
    this.theme = theme;

    // Update car underglows
    for (let i = 0; i < this.carSlots.length; i++) {
      this.carSlots[i].underglowMesh.material.color.set(
        theme.scene.neon[i % 3]
      );
    }

    // Update umbrella rims
    for (let i = 0; i < this.pedestrianSlots.length; i++) {
      this.pedestrianSlots[i].umbrellaRim.material.color.set(
        theme.scene.neon[i % 3]
      );
    }

    // Update UFO bulbs & tractor beam
    for (let i = 0; i < this.ufoBulbMeshes.length; i++) {
      this.ufoBulbMeshes[i].material.color.set(theme.scene.neon[i % 3]);
    }
    this.ufoTractorBeamMesh.material.color.set(theme.scene.neon[0]);

    // Update cat eyes to accent neon
    this.catLeftEye.material.color.set(theme.scene.neon[0]);
    this.catRightEye.material.color.set(theme.scene.neon[0]);
  }

  public getNeonSyncIntensity(): number {
    return this.neonSyncIntensity;
  }

  public updateFrame(
    atmosphere: AtmosphereState,
    cars: Float32Array,
    trails: Float32Array,
    trafficLights: Float32Array,
    pedestrians: Float32Array,
    particles: Float32Array,
    easterEgg: EasterEggState,
    elapsedSec: number
  ): void {
    // ------------------------------------------------------------------------
    // 1. Cars (CAR_STRIDE = 10)
    // ------------------------------------------------------------------------
    const carCount = Math.min(
      MAX_CARS,
      Math.floor(cars.length / CAR_STRIDE)
    );

    for (let i = 0; i < MAX_CARS; i++) {
      const slot = this.carSlots[i];
      if (i < carCount) {
        const offset = i * CAR_STRIDE;
        const x = cars[offset];
        const y = cars[offset + 1];
        const z = cars[offset + 2];
        const yaw = cars[offset + 3];
        const colorSlot = Math.round(cars[offset + 6]) % 3;
        const brakeIntensity = cars[offset + 7];
        const active = cars[offset + 8];

        if (active > 0.5) {
          slot.root.visible = true;
          slot.root.position.set(x, y + 0.02, z);
          slot.root.rotation.y = yaw;

          // Headlight dimming with daylight
          const headPower = 0.5 + 0.9 * (1.0 - atmosphere.daylight);
          slot.headlightMesh.material.color.setScalar(headPower);

          // Taillight glow modulated by braking
          const brakeScalar = 0.35 + 1.65 * brakeIntensity;
          slot.taillightMesh.material.color
            .set(0xff1e38)
            .multiplyScalar(brakeScalar);

          // Underglow accent
          slot.underglowMesh.material.color.set(
            this.theme.scene.neon[colorSlot]
          );
        } else {
          slot.root.visible = false;
        }
      } else {
        slot.root.visible = false;
      }
    }

    // ------------------------------------------------------------------------
    // 2. Taillight Trails (TRAIL_STRIDE = 8)
    // ------------------------------------------------------------------------
    const segCount = Math.min(
      MAX_TRAIL_SEGMENTS,
      Math.floor(trails.length / TRAIL_STRIDE)
    );
    const posArr = this.trailPosAttr.array as Float32Array;
    const colArr = this.trailColAttr.array as Float32Array;

    let vIdx = 0;
    const halfH = 0.065;

    for (let s = 0; s < segCount; s++) {
      const offset = s * TRAIL_STRIDE;
      const x0 = trails[offset];
      const y0 = trails[offset + 1];
      const z0 = trails[offset + 2];
      const x1 = trails[offset + 3];
      const y1 = trails[offset + 4];
      const z1 = trails[offset + 5];
      const intensity = trails[offset + 6];
      const colorSlot = Math.round(trails[offset + 7]) % 3;

      this.scratchColor
        .set(0xff1e38)
        .lerp(this.scratchColorAlt.set(this.theme.scene.neon[colorSlot]), 0.28)
        .multiplyScalar(intensity * 1.35);

      const r = this.scratchColor.r;
      const g = this.scratchColor.g;
      const b = this.scratchColor.b;

      // Triangle 1: (v0, v1, v2)
      posArr[vIdx * 3] = x0;
      posArr[vIdx * 3 + 1] = y0 - halfH;
      posArr[vIdx * 3 + 2] = z0;
      colArr[vIdx * 3] = r;
      colArr[vIdx * 3 + 1] = g;
      colArr[vIdx * 3 + 2] = b;
      vIdx++;

      posArr[vIdx * 3] = x0;
      posArr[vIdx * 3 + 1] = y0 + halfH;
      posArr[vIdx * 3 + 2] = z0;
      colArr[vIdx * 3] = r;
      colArr[vIdx * 3 + 1] = g;
      colArr[vIdx * 3 + 2] = b;
      vIdx++;

      posArr[vIdx * 3] = x1;
      posArr[vIdx * 3 + 1] = y1 - halfH;
      posArr[vIdx * 3 + 2] = z1;
      colArr[vIdx * 3] = r;
      colArr[vIdx * 3 + 1] = g;
      colArr[vIdx * 3 + 2] = b;
      vIdx++;

      // Triangle 2: (v2, v1, v3)
      posArr[vIdx * 3] = x1;
      posArr[vIdx * 3 + 1] = y1 - halfH;
      posArr[vIdx * 3 + 2] = z1;
      colArr[vIdx * 3] = r;
      colArr[vIdx * 3 + 1] = g;
      colArr[vIdx * 3 + 2] = b;
      vIdx++;

      posArr[vIdx * 3] = x0;
      posArr[vIdx * 3 + 1] = y0 + halfH;
      posArr[vIdx * 3 + 2] = z0;
      colArr[vIdx * 3] = r;
      colArr[vIdx * 3 + 1] = g;
      colArr[vIdx * 3 + 2] = b;
      vIdx++;

      posArr[vIdx * 3] = x1;
      posArr[vIdx * 3 + 1] = y1 + halfH;
      posArr[vIdx * 3 + 2] = z1;
      colArr[vIdx * 3] = r;
      colArr[vIdx * 3 + 1] = g;
      colArr[vIdx * 3 + 2] = b;
      vIdx++;
    }

    this.trailGeometry.setDrawRange(0, segCount * 6);
    if (segCount > 0) {
      this.trailPosAttr.needsUpdate = true;
      this.trailColAttr.needsUpdate = true;
    }

    // ------------------------------------------------------------------------
    // 3. Traffic Lights (TRAFFIC_LIGHT_STRIDE = 4)
    // ------------------------------------------------------------------------
    const lightCount = Math.min(
      MAX_TRAFFIC_LIGHTS,
      Math.floor(trafficLights.length / TRAFFIC_LIGHT_STRIDE)
    );

    for (let i = 0; i < MAX_TRAFFIC_LIGHTS; i++) {
      const slot = this.trafficLightSlots[i];
      if (i < lightCount) {
        const offset = i * TRAFFIC_LIGHT_STRIDE;
        const x = trafficLights[offset];
        const z = trafficLights[offset + 1];
        const phaseCode = Math.round(trafficLights[offset + 2]);
        const facingSign = trafficLights[offset + 3];

        slot.root.visible = true;
        slot.root.position.set(x, 0, z);
        slot.root.rotation.y = facingSign > 0 ? 0 : Math.PI;

        // Phase: 0 = Green, 1 = Yellow, 2 = Red
        if (phaseCode === 0) {
          slot.greenLens.material.color.set(0x00ff88).multiplyScalar(1.85);
          slot.yellowLens.material.color.set(0x221800);
          slot.redLens.material.color.set(0x220505);
        } else if (phaseCode === 1) {
          slot.greenLens.material.color.set(0x052210);
          slot.yellowLens.material.color.set(0xffbb00).multiplyScalar(1.85);
          slot.redLens.material.color.set(0x220505);
        } else {
          slot.greenLens.material.color.set(0x052210);
          slot.yellowLens.material.color.set(0x221800);
          slot.redLens.material.color.set(0xff2233).multiplyScalar(2.0);
        }
      } else {
        slot.root.visible = false;
      }
    }

    // ------------------------------------------------------------------------
    // 4. Pedestrians (PEDESTRIAN_STRIDE = 8)
    // ------------------------------------------------------------------------
    const pedCount = Math.min(
      MAX_PEDESTRIANS,
      Math.floor(pedestrians.length / PEDESTRIAN_STRIDE)
    );

    for (let i = 0; i < MAX_PEDESTRIANS; i++) {
      const slot = this.pedestrianSlots[i];
      if (i < pedCount) {
        const offset = i * PEDESTRIAN_STRIDE;
        const x = pedestrians[offset];
        const y = pedestrians[offset + 1];
        const z = pedestrians[offset + 2];
        const yaw = pedestrians[offset + 3];
        const walkPhase = pedestrians[offset + 4];
        const hasUmbrella = pedestrians[offset + 5] > 0.5;
        const umbrellaColorSlot = Math.round(pedestrians[offset + 6]) % 3;

        // Check if on-screen / active
        if (Math.abs(x) <= BLOCK_HALF_LENGTH + 6.0) {
          slot.root.visible = true;
          const bob = Math.sin(walkPhase * 2.0) * 0.035;
          slot.root.position.set(x, y + bob, z);
          slot.root.rotation.y = yaw;
          slot.root.rotation.z = Math.sin(walkPhase) * 0.038;

          slot.umbrellaGroup.visible = hasUmbrella;
          if (hasUmbrella) {
            slot.umbrellaRim.material.color.set(
              this.theme.scene.neon[umbrellaColorSlot]
            );
          }
        } else {
          slot.root.visible = false;
        }
      } else {
        slot.root.visible = false;
      }
    }

    // ------------------------------------------------------------------------
    // 5. Rain & Snow Particles
    // ------------------------------------------------------------------------
    const rawParticleCount = Math.floor(particles.length / PARTICLE_STRIDE);

    if (rawParticleCount > 0) {
      let rainCount = 0;
      let snowCount = 0;

      for (let i = 0; i < rawParticleCount; i++) {
        const offset = i * PARTICLE_STRIDE;
        const px = particles[offset];
        const py = particles[offset + 1];
        const pz = particles[offset + 2];
        const vx = particles[offset + 3];
        const vy = particles[offset + 4];
        const kind = Math.round(particles[offset + 5]);

        if (kind === 0 && rainCount < MAX_RAIN_PARTICLES) {
          this.dummyObject.position.set(px, py, pz);
          const angleZ = Math.atan2(vx, -vy);
          this.dummyObject.rotation.set(0, 0, angleZ);
          this.dummyObject.scale.set(1, 1, 1);
          this.dummyObject.updateMatrix();
          this.rainInstancedMesh.setMatrixAt(
            rainCount,
            this.dummyObject.matrix
          );
          rainCount++;
        } else if (kind === 1 && snowCount < MAX_SNOW_PARTICLES) {
          this.dummyObject.position.set(px, py, pz);
          this.dummyObject.rotation.set(
            elapsedSec * 1.5 + i,
            elapsedSec * 1.2 + i * 2,
            0
          );
          this.dummyObject.scale.set(1, 1, 1);
          this.dummyObject.updateMatrix();
          this.snowInstancedMesh.setMatrixAt(
            snowCount,
            this.dummyObject.matrix
          );
          snowCount++;
        }
      }

      this.rainInstancedMesh.count = rainCount;
      this.snowInstancedMesh.count = snowCount;
      if (rainCount > 0) this.rainInstancedMesh.instanceMatrix.needsUpdate = true;
      if (snowCount > 0) this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
    } else {
      // Fallback smooth particles when particles buffer is empty
      if (atmosphere.rainIntensity > 0.02) {
        const targetRain = Math.floor(
          MAX_RAIN_PARTICLES * atmosphere.rainIntensity
        );
        const windSlant = atmosphere.windX * 0.18;

        for (let i = 0; i < targetRain; i++) {
          const p = this.fallbackParticles[i];
          p.y -= 0.65 + atmosphere.rainIntensity * 0.35;
          p.x += atmosphere.windX * 0.12;
          if (p.y < 0.05) {
            p.y = 25.0 + Math.random() * 3.0;
            p.x = (Math.random() - 0.5) * BLOCK_HALF_LENGTH * 2.1;
            p.z = (Math.random() - 0.5) * 32.0;
          }

          this.dummyObject.position.set(p.x, p.y, p.z);
          this.dummyObject.rotation.set(0, 0, windSlant);
          this.dummyObject.scale.set(1, 1, 1);
          this.dummyObject.updateMatrix();
          this.rainInstancedMesh.setMatrixAt(i, this.dummyObject.matrix);
        }

        this.rainInstancedMesh.count = targetRain;
        this.rainInstancedMesh.instanceMatrix.needsUpdate = true;
      } else {
        this.rainInstancedMesh.count = 0;
      }

      if (atmosphere.snowIntensity > 0.02) {
        const targetSnow = Math.floor(
          MAX_SNOW_PARTICLES * atmosphere.snowIntensity
        );

        for (let i = 0; i < targetSnow; i++) {
          const p = this.fallbackParticles[i];
          p.y -= 0.08 + Math.sin(elapsedSec * 2.0 + i) * 0.02;
          p.x += atmosphere.windX * 0.06 + Math.cos(elapsedSec * 1.5 + i) * 0.03;
          if (p.y < 0.05) {
            p.y = 22.0 + Math.random() * 3.0;
            p.x = (Math.random() - 0.5) * BLOCK_HALF_LENGTH * 2.1;
            p.z = (Math.random() - 0.5) * 32.0;
          }

          this.dummyObject.position.set(p.x, p.y, p.z);
          this.dummyObject.rotation.set(
            elapsedSec + i,
            elapsedSec * 0.8 + i,
            0
          );
          this.dummyObject.scale.set(1, 1, 1);
          this.dummyObject.updateMatrix();
          this.snowInstancedMesh.setMatrixAt(i, this.dummyObject.matrix);
        }

        this.snowInstancedMesh.count = targetSnow;
        this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
      } else {
        this.snowInstancedMesh.count = 0;
      }
    }

    // ------------------------------------------------------------------------
    // 6. Easter Eggs
    // ------------------------------------------------------------------------
    this.neonSyncIntensity =
      easterEgg.activeKind === 'neon_sync' ? easterEgg.intensity : 0;

    // UFO
    if (easterEgg.activeKind === 'ufo' && easterEgg.intensity > 0.01) {
      this.ufoGroup.visible = true;
      this.ufoGroup.position.set(easterEgg.x, easterEgg.y, easterEgg.z);
      this.ufoBulbsGroup.rotation.y = elapsedSec * 5.2;

      const scale = THREE.MathUtils.clamp(easterEgg.intensity, 0.01, 1.0);
      this.ufoGroup.scale.set(scale, scale, scale);
      this.ufoTractorBeamMesh.material.opacity = 0.38 * easterEgg.intensity;
    } else {
      this.ufoGroup.visible = false;
    }

    // Black Cat
    if (easterEgg.activeKind === 'cat' && easterEgg.intensity > 0.01) {
      this.catGroup.visible = true;
      const runningBob = Math.abs(Math.sin(elapsedSec * 16.0)) * 0.07;
      this.catGroup.position.set(
        easterEgg.x,
        easterEgg.y + runningBob,
        easterEgg.z
      );
      this.catGroup.rotation.y = easterEgg.yaw;
      this.catTailMesh.rotation.y = Math.sin(elapsedSec * 18.0) * 0.45;
    } else {
      this.catGroup.visible = false;
    }
  }

  public dispose(): void {
    // Dispose car geometries and materials
    for (const slot of this.carSlots) {
      slot.chassisMesh.geometry.dispose();
      slot.chassisMesh.material.dispose();
      slot.cabinMesh.geometry.dispose();
      slot.cabinMesh.material.dispose();
      slot.headlightMesh.geometry.dispose();
      slot.headlightMesh.material.dispose();
      slot.taillightMesh.geometry.dispose();
      slot.taillightMesh.material.dispose();
      slot.underglowMesh.geometry.dispose();
      slot.underglowMesh.material.dispose();
    }
    this.carSlots.length = 0;

    // Dispose trails
    this.trailGeometry.dispose();
    this.trailMesh.material.dispose();

    // Dispose traffic lights
    for (const slot of this.trafficLightSlots) {
      slot.redLens.geometry.dispose();
      slot.redLens.material.dispose();
      slot.yellowLens.geometry.dispose();
      slot.yellowLens.material.dispose();
      slot.greenLens.geometry.dispose();
      slot.greenLens.material.dispose();
    }
    this.trafficLightSlots.length = 0;

    // Dispose pedestrians
    for (const slot of this.pedestrianSlots) {
      slot.coatMesh.geometry.dispose();
      slot.coatMesh.material.dispose();
      slot.headMesh.geometry.dispose();
      slot.headMesh.material.dispose();
      slot.umbrellaDome.geometry.dispose();
      slot.umbrellaDome.material.dispose();
      slot.umbrellaRim.geometry.dispose();
      slot.umbrellaRim.material.dispose();
    }
    this.pedestrianSlots.length = 0;

    // Dispose particle meshes
    this.rainInstancedMesh.geometry.dispose();
    this.rainInstancedMesh.material.dispose();
    this.snowInstancedMesh.geometry.dispose();
    this.snowInstancedMesh.material.dispose();

    // Dispose easter eggs
    this.ufoSaucerMesh.geometry.dispose();
    (this.ufoSaucerMesh.material as THREE.Material).dispose();
    for (const bulb of this.ufoBulbMeshes) {
      bulb.geometry.dispose();
      bulb.material.dispose();
    }
    this.ufoTractorBeamMesh.geometry.dispose();
    this.ufoTractorBeamMesh.material.dispose();

    this.catBodyMesh.geometry.dispose();
    (this.catBodyMesh.material as THREE.Material).dispose();
    this.catHeadMesh.geometry.dispose();
    this.catLeftEar.geometry.dispose();
    this.catRightEar.geometry.dispose();
    this.catTailMesh.geometry.dispose();
    this.catLeftEye.geometry.dispose();
    this.catLeftEye.material.dispose();
    this.catRightEye.geometry.dispose();
    this.catRightEye.material.dispose();

    this.group.clear();
  }
}
