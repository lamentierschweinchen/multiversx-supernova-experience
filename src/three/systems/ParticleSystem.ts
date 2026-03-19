import * as THREE from 'three';
import { starVertexShader, starFragmentShader } from '../shaders/star';

// ============================================================
// ParticleSystem — galaxy-grade star particles with temperature-
// based colors, power-law sizes, multi-layer glow shaders.
// Supports pulse, scatter, gather, warp stretch, ambient drift,
// expanding shockwave rings, and burst sub-system.
// ============================================================

export interface ParticleConfig {
  count: number;
  spread: number;         // spatial spread for initial distribution
  depthRange: number;     // z-depth range for gate layout
  baseSize: number;       // base particle size
  sizeVariation: number;  // random variation multiplier
}

const DEFAULT_CONFIG: ParticleConfig = {
  count: 3000,
  spread: 40,
  depthRange: 80,
  baseSize: 2.5,
  sizeVariation: 3.0,
};

// Stellar temperature palette — realistic star colors
// Weighted distribution: 60% white-blue, 20% warm yellow, 10% orange, 10% deep blue
const STAR_TEMPERATURE_COLORS = [
  { color: new THREE.Color(0.65, 0.75, 1.0), weight: 10 },  // hot blue-white
  { color: new THREE.Color(0.95, 0.95, 1.0), weight: 25 },  // white
  { color: new THREE.Color(0.80, 0.85, 1.0), weight: 25 },  // blue-white
  { color: new THREE.Color(1.0, 0.95, 0.85), weight: 15 },  // yellow-white
  { color: new THREE.Color(1.0, 0.88, 0.65), weight: 10 },  // warm yellow
  { color: new THREE.Color(1.0, 0.72, 0.45), weight: 8 },   // orange
  { color: new THREE.Color(1.0, 0.55, 0.35), weight: 5 },   // cool red
  { color: new THREE.Color(0.45, 0.55, 1.0), weight: 2 },   // deep blue
];

// Pre-build weighted palette for O(1) random sampling
const TEMPERATURE_PALETTE: THREE.Color[] = [];
for (const entry of STAR_TEMPERATURE_COLORS) {
  for (let i = 0; i < entry.weight; i++) {
    TEMPERATURE_PALETTE.push(entry.color);
  }
}

/** Pick a random star color from temperature distribution */
function randomStarColor(): THREE.Color {
  return TEMPERATURE_PALETTE[Math.floor(Math.random() * TEMPERATURE_PALETTE.length)].clone();
}

/** Power-law size distribution — many tiny, few bright (galaxy-of-nodes formula) */
function powerLawSize(baseSize: number, variation: number): number {
  const u = Math.random();
  const powerLaw = Math.pow(u, 3.0); // cubic = heavy tail toward small
  return baseSize * 0.3 + powerLaw * variation * 2.5;
}

// Shockwave ring data (for rhythm scene tap feedback)
interface ShockwaveRing {
  cx: number; cy: number; cz: number;
  radius: number;
  maxRadius: number;
  speed: number;
  intensity: number;
  life: number;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;

  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private brightnesses: Float32Array;
  private phases: Float32Array;

  // Target positions for smooth interpolation
  private targetPositions: Float32Array | null = null;
  private lerpSpeed = 0;

  // Ambient drift velocities (zero-g floating effect)
  private velocities: Float32Array;
  private driftEnabled = false;
  private driftSpeed = 0.15;

  // Shockwave rings
  private shockwaves: ShockwaveRing[] = [];

  // Burst particles (separate system for tap feedback)
  private burstParticles: BurstParticle[] = [];

  readonly count: number;
  private config: ParticleConfig;

  constructor(config: Partial<ParticleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.count = this.config.count;

    // Allocate attribute arrays
    this.positions = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);
    this.brightnesses = new Float32Array(this.count);
    this.phases = new Float32Array(this.count);
    this.velocities = new Float32Array(this.count * 3);

    // Initialize with temperature-based star distribution
    this.initializeParticles();

    // Build geometry
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aBrightness', new THREE.BufferAttribute(this.brightnesses, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(this.phases, 1));

