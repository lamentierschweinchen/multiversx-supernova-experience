import * as THREE from 'three';
import { ParticleSystem } from '../systems/ParticleSystem';
import { nebulaVertexShader, nebulaFragmentShader } from '../shaders/nebula';

// ============================================================
// RhythmScene — Living cosmos with metachain-style Fresnel orb.
// Galaxy-of-nodes MetachainCore visual: animated noise surface,
// Fresnel rim glow, inner radial gradient, additive blending.
// Exponential decay for all pulse effects. Galaxy-grade star glow
// for background particles. Deep navy background.
// ============================================================

// Metachain-style orb vertex shader (from galaxy-of-nodes)
const orbVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Metachain-style orb fragment shader (ported from galaxy-of-nodes)
const orbFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  uniform float uTime;
  uniform float uPulse;       // 0-1 pulse intensity
  uniform float uEnergy;      // 0-2 accumulated energy

  // Simple 2D hash for noise
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // 2-octave FBM
  float fbm(vec2 p) {
    float v = 0.0;
    v += noise(p) * 0.5;
    v += noise(p * 2.1 + 0.5) * 0.25;
    return v;
  }

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float NdotV = dot(viewDir, vNormal);
    float fresnel = 1.0 - abs(NdotV);

    // Animated surface ripple
    vec2 noiseCoord = vUv * 4.0 + vec2(uTime * 0.1, uTime * 0.07);
    float surfaceNoise = fbm(noiseCoord) * 0.3;

    // Soft radial gradient: hot center -> transparent edges
    float coreBrightness = pow(max(NdotV, 0.0), 0.8);

    // Rim glow: soft blue-white at edges
    vec3 coreColor = vec3(1.0, 0.98, 0.95);
    vec3 rimColor = vec3(0.6, 0.78, 1.0);

    // Energy shifts rim color toward cyan-white
    rimColor = mix(rimColor, vec3(0.7, 0.9, 1.0), uEnergy * 0.3);

    vec3 baseColor = mix(rimColor, coreColor, coreBrightness);
    baseColor += surfaceNoise * 0.1;

    // Fresnel rim — soft atmospheric edge glow
    float rimGlow = pow(fresnel, 3.0) * 0.8;

    // Pulse modulation (exponential decay applied externally)
    float pulse = 0.7 + uPulse * 0.5;

    // Alpha: soft falloff from center, rim glow adds atmosphere
    float alpha = (coreBrightness * 0.6 + rimGlow * 0.4) * pulse;

    // Energy intensification
    alpha *= (1.0 + uEnergy * 0.3);

    vec3 finalColor = baseColor * coreBrightness * pulse;
    // Atmospheric rim
    finalColor += rimColor * rimGlow * 0.6;
    // Energy boost
    finalColor *= (1.0 + uEnergy * 0.4);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// Shockwave ring visual
interface ShockwaveVisual {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  speed: number;
  maxRadius: number;
}

// Transaction photon
interface TxPhoton {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number;
  brightness: number;
  r: number; g: number; b: number;
  prevX: number; prevY: number; prevZ: number;
}

const MAX_PHOTONS = 50;
const PHOTON_LIFETIME = 2.0;
const PHOTON_SPEED = 12;

export class RhythmScene {
  readonly scene: THREE.Scene;
  private particles: ParticleSystem;
  private camera: THREE.PerspectiveCamera;

  // Central orb — metachain-style Fresnel shader
  private orbMesh: THREE.Mesh;
  private orbMaterial: THREE.ShaderMaterial;
  private orbLight: THREE.PointLight;
  private orbGlow: THREE.Sprite;
  private orbCorona: THREE.Sprite;
  private orbBaseScale = 1.0;
  private orbTargetScale = 1.0;
  private orbCurrentScale = 1.0;

  // Pulse animation state
  private pulsePhase: 'idle' | 'expanding' | 'contracting' = 'idle';
  private pulseElapsed = 0;
  private readonly pulseExpandDuration = 0.1;
  private readonly pulseContractDuration = 0.5;
  private readonly pulsePeakScale = 1.4;
  private pulseEmissiveBoost = 0;
  private pulseGlowBoost = 0;

  // Ambient
  private ambientLight: THREE.AmbientLight;
  private ambientBaseIntensity = 0.02;

  // Nebula backdrop
  private nebulaMesh: THREE.Mesh | null = null;

  // Pulse state
  private pulseTimer = 0;
  private pulseInterval = 0.8;
  private energy = 0;

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

