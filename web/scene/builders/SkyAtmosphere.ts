import * as THREE from 'three';
import type { AtmosphereState } from '../../types/sim';
import type { ThemeDefinition } from '../../config/themes';

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uDuskColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uDaylight;
  uniform float uTwilight;
  uniform float uStarIntensity;
  uniform float uTime;

  varying vec3 vWorldDir;

  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float up = clamp(dir.y, 0.0, 1.0);

    // Smooth vertical sky gradient
    float curve = pow(up, 0.52);
    vec3 sky = mix(uHorizonColor, uZenithColor, curve);

    // Dusk/dawn horizon ribbon
    float horizonBand = pow(1.0 - up, 3.2);
    float sunAzimuthMask = clamp(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))) * 0.5 + 0.5, 0.0, 1.0);
    sky = mix(sky, uDuskColor, horizonBand * uTwilight * (0.45 + 0.55 * sunAzimuthMask));

    // Subtle cyberpunk city glow near lower horizon at night
    float cityGlow = pow(1.0 - up, 5.0) * (1.0 - uDaylight * 0.75);
    sky += uDuskColor * cityGlow * 0.16;

    // Celestial disc (Sun during day/twilight, crisp cyber Moon at night)
    float cosAngle = dot(dir, normalize(uSunDir));
    float disc = smoothstep(0.9982, 0.9993, cosAngle);
    float halo = pow(max(0.0, cosAngle), 48.0) * 0.38 + pow(max(0.0, cosAngle), 8.0) * 0.12;
    sky += uSunColor * (disc * 1.45 + halo) * smoothstep(-0.08, 0.08, dir.y);

    // Twinkling stars in upper hemisphere at night
    if (uStarIntensity > 0.01 && up > 0.06) {
      vec3 starCell = floor(dir * 190.0);
      float h = hash31(starCell);
      if (h > 0.9945) {
        float twinkle = 0.55 + 0.45 * sin(uTime * (2.2 + fract(h * 73.0) * 4.0) + h * 120.0);
        float starMask = smoothstep(0.06, 0.35, up) * twinkle * uStarIntensity;
        vec3 starCol = mix(vec3(0.75, 0.88, 1.0), uDuskColor, fract(h * 31.7) * 0.35);
        sky += starCol * starMask * 0.85;
      }
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export class SkyAtmosphere {
  public readonly group = new THREE.Group();
  public readonly skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  public readonly dirLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly ambientLight: THREE.AmbientLight;
  public readonly fog: THREE.FogExp2;

  private readonly scene: THREE.Scene;
  private readonly cNightZenith = new THREE.Color();
  private readonly cNightHorizon = new THREE.Color();
  private readonly cDayZenith = new THREE.Color();
  private readonly cDayHorizon = new THREE.Color();
  private readonly cDuskHorizon = new THREE.Color();
  private readonly cZenith = new THREE.Color();
  private readonly cHorizon = new THREE.Color();
  private readonly cFogNight = new THREE.Color();
  private readonly cFogDay = new THREE.Color();
  private readonly cFogCurrent = new THREE.Color();
  private readonly cAmbientNight = new THREE.Color();
  private readonly cAmbientDay = new THREE.Color('#6f88ad');
  private readonly cSunDay = new THREE.Color('#fff2d6');
  private readonly cSunDusk = new THREE.Color('#ff7597');
  private readonly cMoonNight = new THREE.Color('#9be8ff');
  private readonly cCelestial = new THREE.Color();
  private readonly sunDir = new THREE.Vector3(0.3, 0.6, -0.7);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'SkyAtmosphere';

    const geo = new THREE.SphereGeometry(180, 24, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenithColor: { value: new THREE.Color('#04060e') },
        uHorizonColor: { value: new THREE.Color('#0d1424') },
        uDuskColor: { value: new THREE.Color('#d44a7a') },
        uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.7).normalize() },
        uSunColor: { value: new THREE.Color('#9be8ff') },
        uDaylight: { value: 0.0 },
        uTwilight: { value: 0.1 },
        uStarIntensity: { value: 0.9 },
        uTime: { value: 0.0 },
      },
    });

    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMesh.renderOrder = -10;
    this.group.add(this.skyMesh);

    this.dirLight = new THREE.DirectionalLight('#9be8ff', 1.1);
    this.dirLight.position.set(24, 38, -28);
    this.group.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight('#2a4066', '#0c101c', 0.85);
    this.group.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight('#12162a', 0.65);
    this.group.add(this.ambientLight);

    this.fog = new THREE.FogExp2('#080c16', 0.011);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color('#060812');
    this.scene.add(this.group);
  }

  public update(
    atmosphere: AtmosphereState,
    theme: ThemeDefinition,
    elapsedSec: number
  ): void {
    const daylight = THREE.MathUtils.clamp(atmosphere.daylight, 0, 1);
    const twilight = THREE.MathUtils.clamp(atmosphere.twilight, 0, 1);
    const rainDim = THREE.MathUtils.clamp(
      atmosphere.rainIntensity * 0.38 + atmosphere.snowIntensity * 0.22,
      0,
      0.5
    );

    this.cNightZenith.set(theme.scene.skyNightZenith);
    this.cNightHorizon.set(theme.scene.skyNightHorizon);
    this.cDayZenith.set(theme.scene.skyDayZenith);
    this.cDayHorizon.set(theme.scene.skyDayHorizon);
    this.cDuskHorizon.set(theme.scene.skyDuskHorizon);

    this.cZenith.copy(this.cNightZenith).lerp(this.cDayZenith, daylight);
    this.cHorizon.copy(this.cNightHorizon).lerp(this.cDayHorizon, daylight);
    this.cHorizon.lerp(this.cDuskHorizon, twilight * 0.62);

    // Overcast storm dimming
    if (rainDim > 0.01) {
      this.cZenith.multiplyScalar(1 - rainDim * 0.45);
      this.cHorizon.multiplyScalar(1 - rainDim * 0.35);
    }

    // Compute sun/moon vector from timeHours so there is always an atmospheric light source above horizon
    const hourAngle = ((atmosphere.timeHours - 6) / 24) * Math.PI * 2;
    const isNight = daylight < 0.22;
    const elevAngle = isNight
      ? 0.48 + 0.22 * Math.sin(hourAngle + Math.PI)
      : Math.max(0.14, Math.sin(hourAngle) * 0.85);
    const azimAngle = isNight ? hourAngle + Math.PI + 0.45 : hourAngle;

    this.sunDir
      .set(
        Math.cos(azimAngle) * Math.cos(elevAngle),
        Math.sin(elevAngle),
        -0.55 - 0.35 * Math.sin(azimAngle)
      )
      .normalize();

    this.cCelestial
      .copy(this.cMoonNight)
      .lerp(this.cSunDay, daylight)
      .lerp(this.cSunDusk, twilight * 0.75);

    const starIntensity =
      THREE.MathUtils.clamp(1 - daylight * 1.6 - twilight * 0.5, 0, 1) *
      THREE.MathUtils.clamp(1 - atmosphere.rainIntensity * 1.2 - atmosphere.snowIntensity, 0, 1);

    const uniforms = this.skyMesh.material.uniforms;
    uniforms.uZenithColor.value.copy(this.cZenith);
    uniforms.uHorizonColor.value.copy(this.cHorizon);
    uniforms.uDuskColor.value.copy(this.cDuskHorizon);
    uniforms.uSunDir.value.copy(this.sunDir);
    uniforms.uSunColor.value.copy(this.cCelestial);
    uniforms.uDaylight.value = daylight;
    uniforms.uTwilight.value = twilight;
    uniforms.uStarIntensity.value = starIntensity;
    uniforms.uTime.value = elapsedSec;

    // Directional light follows sun/moon
    this.dirLight.position.copy(this.sunDir).multiplyScalar(65);
    this.dirLight.color.copy(this.cCelestial);
    this.dirLight.intensity = (0.75 + daylight * 1.45 + twilight * 0.35) * (1 - rainDim * 0.4);

    // Hemisphere + Ambient lights
    this.cAmbientNight.set(theme.scene.ambientNight);
    this.hemiLight.color.copy(this.cHorizon).lerp(this.cCelestial, 0.35);
    this.hemiLight.groundColor.copy(this.cAmbientNight);
    this.hemiLight.intensity = 0.72 + daylight * 0.65;

    this.ambientLight.color.copy(this.cAmbientNight).lerp(this.cAmbientDay, daylight);
    this.ambientLight.intensity = 0.58 + daylight * 0.48;

    // Fog color & density
    this.cFogNight.set(theme.scene.fogNight);
    this.cFogDay.set(theme.scene.fogDay);
    this.cFogCurrent
      .copy(this.cFogNight)
      .lerp(this.cFogDay, daylight)
      .lerp(this.cDuskHorizon, twilight * 0.28);

    this.fog.color.copy(this.cFogCurrent);
    const targetFogDensity = atmosphere.fogEnabled
      ? Math.max(0.0025, atmosphere.fogDensity)
      : 0.0012;
    this.fog.density = targetFogDensity;

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.cFogCurrent);
    }
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.skyMesh.geometry.dispose();
    this.skyMesh.material.dispose();
  }
}