    // Galaxy-grade shader material with multi-layer glow
    this.material = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPulseIntensity: { value: 0 },
        uSizeMultiplier: { value: 1 },
        uWarpFactor: { value: 0 },
        uDarkenFactor: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Initialize particles with galaxy-grade star distribution */
  private initializeParticles(): void {
    const { spread, depthRange, baseSize, sizeVariation } = this.config;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // Position: spread in xy, deep in z
      this.positions[i3] = (Math.random() - 0.5) * spread;
      this.positions[i3 + 1] = (Math.random() - 0.5) * spread;
      this.positions[i3 + 2] = -Math.random() * depthRange;

      // Color: temperature-based distribution
      const color = randomStarColor();
      this.colors[i3] = color.r;
      this.colors[i3 + 1] = color.g;
      this.colors[i3 + 2] = color.b;

      // Size: power-law distribution (many tiny, few bright)
      this.sizes[i] = powerLawSize(baseSize, sizeVariation);

      // Brightness: correlate with size (bigger = brighter on average)
      const sizeNorm = this.sizes[i] / (baseSize + sizeVariation);
      this.brightnesses[i] = 0.35 + sizeNorm * 0.5 + Math.random() * 0.25;

      // Phase: random for twinkle offset
      this.phases[i] = Math.random();

      // Initial drift velocity (very slow, random direction)
      this.velocities[i3] = (Math.random() - 0.5) * 0.1;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;
    }
  }

  /** Enable/disable ambient star drift */
  setDriftEnabled(enabled: boolean): void {
    this.driftEnabled = enabled;
  }

  /** Set drift speed multiplier */
  setDriftSpeed(speed: number): void {
    this.driftSpeed = speed;
  }

  /** Arrange particles in a depth-receding starfield (for gate scene) */
  arrangeGateField(): void {
    const { spread, depthRange, baseSize, sizeVariation } = this.config;
    const target = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      // Slightly clustered toward center for vortex feel
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.6) * spread * 0.5;
      target[i3] = Math.cos(angle) * radius;
      target[i3 + 1] = Math.sin(angle) * radius;
      // Wide depth range for parallax
      target[i3 + 2] = -5 - Math.random() * depthRange * 5;

      // Refresh colors with temperature palette
      const color = randomStarColor();
      this.colors[i3] = color.r;
      this.colors[i3 + 1] = color.g;
      this.colors[i3 + 2] = color.b;

      // Power-law sizes
      this.sizes[i] = powerLawSize(baseSize, sizeVariation);

      // Brightness correlates with size
      const sizeNorm = this.sizes[i] / (baseSize + sizeVariation);
      this.brightnesses[i] = 0.35 + sizeNorm * 0.5 + Math.random() * 0.25;
    }

    this.geometry.getAttribute('aColor').needsUpdate = true;
    this.geometry.getAttribute('aSize').needsUpdate = true;
    this.geometry.getAttribute('aBrightness').needsUpdate = true;

    this.targetPositions = target;
    this.lerpSpeed = 1.5;
  }

  /** Arrange particles on a sphere surface (for rhythm scene) */
  arrangeSphere(radius: number = 15): void {
    const { baseSize, sizeVariation } = this.config;
    const target = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      // Fibonacci sphere for even distribution
      const phi = Math.acos(1 - 2 * (i + 0.5) / this.count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      // Multi-shell depth for parallax
      const shell = 0.7 + Math.random() * 0.6;
      const r = radius * shell;
      target[i3] = r * Math.sin(phi) * Math.cos(theta);
      target[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      target[i3 + 2] = r * Math.cos(phi) - 10;

      // Temperature colors for ambient stars
      const color = randomStarColor();
      this.colors[i3] = color.r;
      this.colors[i3 + 1] = color.g;
      this.colors[i3 + 2] = color.b;

      // Size variety
      this.sizes[i] = powerLawSize(baseSize * 0.8, sizeVariation * 0.6);

      // Brightness
      const sizeNorm = this.sizes[i] / (baseSize + sizeVariation);
      this.brightnesses[i] = 0.35 + sizeNorm * 0.5 + Math.random() * 0.25;

      // Randomize drift velocities
      this.velocities[i3] = (Math.random() - 0.5) * 0.08;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.08;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.04;
    }

    this.geometry.getAttribute('aColor').needsUpdate = true;
    this.geometry.getAttribute('aSize').needsUpdate = true;
    this.geometry.getAttribute('aBrightness').needsUpdate = true;

    this.targetPositions = target;
    this.lerpSpeed = 2.0;
  }

  /** Arrange as constellation — place stars at specific positions, rest scatter out */
  arrangeConstellation(
    starPositions: Array<{ x: number; y: number; size: number; color: string }>,
    viewScale: number = 8,
  ): void {
    const target = new Float32Array(this.count * 3);
    const newColors = new Float32Array(this.count * 3);
    const newSizes = new Float32Array(this.count);
    const newBrightnesses = new Float32Array(this.count);

    // Place constellation stars first
    const constellationCount = Math.min(starPositions.length, this.count);
    for (let i = 0; i < constellationCount; i++) {
      const i3 = i * 3;
      const star = starPositions[i];
      target[i3] = star.x * viewScale;
      target[i3 + 1] = star.y * viewScale;
      target[i3 + 2] = 0;

      const c = new THREE.Color(star.color);
      newColors[i3] = c.r;
      newColors[i3 + 1] = c.g;
      newColors[i3 + 2] = c.b;

      newSizes[i] = 3 + star.size * 6;
      newBrightnesses[i] = 0.8 + star.size * 0.2;
    }

    // Scatter remaining as background stars with temperature colors
    for (let i = constellationCount; i < this.count; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = 10 + Math.random() * 30;
      target[i3] = Math.cos(angle) * radius;
      target[i3 + 1] = Math.sin(angle) * radius;
      target[i3 + 2] = -5 - Math.random() * 25;

      const color = randomStarColor();
      newColors[i3] = color.r;
      newColors[i3 + 1] = color.g;
      newColors[i3 + 2] = color.b;

      newSizes[i] = powerLawSize(0.5, 1.0);
      newBrightnesses[i] = 0.1 + Math.random() * 0.3;
    }

    // Update color/size arrays immediately
    this.colors.set(newColors);
    this.sizes.set(newSizes);
    this.brightnesses.set(newBrightnesses);
    this.geometry.getAttribute('aColor').needsUpdate = true;
    this.geometry.getAttribute('aSize').needsUpdate = true;
    this.geometry.getAttribute('aBrightness').needsUpdate = true;

    this.targetPositions = target;
    this.lerpSpeed = 1.0;
  }

  /** Pulse effect — temporarily boost intensity */
  pulse(intensity: number): void {
    this.material.uniforms.uPulseIntensity.value = Math.min(intensity, 2.0);
  }

  /** Scatter particles outward from center */
  scatter(strength: number = 1): void {
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const dx = this.positions[i3];
      const dy = this.positions[i3 + 1];
      const len = Math.sqrt(dx * dx + dy * dy) + 0.01;
      this.positions[i3] += (dx / len) * strength * 0.5;
      this.positions[i3 + 1] += (dy / len) * strength * 0.5;
    }
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  /** Set warp factor (0 = normal, 1 = full warp stretch) */
  setWarpFactor(factor: number): void {
    this.material.uniforms.uWarpFactor.value = factor;
  }

  /** Set darken factor (0 = normal, 1 = darkened) for miss feedback */
  setDarkenFactor(factor: number): void {
    this.material.uniforms.uDarkenFactor.value = factor;
  }

  /** Set overall size multiplier */
  setSizeMultiplier(mult: number): void {
    this.material.uniforms.uSizeMultiplier.value = mult;
  }

  /** Intensify brightness of stars near a point (for tap hits) */
  intensifyNear(x: number, y: number, z: number, radius: number, boost: number): void {
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const dx = this.positions[i3] - x;
      const dy = this.positions[i3 + 1] - y;
      const dz = this.positions[i3 + 2] - z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < radius) {
        const factor = 1.0 - dist / radius;
        this.brightnesses[i] = Math.min(this.brightnesses[i] + boost * factor, 2.0);
      }
    }
    this.geometry.getAttribute('aBrightness').needsUpdate = true;
  }

  /** Emit an expanding shockwave ring from a point */
  emitShockwave(x: number, y: number, z: number, maxRadius: number = 25, speed: number = 15): void {
    this.shockwaves.push({
      cx: x, cy: y, cz: z,
      radius: 0.5,
      maxRadius,
      speed,
      intensity: 1.0,
      life: 1.0,
    });
  }

  /** Decay all boosted brightnesses back toward baseline — exponential decay */
  private decayBrightness(dt: number): void {
    let needsUpdate = false;
    const decayRate = Math.exp(-dt * 2.5); // exponential decay
    for (let i = 0; i < this.count; i++) {
      if (this.brightnesses[i] > 1.0) {
        this.brightnesses[i] = 1.0 + (this.brightnesses[i] - 1.0) * decayRate;
        if (this.brightnesses[i] < 1.01) this.brightnesses[i] = 1.0;
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      this.geometry.getAttribute('aBrightness').needsUpdate = true;
    }
  }

  /** Update shockwave rings and apply brightness to nearby stars */
  private updateShockwaves(dt: number): void {
    if (this.shockwaves.length === 0) return;

    let needsBrightnessUpdate = false;

    for (let s = this.shockwaves.length - 1; s >= 0; s--) {
      const sw = this.shockwaves[s];
      sw.radius += sw.speed * dt;
      sw.life -= dt * (sw.speed / sw.maxRadius);
      sw.intensity = sw.life * sw.life; // quadratic fade

      if (sw.radius > sw.maxRadius || sw.life <= 0) {
        this.shockwaves.splice(s, 1);
        continue;
      }

      // Brighten stars in the ring band
      const ringWidth = 2.0 + sw.radius * 0.15;
      const innerR = sw.radius - ringWidth * 0.5;
      const outerR = sw.radius + ringWidth * 0.5;

      for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;
        const dx = this.positions[i3] - sw.cx;
        const dy = this.positions[i3 + 1] - sw.cy;
        const dz = this.positions[i3 + 2] - sw.cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist >= innerR && dist <= outerR) {
          const ringPos = 1.0 - Math.abs(dist - sw.radius) / (ringWidth * 0.5);
          const boost = ringPos * sw.intensity * 0.8;
          this.brightnesses[i] = Math.min(this.brightnesses[i] + boost * dt * 10, 2.5);
          needsBrightnessUpdate = true;
        }
      }
    }

    if (needsBrightnessUpdate) {
      this.geometry.getAttribute('aBrightness').needsUpdate = true;
    }
  }

  /** Apply ambient drift to particle positions */
  private updateDrift(dt: number): void {
    if (!this.driftEnabled) return;

    const speed = this.driftSpeed * dt;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.positions[i3] += this.velocities[i3] * speed;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * speed;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * speed;
    }
  }

  /** Main update loop — call each frame */
  update(deltaTime: number): void {
    const dt = Math.min(deltaTime, 0.1);

    // Update time uniform
    this.material.uniforms.uTime.value += dt;

    // Lerp positions toward target if set
    if (this.targetPositions) {
      let allArrived = true;
      for (let i = 0; i < this.count * 3; i++) {
        const diff = this.targetPositions[i] - this.positions[i];
        if (Math.abs(diff) > 0.001) {
          this.positions[i] += diff * Math.min(this.lerpSpeed * dt, 1.0);
          allArrived = false;
        }
      }
      this.geometry.getAttribute('position').needsUpdate = true;
      if (allArrived) {
        this.targetPositions = null;
      }
    } else if (this.driftEnabled) {
      this.updateDrift(dt);
      this.geometry.getAttribute('position').needsUpdate = true;
    }

    // Decay pulse intensity — exponential decay
    const pulse = this.material.uniforms.uPulseIntensity.value;
    if (pulse > 0) {
      this.material.uniforms.uPulseIntensity.value = pulse * Math.exp(-dt * 3.0);
      if (this.material.uniforms.uPulseIntensity.value < 0.01) {
        this.material.uniforms.uPulseIntensity.value = 0;
      }
    }

    // Decay darken factor — exponential decay
    const darken = this.material.uniforms.uDarkenFactor.value;
    if (darken > 0) {
      this.material.uniforms.uDarkenFactor.value = darken * Math.exp(-dt * 5.0);
      if (this.material.uniforms.uDarkenFactor.value < 0.01) {
        this.material.uniforms.uDarkenFactor.value = 0;
      }
    }

    // Decay brightnesses
    this.decayBrightness(dt);

    // Update shockwave rings
    this.updateShockwaves(dt);

    // Update burst particles
    this.updateBursts(dt);
  }

  // ============================================================
  // Burst particle sub-system (for tap feedback)
  // ============================================================

  private burstGeometry: THREE.BufferGeometry | null = null;
  private burstPoints: THREE.Points | null = null;
  private burstMaterial: THREE.ShaderMaterial | null = null;
  private maxBurstParticles = 500;

  /** Get or create burst points object (add to scene) */
  getBurstPoints(): THREE.Points {
    if (this.burstPoints) return this.burstPoints;

    const positions = new Float32Array(this.maxBurstParticles * 3);
    const colors = new Float32Array(this.maxBurstParticles * 3);
    const sizes = new Float32Array(this.maxBurstParticles);
    const brightnesses = new Float32Array(this.maxBurstParticles);
    const phases = new Float32Array(this.maxBurstParticles);

    this.burstGeometry = new THREE.BufferGeometry();
    this.burstGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.burstGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.burstGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.burstGeometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightnesses, 1));
    this.burstGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.burstGeometry.setDrawRange(0, 0);

    this.burstMaterial = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      uniforms: {
        uTime: this.material.uniforms.uTime,
        uPulseIntensity: { value: 0 },
        uSizeMultiplier: { value: 1 },
        uWarpFactor: { value: 0 },
        uDarkenFactor: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.burstPoints = new THREE.Points(this.burstGeometry, this.burstMaterial);
    this.burstPoints.frustumCulled = false;
    return this.burstPoints;
  }

  /** Emit a burst of particles from a point */
  emitBurst(
    x: number, y: number, z: number,
    count: number,
    color: THREE.Color,
    speed: number = 5,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.burstParticles.length >= this.maxBurstParticles) break;

      const angle1 = Math.random() * Math.PI * 2;
      const angle2 = Math.random() * Math.PI - Math.PI / 2;
      const v = speed * (0.5 + Math.random() * 0.5);

      this.burstParticles.push({
        x, y, z,
        vx: Math.cos(angle1) * Math.cos(angle2) * v,
        vy: Math.sin(angle2) * v,
        vz: Math.sin(angle1) * Math.cos(angle2) * v,
        life: 1.0,
        decay: 0.8 + Math.random() * 0.5,
        size: 1.5 + Math.random() * 2.5,
        r: color.r,
        g: color.g,
        b: color.b,
      });
    }
  }

  private updateBursts(dt: number): void {
    if (!this.burstGeometry) return;

    const posArr = this.burstGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colArr = this.burstGeometry.getAttribute('aColor') as THREE.BufferAttribute;
    const sizeArr = this.burstGeometry.getAttribute('aSize') as THREE.BufferAttribute;
    const brightArr = this.burstGeometry.getAttribute('aBrightness') as THREE.BufferAttribute;

    // Remove dead particles
    this.burstParticles = this.burstParticles.filter(p => p.life > 0.01);

    for (let i = 0; i < this.burstParticles.length; i++) {
      const p = this.burstParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Exponential velocity decay (not linear)
      const velDecay = Math.exp(-dt * 1.5);
      p.vx *= velDecay;
      p.vy *= velDecay;
      p.vz *= velDecay;
      // Exponential life decay
      p.life *= Math.exp(-p.decay * dt);

      const i3 = i * 3;
      posArr.array[i3] = p.x;
      posArr.array[i3 + 1] = p.y;
      posArr.array[i3 + 2] = p.z;
      colArr.array[i3] = p.r;
      colArr.array[i3 + 1] = p.g;
      colArr.array[i3 + 2] = p.b;
      sizeArr.array[i] = p.size * p.life;
      brightArr.array[i] = p.life;
    }

    posArr.needsUpdate = true;
    colArr.needsUpdate = true;
    sizeArr.needsUpdate = true;
    brightArr.needsUpdate = true;
    this.burstGeometry.setDrawRange(0, this.burstParticles.length);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    if (this.burstGeometry) this.burstGeometry.dispose();
    if (this.burstMaterial) this.burstMaterial.dispose();
  }
}

interface BurstParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  decay: number;
  size: number;
  r: number; g: number; b: number;
}
