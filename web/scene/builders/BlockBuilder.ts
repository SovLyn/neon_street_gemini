import * as THREE from 'three';
import {
  BLOCK_HALF_LENGTH,
  CANAL_WATER_Y,
  CANAL_Z_MAX,
  CANAL_Z_MIN,
  NORTH_SIDEWALK_Z_MAX,
  NORTH_SIDEWALK_Z_MIN,
  SIDEWALK_Y,
  SIGN_STATE_STRIDE,
  SOUTH_SIDEWALK_Z_MAX,
  SOUTH_SIDEWALK_Z_MIN,
  STREET_HALF_WIDTH,
  STREETLIGHT_STATE_STRIDE,
  type AtmosphereState,
  type BlockLayout,
  type BuildingSpec,
  type NeonSignSpec,
  type PropSpec,
  type StreetlightSpec,
} from '../../types/sim';
import type { ThemeDefinition } from '../../config/themes';
import {
  createAsphaltTextures,
  createNeonSignTexture,
  createRadialGlowTexture,
  disposeSignTextures,
  getSignLabelText,
} from '../textures';

interface SignRuntime {
  spec: NeonSignSpec;
  group: THREE.Group;
  basePosition: THREE.Vector3;
  faceMaterial: THREE.MeshBasicMaterial;
  rimMaterial: THREE.MeshBasicMaterial;
  primaryColor: THREE.Color;
  accentColor: THREE.Color;
  hitboxMesh: THREE.Mesh;
}

interface StreetlightRuntime {
  spec: StreetlightSpec;
  group: THREE.Group;
  bulbMaterial: THREE.MeshBasicMaterial;
  haloSprite: THREE.Sprite;
  poolMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  pointLight: THREE.PointLight | null;
  hitboxMesh: THREE.Mesh;
  worldTargetPos: THREE.Vector3;
}

interface WindowInstanceMeta {
  threshold: number;
  isWarm: boolean;
  tintFactor: number;
}

export class BlockBuilder {
  public readonly group = new THREE.Group();

  private readonly layout: BlockLayout;
  private theme: ThemeDefinition;
  private customSignText: string;

  private readonly clickableObjects: THREE.Object3D[] = [];
  private readonly signRuntimes = new Map<number, SignRuntime>();
  private readonly streetlightRuntimes = new Map<number, StreetlightRuntime>();

  private roadMaterial!: THREE.MeshStandardMaterial;
  private sidewalkMaterial!: THREE.MeshStandardMaterial;
  private buildingBaseMaterials: THREE.MeshStandardMaterial[] = [];
  private neonTrimMaterials: THREE.MeshBasicMaterial[] = [
    new THREE.MeshBasicMaterial({ color: '#00f5ff', toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: '#ff2a85', toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: '#ffe600', toneMapped: false }),
  ];

  private windowInstancedMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private readonly windowMetas: WindowInstanceMeta[] = [];
  private lastWindowLitRatio = -1;
  private lastWindowNeonIntensity = -1;
  private forceWindowUpdate = true;

  private readonly tempColor = new THREE.Color();
  private readonly warmColor = new THREE.Color();
  private readonly coolColor = new THREE.Color();
  private readonly unlitWindowColor = new THREE.Color('#090d16');

  constructor(
    layout: BlockLayout,
    theme: ThemeDefinition,
    customSignText = ''
  ) {
    this.layout = layout;
    this.theme = theme;
    this.customSignText = customSignText;
    this.group.name = `BlockSeed_${layout.seed}`;

    this.syncTrimMaterials();
    this.buildRoadAndSidewalks();
    this.buildCanalAndFootbridge();
    this.buildBuildingsAndWindows();
    this.buildNeonSigns();
    this.buildStreetlights();
    this.buildProps();
    this.buildOverheadCables();
  }

  private syncTrimMaterials(): void {
    for (let i = 0; i < 3; i++) {
      this.neonTrimMaterials[i].color.set(this.theme.scene.neon[i]);
    }
  }

