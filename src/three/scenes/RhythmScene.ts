import * as THREE from 'three';
import { ParticleSystem } from '../systems/ParticleSystem';
import { nebulaVertexShader, nebulaFragmentShader } from '../shaders/nebula';

// ============================================================
// RhythmScene — Living cosmos with a neutron-star orb at center.
// Custom Fresnel ShaderMaterial for the orb with plasma surface,
// rim glow, inner pulsation. Shockwave rings on good taps.
// Stars drift in zero-g. Energy accumulation intensifies scene.
// Nebula backdrop adds depth.
//
// The orb PULSES visibly on the beat — the player taps when
// it expands. No beat rings. The pulse is a smooth, predictable
// expansion; the tap response is a sharp burst/flare.
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

// Transaction photon — a light particle that flies outward from the orb
// representing a transaction being sent into the network
interface TxPhoton {
  x: number; y: number; z: number;       // current position
  vx: number; vy: number; vz: number;    // velocity (direction * speed)
  age: number;                            // seconds alive
  brightness: number;                     // 0-1 initial brightness
  r: number; g: number; b: number;       // color
  // Trail: previous position for line segment
  prevX: number; prevY: number; prevZ: number;
}

const MAX_PHOTONS = 50;
const PHOTON_LIFETIME = 2.0; // seconds
const PHOTON_SPEED = 12; // units/sec

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

  // Pulse animation state — tracks the beat-driven expansion
  private pulsePhase: 'idle' | 'expanding' | 'contracting' = 'idle';
  private pulseElapsed = 0;
  private readonly pulseExpandDuration = 0.1;   // 100ms expand
  private readonly pulseContractDuration = 0.5;  // 500ms contract
  private readonly pulsePeakScale = 1.4;         // expand to 1.4x on beat
  private pulseEmissiveBoost = 0;                // 0-1 extra emissive from pulse
  private pulseGlowBoost = 0;                    // extra glow sprite scale from pulse

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

    // ----- Transaction Photon System -----
    // Points for the photon heads
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

    // Line segments for photon trails (each photon = 2 vertices = 1 line segment)
    const trailPositions = new Float32Array(MAX_PHOTONS * 2 * 3); // 2 vertices per segment
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

    // Start the visible expansion animation — smooth, predictable rhythm cue
    this.pulsePhase = 'expanding';
    this.pulseElapsed = 0;

    // Emissive boost on beat — spike to 1.0 then decay
    this.pulseEmissiveBoost = 1.0;

    // Glow sprite flash on beat
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
      // GREAT tap — sharp burst + shockwave (additive with any ongoing pulse)
      // Sharp flare: override scale briefly to a high value
      this.orbTargetScale = this.orbBaseScale * 1.6;
      this.orbLight.intensity = 18;
      this.orbLight.color.set(0x88ccff);

      // Shader pulse to max
      this.orbMaterial.uniforms.uPulse.value = 1.0;

      // Extra glow burst (additive to pulse glow)
      this.pulseGlowBoost = Math.max(this.pulseGlowBoost, 5.0);

      // Particle burst — lots of particles, fast
      const burstColor = new THREE.Color(0x66bbff);
      this.particles.emitBurst(orbPos.x, orbPos.y, orbPos.z, 80, burstColor, 8);

      // Intensify nearby stars
      this.particles.intensifyNear(orbPos.x, orbPos.y, orbPos.z, 10, 1.0);

      // Big particle pulse
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

      // Transaction photon — on-beat, bright cyan-white
      this.spawnTxPhoton(true);

    } else if (accuracy > 0.4) {
      // OK tap — moderate sharp response
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

      // Smaller shockwave
      this.spawnShockwaveVisual(orbPos, 12, 8);
      this.particles.emitShockwave(orbPos.x, orbPos.y, orbPos.z, 15, 10);

      this.energy = Math.min(this.energy + 0.05, 2.0);
      this.flashTimer = 0.1;
      this.flashColor.set(0x4488cc);

      // Transaction photon — off-beat, dimmer blue
      this.spawnTxPhoton(false);

    } else {
      // MISS — field darkens, dimmer tap effects
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

  /** Spawn a transaction photon from the orb outward */
  private spawnTxPhoton(onBeat: boolean): void {
    const orbPos = this.orbMesh.position;

    // Random radial direction in 3D (biased toward the camera plane for visibility)
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI * 0.7; // slightly flattened
    const dx = Math.cos(theta) * Math.cos(phi);
    const dy = Math.sin(phi);
    const dz = Math.sin(theta) * Math.cos(phi);

    const speed = PHOTON_SPEED * (0.8 + Math.random() * 0.4);

    // Color: cyan-white for on-beat, dimmer blue for off-beat
    let r: number, g: number, b: number;
    if (onBeat) {
      // Cyan-white
      r = 0.7 + Math.random() * 0.3;
      g = 0.9 + Math.random() * 0.1;
      b = 1.0;
    } else {
      // Dimmer blue
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

    // If pool is full, recycle oldest
    if (this.photons.length >= MAX_PHOTONS) {
      this.photons.shift();
    }
    this.photons.push(photon);
  }

  /** Update all transaction photons */
  private updatePhotons(dt: number): void {
    const posArr = this.photonGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colArr = this.photonGeometry.getAttribute('color') as THREE.BufferAttribute;
    const sizeArr = this.photonGeometry.getAttribute('size') as THREE.BufferAttribute;
    const trailPosArr = this.photonTrailGeometry.getAttribute('position') as THREE.BufferAttribute;
    const trailColArr = this.photonTrailGeometry.getAttribute('color') as THREE.BufferAttribute;

    // Remove dead photons
    this.photons = this.photons.filter(p => p.age < PHOTON_LIFETIME);

    for (let i = 0; i < this.photons.length; i++) {
      const p = this.photons[i];

      // Store previous position for trail
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;

      // Move
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Slight acceleration (photon picks up speed as it escapes)
      p.vx *= 1.0 + dt * 0.3;
      p.vy *= 1.0 + dt * 0.3;
      p.vz *= 1.0 + dt * 0.3;

      p.age += dt;

      // Fade: bright at start, fades out over lifetime
      const lifeFraction = p.age / PHOTON_LIFETIME;
      const fade = 1.0 - lifeFraction * lifeFraction; // quadratic fade
      const alpha = fade * p.brightness;

      // Update point (photon head)
      const i3 = i * 3;
      posArr.array[i3] = p.x;
      posArr.array[i3 + 1] = p.y;
      posArr.array[i3 + 2] = p.z;
      colArr.array[i3] = p.r * alpha;
      colArr.array[i3 + 1] = p.g * alpha;
      colArr.array[i3 + 2] = p.b * alpha;
      sizeArr.array[i] = 0.35 * (1.0 + (1.0 - lifeFraction) * 0.5); // slightly larger when young

      // Update trail (line from prev to current, with faded tail)
      const ti = i * 6; // 2 vertices * 3 components
      // Trail head (current position, brighter)
      trailPosArr.array[ti] = p.x;
      trailPosArr.array[ti + 1] = p.y;
      trailPosArr.array[ti + 2] = p.z;
      trailColArr.array[ti] = p.r * alpha * 0.8;
      trailColArr.array[ti + 1] = p.g * alpha * 0.8;
      trailColArr.array[ti + 2] = p.b * alpha * 0.8;

      // Trail tail (previous position, dimmer)
      // Extend the trail behind based on velocity for a more visible streak
      const trailLen = 0.08; // seconds of trail
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
      // Expanding: scale from 1.0 to pulsePeakScale over expandDuration
      const t = Math.min(this.pulseElapsed / this.pulseExpandDuration, 1.0);
      // Ease-out for snappy expansion
      const eased = 1.0 - (1.0 - t) * (1.0 - t);
      const pulseScale = this.orbBaseScale + (this.pulsePeakScale - this.orbBaseScale) * eased;

      // Apply pulse scale — this overrides the normal scale lerp for the orb
      this.orbCurrentScale = Math.max(this.orbCurrentScale, pulseScale);
      this.orbTargetScale = Math.max(this.orbTargetScale, pulseScale);

      if (t >= 1.0) {
        // Switch to contracting
        this.pulsePhase = 'contracting';
        this.pulseElapsed = 0;
      }
    } else if (this.pulsePhase === 'contracting') {
      // Contracting: scale from pulsePeakScale back to 1.0 over contractDuration
      const t = Math.min(this.pulseElapsed / this.pulseContractDuration, 1.0);
      // Ease-out for gentle landing
      const eased = 1.0 - (1.0 - t) * (1.0 - t);
      const pulseScale = this.pulsePeakScale + (this.orbBaseScale - this.pulsePeakScale) * eased;

      // Only apply if the pulse scale is still larger than what other effects want
      if (pulseScale > this.orbBaseScale) {
        this.orbTargetScale = Math.max(this.orbTargetScale, pulseScale);
      }

      if (t >= 1.0) {
        this.pulsePhase = 'idle';
      }
    }

    // Decay pulse emissive and glow boosts
    this.pulseEmissiveBoost *= 1.0 - dt * 3.0; // decay over ~0.33s
    if (this.pulseEmissiveBoost < 0.01) this.pulseEmissiveBoost = 0;

    this.pulseGlowBoost *= 1.0 - dt * 4.0; // decay over ~0.25s
    if (this.pulseGlowBoost < 0.01) this.pulseGlowBoost = 0;
  }

  /** Update loop */
  update(dt: number): void {
    const clampedDt = Math.min(dt, 0.1);
    this.time += clampedDt;

    // Update orb shader uniforms
    this.orbMaterial.uniforms.uTime.value = this.time;
    this.orbMaterial.uniforms.uEnergy.value = this.energy;

    // Pulse uniform for orb shader — decay smoothly
    const pulseVal = this.orbMaterial.uniforms.uPulse.value;
    this.orbMaterial.uniforms.uPulse.value = Math.max(0, pulseVal - clampedDt * 3);
    // Add emissive boost from pulse
    this.orbMaterial.uniforms.uPulse.value = Math.max(
      this.orbMaterial.uniforms.uPulse.value,
      this.pulseEmissiveBoost * 0.8,
    );

    // Subtle auto-pulse (very faint, keeps the orb alive between beats)
    this.pulseTimer += clampedDt;
    if (this.pulseTimer > this.pulseInterval) {
      // Micro-pulse, barely visible — NOT the beat pulse
      this.orbTargetScale = this.orbBaseScale * 1.05;
      this.orbMaterial.uniforms.uPulse.value = Math.max(
        this.orbMaterial.uniforms.uPulse.value,
        0.15,
      );
      this.pulseTimer = 0;
    }

    // Update the beat-driven pulse animation (expansion/contraction)
    this.updatePulseAnimation(clampedDt);

    // Orb scale lerp
    this.orbCurrentScale += (this.orbTargetScale - this.orbCurrentScale) * clampedDt * 8;
    this.orbTargetScale += (this.orbBaseScale - this.orbTargetScale) * clampedDt * 3;
    this.orbMesh.scale.setScalar(this.orbCurrentScale);

    // Glow scale tracks orb but bigger, plus pulse boost
    const glowSize = 5 * this.orbCurrentScale * (1 + this.energy * 0.3) + this.pulseGlowBoost;
    this.orbGlow.scale.setScalar(glowSize);

    // Corona breathes with energy
    const coronaSize = 12 + this.energy * 4 + Math.sin(this.time * 0.6) * 1.5 + this.pulseGlowBoost * 0.5;
    this.orbCorona.scale.setScalar(coronaSize);
    (this.orbCorona.material as THREE.SpriteMaterial).opacity = 0.3 + this.energy * 0.15 + this.pulseEmissiveBoost * 0.2;

    // Light intensity decays — base + energy + pulse boost
    const baseLightIntensity = 4 + this.energy * 3;
    this.orbLight.intensity += (baseLightIntensity - this.orbLight.intensity) * clampedDt * 4;
    // Add pulse spike contribution
    this.orbLight.intensity += this.pulseEmissiveBoost * 4;
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

    // Update transaction photons
    this.updatePhotons(clampedDt);

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

    // Reset pulse animation state
    this.pulsePhase = 'idle';
    this.pulseElapsed = 0;
    this.pulseEmissiveBoost = 0;
    this.pulseGlowBoost = 0;

    // Clean up shockwave visuals
    for (const sw of this.shockwaveVisuals) {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      (sw.mesh.material as THREE.Material).dispose();
    }
    this.shockwaveVisuals = [];

    // Clear photons
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
    // Dispose photon system
    this.photonGeometry.dispose();
    this.photonMaterial.dispose();
    this.photonTrailGeometry.dispose();
    this.photonTrailMaterial.dispose();
  }
}
