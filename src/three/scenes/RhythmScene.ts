import * as THREE from 'three';
import { ParticleSystem } from '../systems/ParticleSystem';
import { nebulaVertexShader, nebulaFragmentShader } from '../shaders/nebula';

// ============================================================
// RhythmScene — Living cosmos with a neutron-star orb at center.
// Custom Fresnel ShaderMaterial for the orb with plasma surface,
// rim glow, inner pulsation. Shockwave rings on good taps.
// Stars drift in zero-g. Energy accumulation intensifies scene.
// Nebula backdrop adds depth.
// ============================================================

/** Easing: smooth step */
function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Orb shader — Fresnel rim glow + animated plasma surface
const orbVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPos = viewMatrix * worldPos;
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const orbFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;       // 0-1 pulse intensity
  uniform float uEnergy;      // 0-2 accumulated energy
  uniform vec3 uBaseColor;
  uniform vec3 uPulseColor;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  // Simple 3D noise for surface detail
  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec3(1, 0, 0));
    float c = hash(i + vec3(0, 1, 0));
    float d = hash(i + vec3(1, 1, 0));
    float e = hash(i + vec3(0, 0, 1));
    float f1 = hash(i + vec3(1, 0, 1));
    float g = hash(i + vec3(0, 1, 1));
    float h = hash(i + vec3(1, 1, 1));

    float x1 = mix(a, b, f.x);
    float x2 = mix(c, d, f.x);
    float x3 = mix(e, f1, f.x);
    float x4 = mix(g, h, f.x);

    float y1 = mix(x1, x2, f.y);
    float y2 = mix(x3, x4, f.y);

    return mix(y1, y2, f.z);
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3D(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Fresnel rim glow
    float fresnel = 1.0 - max(dot(vNormal, vViewDir), 0.0);
    fresnel = pow(fresnel, 2.5);

    // Animated plasma surface noise
    vec3 noiseCoord = vWorldPos * 3.0 + vec3(uTime * 0.3, uTime * 0.2, uTime * -0.15);
    float plasma = fbm3(noiseCoord);
    float plasma2 = fbm3(noiseCoord * 1.5 + vec3(42.0, 17.0, -3.0));

    // Surface detail (dark veins and bright patches)
    float surfaceDetail = plasma * 0.6 + plasma2 * 0.4;
    surfaceDetail = surfaceDetail * 0.4 + 0.6; // 0.6-1.0 range

    // Base color modulated by surface noise
    vec3 baseColor = uBaseColor * surfaceDetail;

    // Pulse: brighten toward pulse color
    float pulseMix = uPulse * (0.5 + plasma * 0.5);
    vec3 pulsedColor = mix(baseColor, uPulseColor, pulseMix);

    // Rim glow (bright blue-white at edges)
    vec3 rimColor = vec3(0.7, 0.8, 1.0) * (1.0 + uEnergy * 0.5);
    vec3 finalColor = pulsedColor * (1.0 - fresnel * 0.5) + rimColor * fresnel * 1.5;

    // Inner glow: center of orb is brighter
    float innerGlow = max(dot(vNormal, vViewDir), 0.0);
    innerGlow = pow(innerGlow, 1.5);
    finalColor += uBaseColor * innerGlow * 0.3 * (1.0 + uPulse);

    // Energy intensification
    finalColor *= (1.0 + uEnergy * 0.4);

    // Emissive: fully self-lit, no external lighting needed
    float alpha = 1.0;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Shockwave ring visual (expanding torus)
interface ShockwaveVisual {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  speed: number;
  maxRadius: number;
}

export class RhythmScene {
  readonly scene: THREE.Scene;
  private particles: ParticleSystem;
  private camera: THREE.PerspectiveCamera;

  // Central orb (custom Fresnel shader)
  private orbMesh: THREE.Mesh;
  private orbMaterial: THREE.ShaderMaterial;
  private orbLight: THREE.PointLight;
  private orbGlow: THREE.Sprite;
  private orbCorona: THREE.Sprite; // large corona behind the orb
  private orbBaseScale = 1.0;
  private orbTargetScale = 1.0;
  private orbCurrentScale = 1.0;

  // Ambient
  private ambientLight: THREE.AmbientLight;
  private ambientBaseIntensity = 0.12;

  // Nebula backdrop
  private nebulaMesh: THREE.Mesh | null = null;

  // Pulse state
  private pulseTimer = 0;
  private pulseInterval = 0.8;
  private energy = 0; // accumulated energy from good taps

  // Camera orbit
  private cameraAngle = 0;
  private cameraRadius = 18;
  private cameraBaseRadius = 18;
  private cameraY = 2;

  // Visual feedback
  private flashTimer = 0;
  private flashColor = new THREE.Color(0xffffff);

  // Shockwave ring visuals
  private shockwaveVisuals: ShockwaveVisual[] = [];

  // Time
  private time = 0;

  constructor(camera: THREE.PerspectiveCamera, particles: ParticleSystem) {
    this.scene = new THREE.Scene();
    this.camera = camera;
    this.particles = particles;

    // Central orb — custom Fresnel shader material
    const orbGeo = new THREE.SphereGeometry(0.8, 48, 48);
    this.orbMaterial = new THREE.ShaderMaterial({
      vertexShader: orbVertexShader,
      fragmentShader: orbFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uEnergy: { value: 0 },
        uBaseColor: { value: new THREE.Vector3(0.15, 0.35, 0.9) },
        uPulseColor: { value: new THREE.Vector3(0.4, 0.7, 1.0) },
      },
    });
    this.orbMesh = new THREE.Mesh(orbGeo, this.orbMaterial);
    this.orbMesh.position.set(0, 0, -10);
    this.scene.add(this.orbMesh);

    // Point light inside orb
    this.orbLight = new THREE.PointLight(0x4488ff, 4, 40, 1.5);
    this.orbLight.position.copy(this.orbMesh.position);
    this.scene.add(this.orbLight);

    // Glow sprite around orb (inner halo)
    const glowTexture = this.createGlowTexture();
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x4488ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.orbGlow = new THREE.Sprite(glowMat);
    this.orbGlow.scale.set(5, 5, 1);
    this.orbGlow.position.copy(this.orbMesh.position);
    this.scene.add(this.orbGlow);

    // Large corona/halo behind the orb
    const coronaTexture = this.createCoronaTexture();
    const coronaMat = new THREE.SpriteMaterial({
      map: coronaTexture,
      color: 0x3366cc,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    });
    this.orbCorona = new THREE.Sprite(coronaMat);
    this.orbCorona.scale.set(12, 12, 1);
    this.orbCorona.position.copy(this.orbMesh.position);
    this.orbCorona.position.z -= 0.5; // slightly behind
    this.scene.add(this.orbCorona);

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x0a1030, this.ambientBaseIntensity);
    this.scene.add(this.ambientLight);

    // Nebula backdrop
    this.createNebula();

    // Add particle systems
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.getBurstPoints());

    // Enable ambient drift for zero-g feel
    this.particles.setDriftEnabled(true);
    this.particles.setDriftSpeed(0.12);

    // Arrange particles in a sphere around the orb
    this.particles.arrangeSphere(15);
  }

  private createNebula(): void {
    const geo = new THREE.PlaneGeometry(80, 80, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.2 },
        uColor: { value: new THREE.Vector3(0.1, 0.08, 0.3) },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uRadius: { value: 0.9 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.nebulaMesh = new THREE.Mesh(geo, mat);
    this.nebulaMesh.position.set(0, 0, -40);
    this.scene.add(this.nebulaMesh);
  }

  /** Create a radial gradient texture for the glow sprite */
  private createGlowTexture(): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.15, 'rgba(120, 170, 255, 0.5)');
    gradient.addColorStop(0.4, 'rgba(60, 90, 200, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 50, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /** Create a large, soft corona texture */
  private createCoronaTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, 'rgba(150, 180, 255, 0.5)');
    gradient.addColorStop(0.1, 'rgba(80, 120, 220, 0.3)');
    gradient.addColorStop(0.3, 'rgba(40, 60, 160, 0.12)');
    gradient.addColorStop(0.6, 'rgba(20, 30, 100, 0.04)');
    gradient.addColorStop(1, 'rgba(0, 0, 30, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /** Create a visible shockwave ring (expanding torus) */
  private createShockwaveRing(): THREE.Mesh {
    const geo = new THREE.TorusGeometry(0.5, 0.08, 8, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88bbff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  /** Called on each beat/pulse from the rhythm system */
  pulse(): void {
    this.pulseTimer = 0;
    this.orbTargetScale = this.orbBaseScale * 1.12;

    // Brief light pulse
    this.orbLight.intensity = 6;

    // Particle pulse
    this.particles.pulse(0.5);
  }

  /** Register a tap with accuracy 0-1 */
  registerTap(accuracy: number): void {
    const orbPos = this.orbMesh.position;

    if (accuracy > 0.8) {
      // GREAT tap — big flare + shockwave
      this.orbTargetScale = this.orbBaseScale * 1.5;
      this.orbLight.intensity = 15;
      this.orbLight.color.set(0x88ccff);

      // Particle burst — lots of particles, fast
      const burstColor = new THREE.Color(0x66bbff);
      this.particles.emitBurst(orbPos.x, orbPos.y, orbPos.z, 80, burstColor, 8);

      // Intensify nearby stars
      this.particles.intensifyNear(orbPos.x, orbPos.y, orbPos.z, 10, 1.0);

      // Big pulse
      this.particles.pulse(1.5);

      // Emit shockwave ring (visible expanding torus)
      this.spawnShockwaveVisual(orbPos, 20, 12);
      // Particle-level shockwave
      this.particles.emitShockwave(orbPos.x, orbPos.y, orbPos.z, 25, 15);

      // Energy accumulates
      this.energy = Math.min(this.energy + 0.15, 2.0);

      // Flash
      this.flashTimer = 0.15;
      this.flashColor.set(0x88ccff);

    } else if (accuracy > 0.4) {
      // OK tap — moderate response
      this.orbTargetScale = this.orbBaseScale * 1.25;
      this.orbLight.intensity = 8;

      const burstColor = new THREE.Color(0x4488cc);
      this.particles.emitBurst(orbPos.x, orbPos.y, orbPos.z, 30, burstColor, 5);
      this.particles.intensifyNear(orbPos.x, orbPos.y, orbPos.z, 6, 0.5);
      this.particles.pulse(0.8);

      // Smaller shockwave
      this.spawnShockwaveVisual(orbPos, 12, 8);
      this.particles.emitShockwave(orbPos.x, orbPos.y, orbPos.z, 15, 10);

      this.energy = Math.min(this.energy + 0.05, 2.0);
      this.flashTimer = 0.1;
      this.flashColor.set(0x4488cc);

    } else {
      // MISS — field darkens
      this.particles.setDarkenFactor(0.8);
      this.orbTargetScale = this.orbBaseScale * 0.85;
      this.orbLight.intensity = 1;

      // Energy decays
      this.energy = Math.max(this.energy - 0.1, 0);

      // Brief dark flash
      this.ambientLight.intensity = 0.02;
    }
  }

  /** Spawn a visible ring mesh that expands outward */
  private spawnShockwaveVisual(origin: THREE.Vector3, maxRadius: number, speed: number): void {
    const ring = this.createShockwaveRing();
    ring.position.copy(origin);
    // Random slight tilt for variety
    ring.rotation.x = Math.PI * 0.5 + (Math.random() - 0.5) * 0.3;
    ring.rotation.y = (Math.random() - 0.5) * 0.3;
    this.scene.add(ring);

    this.shockwaveVisuals.push({
      mesh: ring,
      life: 1.0,
      maxLife: maxRadius / speed,
      speed,
      maxRadius,
    });
  }

  /** Update loop */
  update(dt: number): void {
    const clampedDt = Math.min(dt, 0.1);
    this.time += clampedDt;

    // Update orb shader uniforms
    this.orbMaterial.uniforms.uTime.value = this.time;
    this.orbMaterial.uniforms.uEnergy.value = this.energy;

    // Pulse uniform for orb shader
    const pulseVal = this.orbMaterial.uniforms.uPulse.value;
    this.orbMaterial.uniforms.uPulse.value = Math.max(0, pulseVal - clampedDt * 4);

    // Subtle auto-pulse
    this.pulseTimer += clampedDt;
    if (this.pulseTimer > this.pulseInterval) {
      // Micro-pulse, barely visible
      this.orbTargetScale = this.orbBaseScale * 1.05;
      this.orbMaterial.uniforms.uPulse.value = 0.15;
      this.pulseTimer = 0;
    }

    // Orb scale lerp
    this.orbCurrentScale += (this.orbTargetScale - this.orbCurrentScale) * clampedDt * 8;
    this.orbTargetScale += (this.orbBaseScale - this.orbTargetScale) * clampedDt * 3;
    this.orbMesh.scale.setScalar(this.orbCurrentScale);

    // Glow scale tracks orb but bigger
    const glowSize = 5 * this.orbCurrentScale * (1 + this.energy * 0.3);
    this.orbGlow.scale.setScalar(glowSize);

    // Corona breathes with energy
    const coronaSize = 12 + this.energy * 4 + Math.sin(this.time * 0.6) * 1.5;
    this.orbCorona.scale.setScalar(coronaSize);
    (this.orbCorona.material as THREE.SpriteMaterial).opacity = 0.3 + this.energy * 0.15;

    // Light intensity decays
    this.orbLight.intensity += (4 + this.energy * 3 - this.orbLight.intensity) * clampedDt * 4;
    this.orbLight.color.lerp(new THREE.Color(0x4488ff), clampedDt * 2);

    // Ambient recovers
    const targetAmbient = this.ambientBaseIntensity + this.energy * 0.1;
    this.ambientLight.intensity += (targetAmbient - this.ambientLight.intensity) * clampedDt * 5;

    // Energy slowly decays
    this.energy *= 1.0 - clampedDt * 0.25;

    // Flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= clampedDt;
    }

    // Camera orbit — pulls closer with energy (scene intensification)
    this.cameraRadius = this.cameraBaseRadius - this.energy * 3; // closer as energy builds
    this.cameraAngle += clampedDt * 0.08 * (1 + this.energy * 0.3);
    this.camera.position.x = Math.sin(this.cameraAngle) * this.cameraRadius;
    this.camera.position.z = -10 + Math.cos(this.cameraAngle) * this.cameraRadius;
    this.camera.position.y = this.cameraY + Math.sin(this.cameraAngle * 0.5) * 0.5;
    this.camera.lookAt(this.orbMesh.position);

    // Orb base color shifts slightly with energy (blue -> cyan -> white)
    const hue = 0.58 + this.energy * 0.08;
    const orbColor = new THREE.Color().setHSL(hue, 0.8 - this.energy * 0.1, 0.45 + this.energy * 0.1);
    this.orbMaterial.uniforms.uBaseColor.value.set(orbColor.r, orbColor.g, orbColor.b);

    // Nebula intensity tracks energy
    if (this.nebulaMesh) {
      const mat = this.nebulaMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = this.time;
      mat.uniforms.uIntensity.value = 0.2 + this.energy * 0.1;
    }

    // Update shockwave visuals
    this.updateShockwaveVisuals(clampedDt);

    // Drift speed increases slightly with energy
    this.particles.setDriftSpeed(0.12 + this.energy * 0.08);
  }

  /** Update expanding shockwave ring meshes */
  private updateShockwaveVisuals(dt: number): void {
    for (let i = this.shockwaveVisuals.length - 1; i >= 0; i--) {
      const sw = this.shockwaveVisuals[i];
      sw.life -= dt / sw.maxLife;

      if (sw.life <= 0) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        (sw.mesh.material as THREE.Material).dispose();
        this.shockwaveVisuals.splice(i, 1);
        continue;
      }

      // Expand
      const progress = 1.0 - sw.life;
      const radius = sw.maxRadius * progress;
      const scale = radius / 0.5; // torus base radius is 0.5
      sw.mesh.scale.set(scale, scale, scale * 0.3); // flatten slightly as it expands

      // Fade out
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = sw.life * sw.life * 0.6;

      // Color shifts from bright white to blue as it expands
      const fadeColor = new THREE.Color().lerpColors(
        new THREE.Color(0xaaccff),
        new THREE.Color(0x223366),
        progress,
      );
      (sw.mesh.material as THREE.MeshBasicMaterial).color = fadeColor;
    }
  }

  /** Reset to initial state */
  reset(): void {
    this.energy = 0;
    this.orbCurrentScale = 1.0;
    this.orbTargetScale = 1.0;
    this.orbLight.intensity = 4;
    this.cameraAngle = 0;
    this.cameraRadius = this.cameraBaseRadius;
    this.particles.setWarpFactor(0);
    this.particles.setSizeMultiplier(1);
    this.particles.setDarkenFactor(0);
    this.particles.setDriftEnabled(true);
    this.particles.setDriftSpeed(0.12);
    this.particles.arrangeSphere(15);

    // Clean up shockwave visuals
    for (const sw of this.shockwaveVisuals) {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      (sw.mesh.material as THREE.Material).dispose();
    }
    this.shockwaveVisuals = [];
  }

  dispose(): void {
    this.orbMaterial.dispose();
    this.orbMesh.geometry.dispose();
    (this.orbGlow.material as THREE.SpriteMaterial).map?.dispose();
    (this.orbGlow.material as THREE.Material).dispose();
    (this.orbCorona.material as THREE.SpriteMaterial).map?.dispose();
    (this.orbCorona.material as THREE.Material).dispose();
    if (this.nebulaMesh) {
      (this.nebulaMesh.material as THREE.Material).dispose();
      this.nebulaMesh.geometry.dispose();
    }
    for (const sw of this.shockwaveVisuals) {
      sw.mesh.geometry.dispose();
      (sw.mesh.material as THREE.Material).dispose();
    }
  }
}