  private buildRoadAndSidewalks(): void {
    const roadLen = (BLOCK_HALF_LENGTH + 1) * 2; // 74m
    const roadWidth = STREET_HALF_WIDTH * 2; // 12m
    const asphalt = createAsphaltTextures();

    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: asphalt.map,
      roughnessMap: asphalt.roughnessMap,
      roughness: 0.24,
      metalness: 0.2,
    });

    const roadGeo = new THREE.PlaneGeometry(roadLen, roadWidth);
    const roadMesh = new THREE.Mesh(roadGeo, this.roadMaterial);
    roadMesh.rotation.x = -Math.PI * 0.5;
    roadMesh.position.set(0, 0, 0);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    this.sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: '#181d2a',
      roughness: 0.55,
      metalness: 0.12,
    });

    const curbMaterial = new THREE.MeshStandardMaterial({
      color: '#252c3d',
      roughness: 0.45,
      metalness: 0.2,
    });

    // North sidewalk (z = -10..-6, y = 0..0.18)
    const northDepth = NORTH_SIDEWALK_Z_MAX - NORTH_SIDEWALK_Z_MIN;
    const northSwGeo = new THREE.BoxGeometry(roadLen, SIDEWALK_Y, northDepth);
    const northSw = new THREE.Mesh(northSwGeo, this.sidewalkMaterial);
    northSw.position.set(
      0,
      SIDEWALK_Y * 0.5,
      (NORTH_SIDEWALK_Z_MIN + NORTH_SIDEWALK_Z_MAX) * 0.5
    );
    this.group.add(northSw);

    // North curb edge beam
    const northCurbGeo = new THREE.BoxGeometry(roadLen, SIDEWALK_Y + 0.03, 0.22);
    const northCurb = new THREE.Mesh(northCurbGeo, curbMaterial);
    northCurb.position.set(0, (SIDEWALK_Y + 0.03) * 0.5, NORTH_SIDEWALK_Z_MAX - 0.11);
    this.group.add(northCurb);

    // North ground apron under buildings (z = -24..-10)
    const northLotGeo = new THREE.BoxGeometry(roadLen, SIDEWALK_Y, 14);
    const northLot = new THREE.Mesh(northLotGeo, this.sidewalkMaterial);
    northLot.position.set(0, SIDEWALK_Y * 0.5, -17);
    this.group.add(northLot);

    // South promenade sidewalk (z = 6..9.5, y = 0..0.18)
    const southDepth = SOUTH_SIDEWALK_Z_MAX - SOUTH_SIDEWALK_Z_MIN;
    const southSwGeo = new THREE.BoxGeometry(roadLen, SIDEWALK_Y, southDepth);
    const southSw = new THREE.Mesh(southSwGeo, this.sidewalkMaterial);
    southSw.position.set(
      0,
      SIDEWALK_Y * 0.5,
      (SOUTH_SIDEWALK_Z_MIN + SOUTH_SIDEWALK_Z_MAX) * 0.5
    );
    this.group.add(southSw);

    // South curb edge beam
    const southCurb = new THREE.Mesh(northCurbGeo, curbMaterial);
    southCurb.position.set(0, (SIDEWALK_Y + 0.03) * 0.5, SOUTH_SIDEWALK_Z_MIN + 0.11);
    this.group.add(southCurb);

    // Subtle neon curb accent strips flanking the central crosswalk
    const cwStripGeo = new THREE.BoxGeometry(5.4, 0.04, 0.08);
    const cwNorthStrip = new THREE.Mesh(cwStripGeo, this.neonTrimMaterials[0]);
    cwNorthStrip.position.set(0, SIDEWALK_Y + 0.02, NORTH_SIDEWALK_Z_MAX - 0.05);
    this.group.add(cwNorthStrip);

    const cwSouthStrip = new THREE.Mesh(cwStripGeo, this.neonTrimMaterials[0]);
    cwSouthStrip.position.set(0, SIDEWALK_Y + 0.02, SOUTH_SIDEWALK_Z_MIN + 0.05);
    this.group.add(cwSouthStrip);
  }

  private buildCanalAndFootbridge(): void {
    const roadLen = (BLOCK_HALF_LENGTH + 1) * 2;
    const canalDepth = CANAL_Z_MAX - CANAL_Z_MIN;
    const canalCenterZ = (CANAL_Z_MIN + CANAL_Z_MAX) * 0.5;

    const quayMat = new THREE.MeshStandardMaterial({
      color: '#121622',
      roughness: 0.7,
      metalness: 0.15,
    });

    // North canal quay wall (at z = 9.5, dropping from +0.18 to -1.4)
    const wallHeight = SIDEWALK_Y - -1.4;
    const wallCenterY = (SIDEWALK_Y + -1.4) * 0.5;
    const quayWallGeo = new THREE.BoxGeometry(roadLen, wallHeight, 0.35);

    const northQuay = new THREE.Mesh(quayWallGeo, quayMat);
    northQuay.position.set(0, wallCenterY, CANAL_Z_MIN + 0.15);
    this.group.add(northQuay);

    // South canal quay wall (at z = 17.5) + far-bank promenade deck
    const southQuay = new THREE.Mesh(quayWallGeo, quayMat);
    southQuay.position.set(0, wallCenterY, CANAL_Z_MAX - 0.15);
    this.group.add(southQuay);

    const farBankGeo = new THREE.BoxGeometry(roadLen, SIDEWALK_Y, 4.5);
    const farBank = new THREE.Mesh(farBankGeo, this.sidewalkMaterial);
    farBank.position.set(0, SIDEWALK_Y * 0.5, CANAL_Z_MAX + 2.25);
    this.group.add(farBank);

    // Glowing waterline neon strip along the north and south quay walls
    const quayNeonGeo = new THREE.BoxGeometry(roadLen, 0.05, 0.06);
    const northQuayNeon = new THREE.Mesh(quayNeonGeo, this.neonTrimMaterials[0]);
    northQuayNeon.position.set(0, CANAL_WATER_Y + 0.18, CANAL_Z_MIN + 0.34);
    this.group.add(northQuayNeon);

    const southQuayNeon = new THREE.Mesh(quayNeonGeo, this.neonTrimMaterials[1]);
    southQuayNeon.position.set(0, CANAL_WATER_Y + 0.18, CANAL_Z_MAX - 0.34);
    this.group.add(southQuayNeon);

    // Dark canal bed at y = -1.35
    const bedGeo = new THREE.PlaneGeometry(roadLen, canalDepth);
    const bedMat = new THREE.MeshBasicMaterial({ color: '#03060c' });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.rotation.x = -Math.PI * 0.5;
    bedMesh.position.set(0, -1.35, canalCenterZ);
    this.group.add(bedMesh);

    // Promenade safety railings on left (x = -36..-2.5) and right (x = 2.5..36) of footbridge
    const railMetalMat = new THREE.MeshStandardMaterial({
      color: '#202838',
      roughness: 0.4,
      metalness: 0.6,
    });
    const halfSpan = (roadLen * 0.5 - 2.6);
    const railBarGeo = new THREE.BoxGeometry(halfSpan, 0.06, 0.06);
    for (const sideSign of [-1, 1]) {
      const centerX = sideSign * (2.6 + halfSpan * 0.5);
      const topRail = new THREE.Mesh(railBarGeo, railMetalMat);
      topRail.position.set(centerX, SIDEWALK_Y + 0.82, CANAL_Z_MIN - 0.12);
      this.group.add(topRail);
    }

    // Arched Pedestrian Footbridge crossing canal at x = 0 (z = 9.2..17.8)
    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'CanalFootbridge';
    const bridgeWidth = 4.2;
    const segCount = 9;
    const zStart = CANAL_Z_MIN - 0.2;
    const zEnd = CANAL_Z_MAX + 0.2;
    const totalSpanZ = zEnd - zStart;
    const segLenZ = totalSpanZ / segCount;

    const deckMat = new THREE.MeshStandardMaterial({
      color: '#1e2536',
      roughness: 0.48,
      metalness: 0.35,
    });

    for (let i = 0; i < segCount; i++) {
      const t0 = i / segCount;
      const t1 = (i + 1) / segCount;
      const tMid = (t0 + t1) * 0.5;
      const archY0 = SIDEWALK_Y + Math.sin(t0 * Math.PI) * 1.15;
      const archY1 = SIDEWALK_Y + Math.sin(t1 * Math.PI) * 1.15;
      const archYMid = (archY0 + archY1) * 0.5;
      const dz = segLenZ;
      const dy = archY1 - archY0;
      const pitchAngle = Math.atan2(dy, dz);
      const actualSegLen = Math.hypot(dz, dy) + 0.04;
      const zPos = zStart + tMid * totalSpanZ;

      // Deck slab
      const slabGeo = new THREE.BoxGeometry(bridgeWidth, 0.16, actualSegLen);
      const slab = new THREE.Mesh(slabGeo, deckMat);
      slab.position.set(0, archYMid, zPos);
      slab.rotation.x = -pitchAngle;
      bridgeGroup.add(slab);

      // Left & right handrails + glowing neon strips
      const railGeo = new THREE.BoxGeometry(0.08, 0.07, actualSegLen);
      const neonStripGeo = new THREE.BoxGeometry(0.05, 0.05, actualSegLen);

      for (const xSide of [-1, 1]) {
        const rx = xSide * (bridgeWidth * 0.5 - 0.12);
        const handrail = new THREE.Mesh(railGeo, railMetalMat);
        handrail.position.set(rx, archYMid + 0.88, zPos);
        handrail.rotation.x = -pitchAngle;
        bridgeGroup.add(handrail);

        const handrailNeon = new THREE.Mesh(
          neonStripGeo,
          xSide < 0 ? this.neonTrimMaterials[0] : this.neonTrimMaterials[1]
        );
        handrailNeon.position.set(rx, archYMid + 0.82, zPos);
        handrailNeon.rotation.x = -pitchAngle;
        bridgeGroup.add(handrailNeon);

        // Under-arch glowing edge rib
        const archRibNeon = new THREE.Mesh(
          neonStripGeo,
          this.neonTrimMaterials[2]
        );
        archRibNeon.position.set(rx, archYMid - 0.1, zPos);
        archRibNeon.rotation.x = -pitchAngle;
        bridgeGroup.add(archRibNeon);

        // Vertical baluster post
        const postGeo = new THREE.BoxGeometry(0.07, 0.88, 0.07);
        const post = new THREE.Mesh(postGeo, railMetalMat);
        post.position.set(rx, archYMid + 0.44, zPos);
        bridgeGroup.add(post);
      }
    }

    this.group.add(bridgeGroup);
  }

  private buildBuildingsAndWindows(): void {
    const baseHex = new THREE.Color(this.theme.scene.buildingBase);
    const roofDetailMat = new THREE.MeshStandardMaterial({
      color: '#191f2e',
      roughness: 0.6,
      metalness: 0.3,
    });

    // Collect all window transforms first so we can allocate a single InstancedMesh
    const windowMatrices: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    for (const b of this.layout.buildings) {
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, SIDEWALK_Y, b.z);

      // Tint building material slightly using b.colorTint
      const bColor = baseHex.clone();
      const tintShift = (b.colorTint - 0.5) * 0.08;
      bColor.offsetHSL(tintShift * 0.3, 0, tintShift);

      const bMat = new THREE.MeshStandardMaterial({
        color: bColor,
        roughness: 0.68,
        metalness: 0.22,
      });
      this.buildingBaseMaterials.push(bMat);

      // Main building mass
      const mainGeo = new THREE.BoxGeometry(b.width, b.height, b.depth);
      const mainMesh = new THREE.Mesh(mainGeo, bMat);
      mainMesh.position.set(0, b.height * 0.5, 0);
      bGroup.add(mainMesh);

      // Architectural cornice ledge at top of main facade
      const ledgeGeo = new THREE.BoxGeometry(b.width + 0.24, 0.28, b.depth + 0.24);
      const ledgeMesh = new THREE.Mesh(ledgeGeo, roofDetailMat);
      ledgeMesh.position.set(0, b.height - 0.14, 0);
      bGroup.add(ledgeMesh);

      // Subtle vertical neon edge trim on taller buildings
      const trimMat = this.neonTrimMaterials[b.id % 3];
      const vTrimGeo = new THREE.BoxGeometry(0.07, b.height * 0.86, 0.07);
      const frontZ = b.side === 'north' ? b.depth * 0.5 + 0.02 : -b.depth * 0.5 - 0.02;
      for (const sideX of [-1, 1]) {
        const trimMesh = new THREE.Mesh(vTrimGeo, trimMat);
        trimMesh.position.set(
          sideX * (b.width * 0.5 - 0.08),
          b.height * 0.52,
          frontZ
        );
        bGroup.add(trimMesh);
      }

      // Rooftop structures based on b.roofStyle
      this.buildRoofDetail(b, bGroup, bMat, roofDetailMat, trimMat);

      this.group.add(bGroup);

      // Generate window panes on street-facing facade (+Z for north, -Z for south) and back/canal facade
      const rows = Math.max(2, b.windowRows);
      const cols = Math.max(2, b.windowCols);
      const minY = 3.2;
      const maxY = b.height - 1.2;
      if (maxY > minY) {
        const usableH = maxY - minY;
        const rowStep = usableH / rows;
        const usableW = b.width - 1.4;
        const colStep = usableW / cols;

        const paneW = Math.max(0.38, Math.min(0.95, colStep * 0.56));
        const paneH = Math.max(0.45, Math.min(1.1, rowStep * 0.54));

        // Front facade (facing street) and back facade (for South buildings facing canal!)
        const faces: Array<{ zOffset: number; rotY: number }> = [
          {
            zOffset: b.side === 'north' ? b.depth * 0.5 + 0.03 : -b.depth * 0.5 - 0.03,
            rotY: b.side === 'north' ? 0 : Math.PI,
          },
        ];
        if (b.side === 'south') {
          faces.push({
            zOffset: b.depth * 0.5 + 0.03,
            rotY: 0,
          });
        }

        let rng = (b.windowSeed ^ (b.id * 2654435761)) >>> 0;
        const nextHash = (): number => {
          rng = (rng * 1664525 + 1013904223) >>> 0;
          return rng / 4294967296;
        };

        for (const face of faces) {
          for (let r = 0; r < rows; r++) {
            const wy = SIDEWALK_Y + minY + (r + 0.5) * rowStep;
            for (let c = 0; c < cols; c++) {
              // Skip occasional structural bay
              const threshold = nextHash();
              if (threshold > 0.92) {
                continue;
              }
              const wx = b.x - usableW * 0.5 + (c + 0.5) * colStep;
              const wz = b.z + face.zOffset;

              dummy.position.set(wx, wy, wz);
              dummy.rotation.set(0, face.rotY, 0);
              dummy.scale.set(paneW, paneH, 1);
              dummy.updateMatrix();

              windowMatrices.push(dummy.matrix.clone());
              this.windowMetas.push({
                threshold: threshold * 0.95,
                isWarm: nextHash() > 0.42,
                tintFactor: 0.72 + nextHash() * 0.45,
              });
            }
          }
        }
      }
    }

    if (windowMatrices.length > 0) {
      const winGeo = new THREE.PlaneGeometry(1, 1);
      const winMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      this.windowInstancedMesh = new THREE.InstancedMesh(
        winGeo,
        winMat,
        windowMatrices.length
      );
      for (let i = 0; i < windowMatrices.length; i++) {
        this.windowInstancedMesh.setMatrixAt(i, windowMatrices[i]);
        this.windowInstancedMesh.setColorAt(i, this.unlitWindowColor);
      }
      this.windowInstancedMesh.instanceMatrix.needsUpdate = true;
      if (this.windowInstancedMesh.instanceColor) {
        this.windowInstancedMesh.instanceColor.needsUpdate = true;
      }
      this.group.add(this.windowInstancedMesh);
    }
  }

  private buildRoofDetail(
    b: BuildingSpec,
    bGroup: THREE.Group,
    bMat: THREE.MeshStandardMaterial,
    roofDetailMat: THREE.MeshStandardMaterial,
    trimMat: THREE.MeshBasicMaterial
  ): void {
    const topY = b.height;
    switch (b.roofStyle) {
      case 'stepped': {
        const tier1W = b.width * 0.76;
        const tier1D = b.depth * 0.76;
        const tier1H = 1.6;
        const tier1 = new THREE.Mesh(
          new THREE.BoxGeometry(tier1W, tier1H, tier1D),
          bMat
        );
        tier1.position.set(0, topY + tier1H * 0.5, 0);
        bGroup.add(tier1);

        const tier2W = b.width * 0.5;
        const tier2D = b.depth * 0.5;
        const tier2H = 1.3;
        const tier2 = new THREE.Mesh(
          new THREE.BoxGeometry(tier2W, tier2H, tier2D),
          roofDetailMat
        );
        tier2.position.set(0, topY + tier1H + tier2H * 0.5, 0);
        bGroup.add(tier2);

        const crownNeon = new THREE.Mesh(
          new THREE.BoxGeometry(tier1W + 0.1, 0.08, tier1D + 0.1),
          trimMat
        );
        crownNeon.position.set(0, topY + tier1H, 0);
        bGroup.add(crownNeon);
        break;
      }
      case 'antenna': {
        const pentGeo = new THREE.BoxGeometry(b.width * 0.45, 1.4, b.depth * 0.45);
        const pent = new THREE.Mesh(pentGeo, roofDetailMat);
        pent.position.set(0, topY + 0.7, 0);
        bGroup.add(pent);

        const mastH = 4.2;
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.12, mastH, 6),
          roofDetailMat
        );
        mast.position.set(0, topY + 1.4 + mastH * 0.5, 0);
        bGroup.add(mast);

        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 8),
          trimMat
        );
        beacon.position.set(0, topY + 1.4 + mastH, 0);
        bGroup.add(beacon);
        break;
      }
      case 'watertower': {
        const legH = 1.5;
        for (const lx of [-0.6, 0.6]) {
          for (const lz of [-0.6, 0.6]) {
            const leg = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.06, legH, 6),
              roofDetailMat
            );
            leg.position.set(lx, topY + legH * 0.5, lz);
            bGroup.add(leg);
          }
        }
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 0.95, 1.8, 12),
          roofDetailMat
        );
        tank.position.set(0, topY + legH + 0.9, 0);
        bGroup.add(tank);

        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.08, 0.7, 12),
          bMat
        );
        cone.position.set(0, topY + legH + 1.8 + 0.35, 0);
        bGroup.add(cone);
        break;
      }
      case 'flat':
      default: {
        const hvac = new THREE.Mesh(
          new THREE.BoxGeometry(b.width * 0.38, 0.9, b.depth * 0.35),
          roofDetailMat
        );
        hvac.position.set(b.width * 0.12, topY + 0.45, -b.depth * 0.1);
        bGroup.add(hvac);
        break;
      }
    }
  }

  private buildNeonSigns(): void {
    const casingMat = new THREE.MeshStandardMaterial({
      color: '#0b0e17',
      roughness: 0.45,
      metalness: 0.65,
    });

    const hitboxMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    });

    for (const sign of this.layout.signs) {
      const signGroup = new THREE.Group();
      signGroup.position.set(sign.x, sign.y, sign.z);
      signGroup.rotation.y = sign.facingY;

      const primaryHex = this.theme.scene.neon[sign.colorSlot];
      const accentHex = this.theme.scene.neon[(sign.colorSlot + 1) % 3];
      const label = getSignLabelText(
        sign.labelIndex,
        sign.isHero,
        this.customSignText
      );
      const signTex = createNeonSignTexture(
        label,
        sign.orientation,
        primaryHex,
        accentHex
      );

      const casingDepth = Math.max(0.14, sign.depth);
      const casingGeo = new THREE.BoxGeometry(
        sign.width,
        sign.height,
        casingDepth
      );
      const casingMesh = new THREE.Mesh(casingGeo, casingMat);
      casingMesh.userData = { interactType: 'sign', interactId: sign.id };
      signGroup.add(casingMesh);

      // Glowing sign face on both front (+Z) and back (-Z) of the lightbox so it's readable from any angle
      const faceMat = new THREE.MeshBasicMaterial({
        map: signTex,
        color: '#ffffff',
        toneMapped: false,
      });

      const faceGeo = new THREE.PlaneGeometry(
        sign.width * 0.97,
        sign.height * 0.97
      );
      const frontFace = new THREE.Mesh(faceGeo, faceMat);
      frontFace.position.z = casingDepth * 0.5 + 0.012;
      frontFace.userData = { interactType: 'sign', interactId: sign.id };
      signGroup.add(frontFace);

      const backFace = new THREE.Mesh(faceGeo, faceMat);
      backFace.position.z = -casingDepth * 0.5 - 0.012;
      backFace.rotation.y = Math.PI;
      backFace.userData = { interactType: 'sign', interactId: sign.id };
      signGroup.add(backFace);

      // Glowing neon outer rim bar at top & bottom of sign box
      const rimMat = new THREE.MeshBasicMaterial({
        color: primaryHex,
        toneMapped: false,
      });
      const rimBarGeo = new THREE.BoxGeometry(
        sign.width + 0.06,
        0.06,
        casingDepth + 0.04
      );
      const topRim = new THREE.Mesh(rimBarGeo, rimMat);
      topRim.position.y = sign.height * 0.5 + 0.02;
      topRim.userData = { interactType: 'sign', interactId: sign.id };
      signGroup.add(topRim);

      const botRim = new THREE.Mesh(rimBarGeo, rimMat);
      botRim.position.y = -sign.height * 0.5 - 0.02;
      botRim.userData = { interactType: 'sign', interactId: sign.id };
      signGroup.add(botRim);

      // Mounting struts for rooftop or vertical signs
      if (sign.orientation === 'rooftop') {
        const strutGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6);
        for (const sx of [-sign.width * 0.35, sign.width * 0.35]) {
          const strut = new THREE.Mesh(strutGeo, casingMat);
          strut.position.set(sx, -sign.height * 0.5 - 0.5, 0);
          signGroup.add(strut);
        }
      }

      // Generous raycast hitbox
      const hitboxGeo = new THREE.BoxGeometry(
        sign.width + 0.45,
        sign.height + 0.45,
        casingDepth + 0.5
      );
      const hitboxMesh = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitboxMesh.userData = { interactType: 'sign', interactId: sign.id };
      signGroup.add(hitboxMesh);

      this.clickableObjects.push(hitboxMesh, frontFace, backFace, casingMesh);

      this.signRuntimes.set(sign.id, {
        spec: sign,
        group: signGroup,
        basePosition: new THREE.Vector3(sign.x, sign.y, sign.z),
        faceMaterial: faceMat,
        rimMaterial: rimMat,
        primaryColor: new THREE.Color(primaryHex),
        accentColor: new THREE.Color(accentHex),
        hitboxMesh,
      });

      this.group.add(signGroup);
    }
  }

  private buildStreetlights(): void {
    const poleMat = new THREE.MeshStandardMaterial({
      color: '#1b2232',
      roughness: 0.4,
      metalness: 0.72,
    });
    const glowTex = createRadialGlowTexture();
    const hitboxMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    });

    let pointLightCount = 0;

    for (const light of this.layout.streetlights) {
      const lGroup = new THREE.Group();
      lGroup.position.set(light.x, SIDEWALK_Y, light.z);

      const poleH = light.height;
      const armReach = 1.65;
      const armZ = light.armDirZ * armReach;

      // Pedestal + vertical shaft
      const baseMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 0.7, 8),
        poleMat
      );
      baseMesh.position.y = 0.35;
      baseMesh.userData = { interactType: 'streetlight', interactId: light.id };
      lGroup.add(baseMesh);

      const shaftMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, poleH, 8),
        poleMat
      );
      shaftMesh.position.y = poleH * 0.5;
      shaftMesh.userData = { interactType: 'streetlight', interactId: light.id };
      lGroup.add(shaftMesh);

      // Cantilevered arm extending toward street
      const armMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, armReach + 0.2),
        poleMat
      );
      armMesh.position.set(0, poleH - 0.1, armZ * 0.5);
      armMesh.userData = { interactType: 'streetlight', interactId: light.id };
      lGroup.add(armMesh);

      // Luminaire hood & emissive bulb
      const hoodMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.12, 0.68),
        poleMat
      );
      hoodMesh.position.set(0, poleH - 0.08, armZ);
      hoodMesh.userData = { interactType: 'streetlight', interactId: light.id };
      lGroup.add(hoodMesh);

      const bulbMat = new THREE.MeshBasicMaterial({
        color: this.theme.scene.streetlightColor,
        toneMapped: false,
      });
      const bulbMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.08, 0.54),
        bulbMat
      );
      bulbMesh.position.set(0, poleH - 0.15, armZ);
      bulbMesh.userData = { interactType: 'streetlight', interactId: light.id };
      lGroup.add(bulbMesh);

      // Soft halo sprite around bulb
      const spriteMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: this.theme.scene.streetlightColor,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const haloSprite = new THREE.Sprite(spriteMat);
      haloSprite.position.set(0, poleH - 0.22, armZ);
      haloSprite.scale.set(2.4, 2.4, 1);
      lGroup.add(haloSprite);

      // Ground light-pool decal on the wet street
      const poolGeo = new THREE.PlaneGeometry(5.6, 5.6);
      const poolMat = new THREE.MeshBasicMaterial({
        map: glowTex,
        color: this.theme.scene.streetlightColor,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const poolMesh = new THREE.Mesh(poolGeo, poolMat);
      poolMesh.rotation.x = -Math.PI * 0.5;
      poolMesh.position.set(0, -SIDEWALK_Y + 0.022, armZ);
      lGroup.add(poolMesh);

      // Add real PointLight on alternate streetlights so wet asphalt picks up real specular pools while staying fast
      let pointLight: THREE.PointLight | null = null;
      if (pointLightCount < 6 && light.id % 2 === 0) {
        pointLight = new THREE.PointLight(
          this.theme.scene.streetlightColor,
          2.2,
          15,
          1.8
        );
        pointLight.position.set(0, poleH - 0.35, armZ);
        lGroup.add(pointLight);
        pointLightCount++;
      }

      // Generous invisible hitbox around the entire pole + luminaire head so clicking a streetlight never misses
      const hitboxGeo = new THREE.BoxGeometry(1.5, poleH + 0.9, 2.6);
      const hitboxMesh = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitboxMesh.position.set(0, poleH * 0.5 + 0.2, armZ * 0.45);
      hitboxMesh.userData = { interactType: 'streetlight', interactId: light.id };
      lGroup.add(hitboxMesh);

      this.clickableObjects.push(
        hitboxMesh,
        hoodMesh,
        bulbMesh,
        shaftMesh,
        baseMesh
      );

      this.streetlightRuntimes.set(light.id, {
        spec: light,
        group: lGroup,
        bulbMaterial: bulbMat,
        haloSprite,
        poolMesh,
        pointLight,
        hitboxMesh,
        worldTargetPos: new THREE.Vector3(
          light.x,
          SIDEWALK_Y + poleH * 0.72,
          light.z + armZ * 0.4
        ),
      });

      this.group.add(lGroup);
    }
  }

  private buildProps(): void {
    const metalMat = new THREE.MeshStandardMaterial({
      color: '#1b2130',
      roughness: 0.5,
      metalness: 0.55,
    });

    for (const prop of this.layout.props) {
      const pGroup = new THREE.Group();
      pGroup.position.set(prop.x, prop.y, prop.z);
      pGroup.rotation.y = prop.rotationY;
      pGroup.scale.setScalar(prop.scale || 1);

      const neonMat = this.neonTrimMaterials[prop.colorSlot % 3];

      switch (prop.kind) {
        case 'vending': {
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(1.05, 2.05, 0.78),
            metalMat
          );
          body.position.y = 1.025;
          pGroup.add(body);

          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.82, 1.15),
            neonMat
          );
          screen.position.set(0, 1.28, 0.4);
          pGroup.add(screen);

          const slot = new THREE.Mesh(
            new THREE.PlaneGeometry(0.68, 0.22),
            this.neonTrimMaterials[(prop.colorSlot + 1) % 3]
          );
          slot.position.set(0, 0.42, 0.4);
          pGroup.add(slot);
          break;
        }
        case 'bollard': {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.15, 0.88, 8),
            metalMat
          );
          post.position.y = 0.44;
          pGroup.add(post);

          const ring = new THREE.Mesh(
            new THREE.CylinderGeometry(0.145, 0.145, 0.14, 8),
            neonMat
          );
          ring.position.y = 0.72;
          pGroup.add(ring);
          break;
        }
        case 'ac_unit': {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.62, 0.42),
            metalMat
          );
          pGroup.add(box);
          break;
        }
        case 'trash_bin': {
          const bin = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.92, 0.48),
            metalMat
          );
          bin.position.y = 0.46;
          pGroup.add(bin);

          const led = new THREE.Mesh(
            new THREE.BoxGeometry(0.48, 0.05, 0.5),
            neonMat
          );
          led.position.y = 0.82;
          pGroup.add(led);
          break;
        }
        case 'traffic_pole':
        default: {
          const cabinet = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 1.35, 0.45),
            metalMat
          );
          cabinet.position.y = 0.675;
          pGroup.add(cabinet);
          break;
        }
      }

      this.group.add(pGroup);
    }
  }

  private buildOverheadCables(): void {
    const cableMat = new THREE.LineBasicMaterial({
      color: '#1b2438',
      transparent: true,
      opacity: 0.72,
    });

    const northBuildings = this.layout.buildings
      .filter((b) => b.side === 'north')
      .sort((a, b) => a.x - b.x);

    for (let i = 0; i < northBuildings.length - 1; i++) {
      const b0 = northBuildings[i];
      const b1 = northBuildings[i + 1];
      const x0 = b0.x + b0.width * 0.35;
      const x1 = b1.x - b1.width * 0.35;
      const z0 = b0.z + b0.depth * 0.5 - 0.2;
      const z1 = b1.z + b1.depth * 0.5 - 0.2;

      for (let strand = 0; strand < 2; strand++) {
        const yBase = Math.min(b0.height, b1.height) * (0.52 + strand * 0.16);
        const pts: THREE.Vector3[] = [];
        const steps = 10;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const sag = Math.sin(t * Math.PI) * (0.55 + strand * 0.25);
          pts.push(
            new THREE.Vector3(
              THREE.MathUtils.lerp(x0, x1, t),
              SIDEWALK_Y + yBase - sag,
              THREE.MathUtils.lerp(z0, z1, t) + strand * 0.25
            )
          );
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(lineGeo, cableMat);
        this.group.add(line);
      }
    }
  }

  public getClickableObjects(): THREE.Object3D[] {
    return this.clickableObjects;
  }

  public getSignWorldPosition(id?: number): THREE.Vector3 | null {
    if (id !== undefined) {
      const rt = this.signRuntimes.get(id);
      return rt ? rt.basePosition.clone() : null;
    }
    const first = this.signRuntimes.values().next().value as SignRuntime | undefined;
    return first ? first.basePosition.clone() : null;
  }

  public getStreetlightWorldPosition(id?: number): THREE.Vector3 | null {
    if (id !== undefined) {
      const rt = this.streetlightRuntimes.get(id);
      return rt ? rt.worldTargetPos.clone() : null;
    }
    const first = this.streetlightRuntimes.values().next().value as
      | StreetlightRuntime
      | undefined;
    return first ? first.worldTargetPos.clone() : null;
  }

  public getSignIds(): number[] {
    return Array.from(this.signRuntimes.keys());
  }

  public getStreetlightIds(): number[] {
    return Array.from(this.streetlightRuntimes.keys());
  }

  public updateTheme(theme: ThemeDefinition): void {
    this.theme = theme;
    this.syncTrimMaterials();

    const baseHex = new THREE.Color(theme.scene.buildingBase);
    for (let i = 0; i < this.buildingBaseMaterials.length; i++) {
      const b = this.layout.buildings[i];
      const c = baseHex.clone();
      if (b) {
        const shift = (b.colorTint - 0.5) * 0.08;
        c.offsetHSL(shift * 0.3, 0, shift);
      }
      this.buildingBaseMaterials[i].color.copy(c);
    }

    // Refresh sign textures & colors for the new theme palette
    for (const rt of this.signRuntimes.values()) {
      const primaryHex = theme.scene.neon[rt.spec.colorSlot];
      const accentHex = theme.scene.neon[(rt.spec.colorSlot + 1) % 3];
      rt.primaryColor.set(primaryHex);
      rt.accentColor.set(accentHex);

      const label = getSignLabelText(
        rt.spec.labelIndex,
        rt.spec.isHero,
        this.customSignText
      );
      rt.faceMaterial.map = createNeonSignTexture(
        label,
        rt.spec.orientation,
        primaryHex,
        accentHex
      );
      rt.faceMaterial.needsUpdate = true;
      rt.rimMaterial.color.set(primaryHex);
    }

    // Refresh streetlight colors
    for (const lrt of this.streetlightRuntimes.values()) {
      lrt.bulbMaterial.color.set(theme.scene.streetlightColor);
      lrt.haloSprite.material.color.set(theme.scene.streetlightColor);
      lrt.poolMesh.material.color.set(theme.scene.streetlightColor);
      if (lrt.pointLight) {
        lrt.pointLight.color.set(theme.scene.streetlightColor);
      }
    }

    this.forceWindowUpdate = true;
  }

  public updateCustomSignText(text: string): void {
    this.customSignText = text;
    let updatedHero = false;
    for (const rt of this.signRuntimes.values()) {
      if (rt.spec.isHero) {
        const primaryHex = this.theme.scene.neon[rt.spec.colorSlot];
        const accentHex = this.theme.scene.neon[(rt.spec.colorSlot + 1) % 3];
        const label = getSignLabelText(
          rt.spec.labelIndex,
          true,
          this.customSignText
        );
        rt.faceMaterial.map = createNeonSignTexture(
          label,
          rt.spec.orientation,
          primaryHex,
          accentHex
        );
        rt.faceMaterial.needsUpdate = true;
        updatedHero = true;
      }
    }

    // Fallback to first sign if layout had no sign flagged isHero
    if (!updatedHero) {
      const first = this.signRuntimes.values().next().value as
        | SignRuntime
        | undefined;
      if (first) {
        const primaryHex = this.theme.scene.neon[first.spec.colorSlot];
        const accentHex = this.theme.scene.neon[(first.spec.colorSlot + 1) % 3];
        const label = getSignLabelText(
          first.spec.labelIndex,
          true,
          this.customSignText
        );
        first.faceMaterial.map = createNeonSignTexture(
          label,
          first.spec.orientation,
          primaryHex,
          accentHex
        );
        first.faceMaterial.needsUpdate = true;
      }
    }
  }

  public updateFrame(
    atmosphere: AtmosphereState,
    signStates: Float32Array,
    streetlightStates: Float32Array,
    elapsedSec: number
  ): void {
    // 1. Wet road & sidewalk roughness
    const wetness = THREE.MathUtils.clamp(atmosphere.wetness, 0, 1);
    this.roadMaterial.roughness = THREE.MathUtils.lerp(0.5, 0.14, wetness);
    this.roadMaterial.metalness = THREE.MathUtils.lerp(0.12, 0.32, wetness);
    this.sidewalkMaterial.roughness = THREE.MathUtils.lerp(0.68, 0.28, wetness);

    // 2. Dynamic lit building windows
    if (
      this.windowInstancedMesh &&
      (this.forceWindowUpdate ||
        Math.abs(atmosphere.windowLitRatio - this.lastWindowLitRatio) > 0.008 ||
        Math.abs(atmosphere.neonIntensity - this.lastWindowNeonIntensity) > 0.015)
    ) {
      this.forceWindowUpdate = false;
      this.lastWindowLitRatio = atmosphere.windowLitRatio;
      this.lastWindowNeonIntensity = atmosphere.neonIntensity;

      this.warmColor.set(this.theme.scene.windowWarm);
      this.coolColor.set(this.theme.scene.windowCool);
      const glowScale = 0.65 + 0.72 * atmosphere.neonIntensity;

      for (let i = 0; i < this.windowMetas.length; i++) {
        const meta = this.windowMetas[i];
        if (meta.threshold < atmosphere.windowLitRatio) {
          this.tempColor
            .copy(meta.isWarm ? this.warmColor : this.coolColor)
            .multiplyScalar(meta.tintFactor * glowScale);
          this.windowInstancedMesh.setColorAt(i, this.tempColor);
        } else {
          this.windowInstancedMesh.setColorAt(i, this.unlitWindowColor);
        }
      }
      if (this.windowInstancedMesh.instanceColor) {
        this.windowInstancedMesh.instanceColor.needsUpdate = true;
      }
    }

    // 3. Per-sign brightness, flicker, and interactive glitch feedback
    const neonFactor = 0.45 + 0.85 * atmosphere.neonIntensity;
    let signIdx = 0;
    for (const rt of this.signRuntimes.values()) {
      const baseOffset = signIdx * SIGN_STATE_STRIDE;
      const brightness =
        baseOffset < signStates.length ? signStates[baseOffset] : 1.0;
      const glitchAmount =
        baseOffset + 1 < signStates.length ? signStates[baseOffset + 1] : 0.0;
      const flickerOffset =
        baseOffset + 2 < signStates.length ? signStates[baseOffset + 2] : 0.0;

      const intensity = THREE.MathUtils.clamp(brightness * neonFactor, 0.08, 1.85);

      if (glitchAmount > 0.01) {
        const wave = Math.sin(elapsedSec * 68 + flickerOffset * 17 + signIdx);
        const jitterX = wave * 0.11 * glitchAmount;
        const jitterY =
          Math.cos(elapsedSec * 53 + signIdx * 3) * 0.06 * glitchAmount;
        rt.group.position.set(
          rt.basePosition.x + jitterX,
          rt.basePosition.y + jitterY,
          rt.basePosition.z
        );
        rt.group.rotation.z = wave * 0.045 * glitchAmount;

        // Flash between white, primary, and accent colors during glitch
        if (wave > 0.25) {
          rt.faceMaterial.color
            .copy(rt.accentColor)
            .multiplyScalar(intensity * 1.45);
          rt.rimMaterial.color
            .copy(rt.accentColor)
            .multiplyScalar(intensity * 1.55);
        } else {
          rt.faceMaterial.color.setScalar(intensity * 0.55);
          rt.rimMaterial.color
            .copy(rt.primaryColor)
            .multiplyScalar(intensity * 0.6);
        }
      } else {
        rt.group.position.copy(rt.basePosition);
        rt.group.rotation.z = 0;
        rt.faceMaterial.color.setScalar(intensity);
        rt.rimMaterial.color.copy(rt.primaryColor).multiplyScalar(intensity);
      }

      signIdx++;
    }

    // 4. Per-streetlight on/off + flicker state
    let lightIdx = 0;
    for (const lrt of this.streetlightRuntimes.values()) {
      const baseOffset = lightIdx * STREETLIGHT_STATE_STRIDE;
      const isOn =
        baseOffset < streetlightStates.length
          ? streetlightStates[baseOffset] > 0.5
          : lrt.spec.initialOn;
      const flicker =
        baseOffset + 1 < streetlightStates.length
          ? streetlightStates[baseOffset + 1]
          : 1.0;

      const level = isOn ? THREE.MathUtils.clamp(flicker, 0.1, 1.3) : 0.0;
      const nightBoost = 0.35 + 0.85 * atmosphere.neonIntensity;
      const activePower = level * nightBoost;

      if (activePower > 0.02) {
        lrt.bulbMaterial.color
          .set(this.theme.scene.streetlightColor)
          .multiplyScalar(1.25 * activePower);
        lrt.haloSprite.visible = true;
        lrt.haloSprite.material.opacity = 0.72 * activePower;
        lrt.poolMesh.visible = true;
        lrt.poolMesh.material.opacity = (0.18 + 0.2 * wetness) * activePower;
        if (lrt.pointLight) {
          lrt.pointLight.intensity = 2.4 * activePower;
        }
      } else {
        lrt.bulbMaterial.color.set('#1a1f2c');
        lrt.haloSprite.visible = false;
        lrt.poolMesh.visible = false;
        if (lrt.pointLight) {
          lrt.pointLight.intensity = 0;
        }
      }

      lightIdx++;
    }
  }

  public dispose(): void {
    this.clickableObjects.length = 0;
    this.signRuntimes.clear();
    this.streetlightRuntimes.clear();
    this.windowMetas.length = 0;

    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) {
            m.dispose();
          }
        } else if (obj.material) {
          obj.material.dispose();
        }
      } else if (obj instanceof THREE.Sprite) {
        obj.material.dispose();
      }
    });

    disposeSignTextures();
  }
}