  // Transaction photon system
  private photons: TxPhoton[] = [];
  private photonPoints: THREE.Points;
  private photonGeometry: THREE.BufferGeometry;
  private photonMaterial: THREE.PointsMaterial;
  private photonTrailLines: THREE.LineSegments;
  private photonTrailGeometry: THREE.BufferGeometry;
  private photonTrailMaterial: THREE.LineBasicMaterial;

  // Time
  private time = 0;

  constructor(camera: THREE.PerspectiveCamera, particles: ParticleSystem) {
    this.scene = new THREE.Scene();
    this.camera = camera;
    this.particles = particles;

    // Central orb — metachain-style Fresnel shader (galaxy-of-nodes pattern)
    const orbGeo = new THREE.SphereGeometry(0.8, 48, 48);
    this.orbMaterial = new THREE.ShaderMaterial({
      vertexShader: orbVertexShader,
      fragmentShader: orbFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0.5 },
        uEnergy: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
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
    this.orbCorona.position.z -= 0.5;
    this.scene.add(this.orbCorona);

    // Ambient light (galaxy-of-nodes standard — deep navy tone)
    this.ambientLight = new THREE.AmbientLight(0x050510, 0.02);
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

    // ----- Transaction Photon System -----
    const photonPositions = new Float32Array(MAX_PHOTONS * 3);
    const photonColors = new Float32Array(MAX_PHOTONS * 3);
    const photonSizes = new Float32Array(MAX_PHOTONS);
    this.photonGeometry = new THREE.BufferGeometry();
    this.photonGeometry.setAttribute('position', new THREE.BufferAttribute(photonPositions, 3));
    this.photonGeometry.setAttribute('color', new THREE.BufferAttribute(photonColors, 3));
    this.photonGeometry.setAttribute('size', new THREE.BufferAttribute(photonSizes, 1));
    this.photonGeometry.setDrawRange(0, 0);

    this.photonMaterial = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.photonPoints = new THREE.Points(this.photonGeometry, this.photonMaterial);
    this.photonPoints.frustumCulled = false;
    this.scene.add(this.photonPoints);

    // Line segments for photon trails
    const trailPositions = new Float32Array(MAX_PHOTONS * 2 * 3);
    const trailColors = new Float32Array(MAX_PHOTONS * 2 * 3);
    this.photonTrailGeometry = new THREE.BufferGeometry();
    this.photonTrailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    this.photonTrailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    this.photonTrailGeometry.setDrawRange(0, 0);

    this.photonTrailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1,
    });
    this.photonTrailLines = new THREE.LineSegments(this.photonTrailGeometry, this.photonTrailMaterial);
    this.photonTrailLines.frustumCulled = false;
    this.scene.add(this.photonTrailLines);
  }

  private createNebula(): void {
    const geo = new THREE.PlaneGeometry(80, 80, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.2 },
        uColor: { value: new THREE.Vector3(0.22, 0.1, 0.28) },
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
    gradient.addColorStop(1, 'rgba(5, 5, 16, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

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
    gradient.addColorStop(1, 'rgba(5, 5, 16, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

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

    // Start visible expansion animation
    this.pulsePhase = 'expanding';
    this.pulseElapsed = 0;

    // Emissive boost on beat (exponential decay applied in update)
    this.pulseEmissiveBoost = 1.0;
    this.pulseGlowBoost = 3.0;

    // Shader pulse uniform spike
    this.orbMaterial.uniforms.uPulse.value = 0.7;

    // Light intensity spike
    this.orbLight.intensity = 8;

    // Particle pulse (subtle)
    this.particles.pulse(0.5);
  }

  /** Register a tap with accuracy 0-1 */
  registerTap(accuracy: number): void {
    const orbPos = this.orbMesh.position;

    if (accuracy > 0.8) {
      // GREAT tap
      this.orbTargetScale = this.orbBaseScale * 1.6;
      this.orbLight.intensity = 18;
      this.orbLight.color.set(0x88ccff);

      this.orbMaterial.uniforms.uPulse.value = 1.0;
      this.pulseGlowBoost = Math.max(this.pulseGlowBoost, 5.0);

      const burstColor = new THREE.Color(0x66bbff);
      this.particles.emitBurst(orbPos.x, orbPos.y, orbPos.z, 80, burstColor, 8);
      this.particles.intensifyNear(orbPos.x, orbPos.y, orbPos.z, 10, 1.0);
      this.particles.pulse(1.5);

      this.spawnShockwaveVisual(orbPos, 20, 12);
      this.particles.emitShockwave(orbPos.x, orbPos.y, orbPos.z, 25, 15);

      this.energy = Math.min(this.energy + 0.15, 2.0);
      this.flashTimer = 0.15;
      this.flashColor.set(0x88ccff);
      this.spawnTxPhoton(true);

    } else if (accuracy > 0.4) {
      // OK tap
      this.orbTargetScale = this.orbBaseScale * 1.35;
      this.orbLight.intensity = 10;

      this.orbMaterial.uniforms.uPulse.value = Math.max(
        this.orbMaterial.uniforms.uPulse.value,
        0.5,
      );
      this.pulseGlowBoost = Math.max(this.pulseGlowBoost, 3.0);

      const burstColor = new THREE.Color(0x4488cc);
      this.particles.emitBurst(orbPos.x, orbPos.y, orbPos.z, 30, burstColor, 5);
      this.particles.intensifyNear(orbPos.x, orbPos.y, orbPos.z, 6, 0.5);
      this.particles.pulse(0.8);

      this.spawnShockwaveVisual(orbPos, 12, 8);
      this.particles.emitShockwave(orbPos.x, orbPos.y, orbPos.z, 15, 10);

      this.energy = Math.min(this.energy + 0.05, 2.0);
      this.flashTimer = 0.1;
      this.flashColor.set(0x4488cc);
      this.spawnTxPhoton(false);

    } else {
      // MISS — field darkens
      this.particles.setDarkenFactor(0.8);
      this.orbTargetScale = this.orbBaseScale * 0.85;
      this.orbLight.intensity = 1;
      this.energy = Math.max(this.energy - 0.1, 0);
      this.ambientLight.intensity = 0.02;
    }
  }

  private spawnShockwaveVisual(origin: THREE.Vector3, maxRadius: number, speed: number): void {
    const ring = this.createShockwaveRing();
    ring.position.copy(origin);
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

  private spawnTxPhoton(onBeat: boolean): void {
    const orbPos = this.orbMesh.position;

    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI * 0.7;
    const dx = Math.cos(theta) * Math.cos(phi);
    const dy = Math.sin(phi);
    const dz = Math.sin(theta) * Math.cos(phi);

    const speed = PHOTON_SPEED * (0.8 + Math.random() * 0.4);

    let r: number, g: number, b: number;
    if (onBeat) {
      r = 0.7 + Math.random() * 0.3;
      g = 0.9 + Math.random() * 0.1;
      b = 1.0;
    } else {
      r = 0.3 + Math.random() * 0.15;
      g = 0.5 + Math.random() * 0.2;
      b = 0.8 + Math.random() * 0.2;
    }

    const photon: TxPhoton = {
      x: orbPos.x, y: orbPos.y, z: orbPos.z,
      vx: dx * speed,
      vy: dy * speed,
      vz: dz * speed,
      age: 0,
      brightness: onBeat ? 1.0 : 0.6,
      r, g, b,
      prevX: orbPos.x, prevY: orbPos.y, prevZ: orbPos.z,
    };

    if (this.photons.length >= MAX_PHOTONS) {
      this.photons.shift();
    }
    this.photons.push(photon);
  }

  private updatePhotons(dt: number): void {
    const posArr = this.photonGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colArr = this.photonGeometry.getAttribute('color') as THREE.BufferAttribute;
    const sizeArr = this.photonGeometry.getAttribute('size') as THREE.BufferAttribute;
    const trailPosArr = this.photonTrailGeometry.getAttribute('position') as THREE.BufferAttribute;
    const trailColArr = this.photonTrailGeometry.getAttribute('color') as THREE.BufferAttribute;

    this.photons = this.photons.filter(p => p.age < PHOTON_LIFETIME);

    for (let i = 0; i < this.photons.length; i++) {
      const p = this.photons[i];

      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Slight acceleration
      p.vx *= 1.0 + dt * 0.3;
      p.vy *= 1.0 + dt * 0.3;
      p.vz *= 1.0 + dt * 0.3;

      p.age += dt;

      // Exponential fade (not linear)
      const fade = Math.exp(-p.age * 1.5);
      const alpha = fade * p.brightness;

      const i3 = i * 3;
      posArr.array[i3] = p.x;
      posArr.array[i3 + 1] = p.y;
      posArr.array[i3 + 2] = p.z;
      colArr.array[i3] = p.r * alpha;
      colArr.array[i3 + 1] = p.g * alpha;
      colArr.array[i3 + 2] = p.b * alpha;
      sizeArr.array[i] = 0.35 * (1.0 + fade * 0.5);

      const ti = i * 6;
      trailPosArr.array[ti] = p.x;
      trailPosArr.array[ti + 1] = p.y;
      trailPosArr.array[ti + 2] = p.z;
      trailColArr.array[ti] = p.r * alpha * 0.8;
      trailColArr.array[ti + 1] = p.g * alpha * 0.8;
      trailColArr.array[ti + 2] = p.b * alpha * 0.8;

      const trailLen = 0.08;
      trailPosArr.array[ti + 3] = p.x - p.vx * trailLen;
      trailPosArr.array[ti + 4] = p.y - p.vy * trailLen;
      trailPosArr.array[ti + 5] = p.z - p.vz * trailLen;
      trailColArr.array[ti + 3] = p.r * alpha * 0.2;
      trailColArr.array[ti + 4] = p.g * alpha * 0.2;
      trailColArr.array[ti + 5] = p.b * alpha * 0.2;
    }

    posArr.needsUpdate = true;
    colArr.needsUpdate = true;
    sizeArr.needsUpdate = true;
    trailPosArr.needsUpdate = true;
    trailColArr.needsUpdate = true;

    this.photonGeometry.setDrawRange(0, this.photons.length);
    this.photonTrailGeometry.setDrawRange(0, this.photons.length * 2);
  }

  /** Update the orb pulse expansion/contraction animation */
  private updatePulseAnimation(dt: number): void {
    if (this.pulsePhase === 'idle') return;

    this.pulseElapsed += dt;

    if (this.pulsePhase === 'expanding') {
      const t = Math.min(this.pulseElapsed / this.pulseExpandDuration, 1.0);
      const eased = 1.0 - (1.0 - t) * (1.0 - t);
      const pulseScale = this.orbBaseScale + (this.pulsePeakScale - this.orbBaseScale) * eased;

      this.orbCurrentScale = Math.max(this.orbCurrentScale, pulseScale);
      this.orbTargetScale = Math.max(this.orbTargetScale, pulseScale);

      if (t >= 1.0) {
        this.pulsePhase = 'contracting';
        this.pulseElapsed = 0;
      }
    } else if (this.pulsePhase === 'contracting') {
      const t = Math.min(this.pulseElapsed / this.pulseContractDuration, 1.0);
      const eased = 1.0 - (1.0 - t) * (1.0 - t);
      const pulseScale = this.pulsePeakScale + (this.orbBaseScale - this.pulsePeakScale) * eased;

      if (pulseScale > this.orbBaseScale) {
        this.orbTargetScale = Math.max(this.orbTargetScale, pulseScale);
      }

      if (t >= 1.0) {
        this.pulsePhase = 'idle';
      }
    }

    // Exponential decay for pulse emissive and glow boosts
    this.pulseEmissiveBoost *= Math.exp(-dt * 4.0);
    if (this.pulseEmissiveBoost < 0.01) this.pulseEmissiveBoost = 0;

    this.pulseGlowBoost *= Math.exp(-dt * 5.0);
    if (this.pulseGlowBoost < 0.01) this.pulseGlowBoost = 0;
  }

  /** Update loop */
  update(dt: number): void {
    const clampedDt = Math.min(dt, 0.1);
    this.time += clampedDt;

    // Update orb shader uniforms
    this.orbMaterial.uniforms.uTime.value = this.time;
    this.orbMaterial.uniforms.uEnergy.value = this.energy;

    // Pulse uniform — exponential decay
    const pulseVal = this.orbMaterial.uniforms.uPulse.value;
    this.orbMaterial.uniforms.uPulse.value = pulseVal * Math.exp(-clampedDt * 3);
    // Add emissive boost from pulse
    this.orbMaterial.uniforms.uPulse.value = Math.max(
      this.orbMaterial.uniforms.uPulse.value,
      this.pulseEmissiveBoost * 0.8,
    );

    // Subtle auto-pulse (keeps orb alive between beats)
    this.pulseTimer += clampedDt;
    if (this.pulseTimer > this.pulseInterval) {
      this.orbTargetScale = this.orbBaseScale * 1.05;
      this.orbMaterial.uniforms.uPulse.value = Math.max(
        this.orbMaterial.uniforms.uPulse.value,
        0.15,
      );
      this.pulseTimer = 0;
    }

    // Update beat-driven pulse animation
    this.updatePulseAnimation(clampedDt);

    // Orb scale lerp
    this.orbCurrentScale += (this.orbTargetScale - this.orbCurrentScale) * clampedDt * 8;
    this.orbTargetScale += (this.orbBaseScale - this.orbTargetScale) * clampedDt * 3;
    this.orbMesh.scale.setScalar(this.orbCurrentScale);

    // MetachainCore-style ambient scale oscillation
    const ambientScale = 1.0 + 0.03 * Math.sin(this.time * 2.0);
    this.orbMesh.scale.multiplyScalar(ambientScale);

    // Glow scale tracks orb
    const glowSize = 5 * this.orbCurrentScale * (1 + this.energy * 0.3) + this.pulseGlowBoost;
    this.orbGlow.scale.setScalar(glowSize);

    // Corona breathes with energy
    const coronaSize = 12 + this.energy * 4 + Math.sin(this.time * 0.6) * 1.5 + this.pulseGlowBoost * 0.5;
    this.orbCorona.scale.setScalar(coronaSize);
    (this.orbCorona.material as THREE.SpriteMaterial).opacity = 0.3 + this.energy * 0.15 + this.pulseEmissiveBoost * 0.2;

    // Light intensity — exponential decay to base
    const baseLightIntensity = 4 + this.energy * 3;
    const lightDecay = Math.exp(-clampedDt * 4);
    this.orbLight.intensity = baseLightIntensity + (this.orbLight.intensity - baseLightIntensity) * lightDecay;
    this.orbLight.intensity += this.pulseEmissiveBoost * 4;
    this.orbLight.color.lerp(new THREE.Color(0x4488ff), clampedDt * 2);

    // Ambient recovers
    const targetAmbient = this.ambientBaseIntensity + this.energy * 0.1;
    this.ambientLight.intensity += (targetAmbient - this.ambientLight.intensity) * clampedDt * 5;

    // Energy slowly decays (exponential)
    this.energy *= Math.exp(-clampedDt * 0.25);

    // Flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= clampedDt;
    }

    // Camera orbit — galaxy auto-orbit style
    this.cameraRadius = this.cameraBaseRadius - this.energy * 3;
    this.cameraAngle += clampedDt * 0.08 * (1 + this.energy * 0.3);
    this.camera.position.x = Math.sin(this.cameraAngle) * this.cameraRadius;
    this.camera.position.z = -10 + Math.cos(this.cameraAngle) * this.cameraRadius;
    this.camera.position.y = this.cameraY + Math.sin(this.cameraAngle * 0.5) * 0.5;
    this.camera.lookAt(this.orbMesh.position);

    // Orb base color shifts with energy (blue -> cyan -> white)
    const hue = 0.58 + this.energy * 0.08;
    const orbColor = new THREE.Color().setHSL(hue, 0.8 - this.energy * 0.1, 0.45 + this.energy * 0.1);
    // Modulate the glow sprite color to track energy
    (this.orbGlow.material as THREE.SpriteMaterial).color.copy(orbColor);

    // Nebula intensity tracks energy
    if (this.nebulaMesh) {
      const mat = this.nebulaMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = this.time;
      mat.uniforms.uIntensity.value = 0.2 + this.energy * 0.1;
    }

    // Update shockwave visuals
    this.updateShockwaveVisuals(clampedDt);

    // Update transaction photons
    this.updatePhotons(clampedDt);

    // Drift speed increases with energy
    this.particles.setDriftSpeed(0.12 + this.energy * 0.08);
  }

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

      const progress = 1.0 - sw.life;
      const radius = sw.maxRadius * progress;
      const scale = radius / 0.5;
      sw.mesh.scale.set(scale, scale, scale * 0.3);

      // Exponential opacity decay
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = sw.life * sw.life * 0.6;

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

    this.pulsePhase = 'idle';
    this.pulseElapsed = 0;
    this.pulseEmissiveBoost = 0;
    this.pulseGlowBoost = 0;

    for (const sw of this.shockwaveVisuals) {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      (sw.mesh.material as THREE.Material).dispose();
    }
    this.shockwaveVisuals = [];

    this.photons = [];
    this.photonGeometry.setDrawRange(0, 0);
    this.photonTrailGeometry.setDrawRange(0, 0);
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
    this.photonGeometry.dispose();
    this.photonMaterial.dispose();
    this.photonTrailGeometry.dispose();
    this.photonTrailMaterial.dispose();
  }
}
