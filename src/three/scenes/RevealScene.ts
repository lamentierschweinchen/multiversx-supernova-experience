import * as THREE from 'three';
import { ParticleSystem } from '../systems/ParticleSystem';
import type { ConstellationData, EdgeData } from '@/lib/types';
import { nebulaVertexShader, nebulaFragmentShader } from '../shaders/nebula';

// ============================================================
// RevealScene — Sacred constellation reveal sequence:
// 1. Cosmos quiets (0-0.5s)
// 2. Stars ignite one by one with bloom flare (0.5-3s)
// 3. Lines trace with glowing traveling head (3-5.5s)
// 4. Nebula glow fills background (4-6s)
// 5. Camera pulls back then begins slow orbit (5-8s)
// After: gentle breathing + slow orbit around constellation.
// ============================================================

interface AnimatedStar {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  flare: THREE.Sprite; // ignition flare (temporary bright bloom)
  targetScale: number;
  currentScale: number;
  delay: number;
  color: THREE.Color;
  ignitionPhase: number; // 0 = not started, 0-1 = igniting, 1 = settled
  shard: number;
}

interface AnimatedEdge {
  line: THREE.Line;
  glowHead: THREE.Sprite; // bright point that travels along the line
  progress: number;
  delay: number;
  totalLength: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  segments: number;
}

// Line tracing shader — bright traveling head with dimmer trail
const lineVertexShader = /* glsl */ `
  attribute float aSegmentIndex;
  uniform float uProgress;
  uniform float uTotalSegments;
  varying float vIntensity;

  void main() {
    float segNorm = aSegmentIndex / uTotalSegments;

    // Head position based on progress
    float headPos = uProgress;
    float dist = abs(segNorm - headPos);

    // Bright head, dimmer trail behind, invisible ahead
    float ahead = step(headPos, segNorm); // 1 if ahead of head
    float headGlow = exp(-dist * dist * 200.0); // tight bright spot
    float trail = (1.0 - ahead) * exp(-dist * 10.0) * 0.6; // trail behind

    vIntensity = headGlow + trail;
    vIntensity *= step(0.001, uProgress); // invisible until started

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lineFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vIntensity;

  void main() {
    vec3 color = uColor * vIntensity;
    // Brighten the head to white
    color = mix(color, vec3(1.0, 0.95, 0.9), vIntensity * vIntensity);
    float alpha = vIntensity * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const VIEW_SCALE = 8; // maps normalized [-1,1] coords to world units

// Shard z-offsets for parallax depth
const SHARD_Z_OFFSETS: Record<number, number> = {
  0: 0.8,
  1: -0.5,
  2: 1.2,
  [-1]: 0, // central/meta
  4294967295: 0, // metachain
};

export class RevealScene {
  readonly scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private particles: ParticleSystem;

  private animatedStars: AnimatedStar[] = [];
  private animatedEdges: AnimatedEdge[] = [];
  private nebulaMesh: THREE.Mesh | null = null;

  // Animation timeline
  private elapsed = 0;
  private isAnimating = false;
  private isBreathing = false;
  private breathPhase = 0;

  // Camera
  private cameraStartZ = 8;
  private cameraEndZ = 16;
  private orbitAngle = 0;
  private orbitRadius = 0; // builds up during breathing

  // Constellation data reference
  private constellationData: ConstellationData | null = null;

  // Glow texture (shared)
  private glowTexture: THREE.Texture;
  private flareTexture: THREE.Texture;

  // Edge glow head texture (shared)
  private headGlowTexture: THREE.Texture;

  constructor(camera: THREE.PerspectiveCamera, particles: ParticleSystem) {
    this.scene = new THREE.Scene();
    this.camera = camera;
    this.particles = particles;

    // Shared textures
    this.glowTexture = this.createGlowTexture();
    this.flareTexture = this.createFlareTexture();
    this.headGlowTexture = this.createHeadGlowTexture();

    // Ambient
    const ambient = new THREE.AmbientLight(0x060612, 0.2);
    this.scene.add(ambient);

    // Add particle system (background stars)
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.getBurstPoints());

    // Disable drift for reveal scene (should be still/sacred)
    this.particles.setDriftEnabled(false);
  }

  /** Start the constellation reveal animation */
  showConstellation(data: ConstellationData): void {
    this.constellationData = data;
    this.cleanup();

    // Rearrange background particles
    this.particles.arrangeConstellation(
      data.stars.map(s => ({ x: s.x, y: s.y, size: s.size, color: s.color })),
      VIEW_SCALE,
    );

    // Create animated star meshes
    this.createStars(data);

    // Create animated edge lines
    this.createEdges(data);

    // Create nebula
    if (data.nebula) {
      this.createNebula(data);
    }

    // Reset animation state
    this.elapsed = 0;
    this.isAnimating = true;
    this.isBreathing = false;
    this.breathPhase = 0;
    this.orbitAngle = 0;
    this.orbitRadius = 0;

    // Camera setup
    this.camera.position.set(0, 0, this.cameraStartZ);
    this.camera.lookAt(0, 0, 0);
  }

  private createStars(data: ConstellationData): void {
    const starGeo = new THREE.SphereGeometry(0.12, 16, 16);

    // Central star first
    if (data.centralStar) {
      this.addStar(data.centralStar, starGeo, 0.5);
    }

    // Validator stars with staggered delay
    data.stars.forEach((star, i) => {
      if (star.isCentral) return;
      const delay = 0.8 + (i / data.stars.length) * 2.2; // 0.8-3s window
      this.addStar(star, starGeo, delay);
    });
  }

  private addStar(
    star: { x: number; y: number; size: number; color: string; isCentral: boolean; shard: number },
    sharedGeo: THREE.SphereGeometry,
    delay: number,
  ): void {
    const color = new THREE.Color(star.color);
    // Apply z-offset based on shard for parallax depth
    const zOffset = SHARD_Z_OFFSETS[star.shard] ?? (star.shard * 0.3 - 0.5);
    const position = new THREE.Vector3(
      star.x * VIEW_SCALE,
      star.y * VIEW_SCALE,
      zOffset,
    );

    // Star mesh
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: star.isCentral ? 3.0 : 1.5,
      roughness: 0.3,
      metalness: 0.7,
    });

    const mesh = new THREE.Mesh(sharedGeo, mat);
    mesh.position.copy(position);
    mesh.scale.setScalar(0); // starts invisible
    this.scene.add(mesh);

    // Add a point light for central star
    if (star.isCentral) {
      const light = new THREE.PointLight(color, 5, 25, 1.5);
      light.position.copy(position);
      this.scene.add(light);
    }

    // Steady glow sprite
    const glowMat = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    });
    const glow = new THREE.Sprite(glowMat);
    const glowScale = star.isCentral ? 4.0 : 1.5 + star.size * 2.0;
    glow.scale.setScalar(glowScale);
    glow.position.copy(position);
    this.scene.add(glow);

    // Ignition flare sprite (large, bright, temporary)
    const flareMat = new THREE.SpriteMaterial({
      map: this.flareTexture,
      color: new THREE.Color(1, 1, 1),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    });
    const flare = new THREE.Sprite(flareMat);
    const flareScale = star.isCentral ? 8.0 : 3.0 + star.size * 3.0;
    flare.scale.setScalar(flareScale);
    flare.position.copy(position);
    this.scene.add(flare);

    const targetScale = star.isCentral
      ? 0.4 + star.size * 0.6
      : 0.15 + star.size * 0.35;

    this.animatedStars.push({
      mesh,
      glow,
      flare,
      targetScale,
      currentScale: 0,
      delay,
      color,
      ignitionPhase: 0,
      shard: star.shard,
    });
  }

  private createEdges(data: ConstellationData): void {
    data.edges.forEach((edge, i) => {
      const fromStar = data.stars.find(s =>
        Math.abs(s.x - edge.fromX) < 0.001 && Math.abs(s.y - edge.fromY) < 0.001);
      const toStar = data.stars.find(s =>
        Math.abs(s.x - edge.toX) < 0.001 && Math.abs(s.y - edge.toY) < 0.001);

      const fromZ = fromStar ? (SHARD_Z_OFFSETS[fromStar.shard] ?? 0) : 0;
      const toZ = toStar ? (SHARD_Z_OFFSETS[toStar.shard] ?? 0) : 0;

      const fromPos = new THREE.Vector3(edge.fromX * VIEW_SCALE, edge.fromY * VIEW_SCALE, fromZ);
      const toPos = new THREE.Vector3(edge.toX * VIEW_SCALE, edge.toY * VIEW_SCALE, toZ);

      const segments = 40;
      const positions = new Float32Array(segments * 3);
      const segmentIndices = new Float32Array(segments);

      for (let s = 0; s < segments; s++) {
        const t = s / (segments - 1);
        positions[s * 3] = fromPos.x + (toPos.x - fromPos.x) * t;
        positions[s * 3 + 1] = fromPos.y + (toPos.y - fromPos.y) * t;
        positions[s * 3 + 2] = fromPos.z + (toPos.z - fromPos.z) * t;
        segmentIndices[s] = s;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aSegmentIndex', new THREE.BufferAttribute(segmentIndices, 1));

      const lineColor = new THREE.Color().lerpColors(
        new THREE.Color(edge.style === 'dashed' ? 0x334466 : 0x4466aa),
        new THREE.Color(0x88aaff),
        edge.opacity,
      );

      const mat = new THREE.ShaderMaterial({
        vertexShader: lineVertexShader,
        fragmentShader: lineFragmentShader,
        uniforms: {
          uProgress: { value: 0 },
          uTotalSegments: { value: segments - 1 },
          uColor: { value: new THREE.Vector3(lineColor.r, lineColor.g, lineColor.b) },
          uOpacity: { value: edge.opacity * 0.8 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const line = new THREE.Line(geo, mat);
      this.scene.add(line);

      // Glow head sprite
      const headMat = new THREE.SpriteMaterial({
        map: this.headGlowTexture,
        color: 0xaaccff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      });
      const glowHead = new THREE.Sprite(headMat);
      glowHead.scale.setScalar(1.0);
      glowHead.position.copy(fromPos);
      this.scene.add(glowHead);

      this.animatedEdges.push({
        line,
        glowHead,
        progress: 0,
        delay: 3.0 + (i / data.edges.length) * 2.5,
        totalLength: fromPos.distanceTo(toPos),
        fromPos,
        toPos,
        segments,
      });
    });
  }

  private createNebula(data: ConstellationData): void {
    const nebula = data.nebula;
    const hueNorm = nebula.hue / 360;
    const color = new THREE.Color().setHSL(hueNorm, 0.5, 0.25);

    const geo = new THREE.PlaneGeometry(35, 35, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
        uCenter: { value: new THREE.Vector2(
          0.5 + nebula.centerX * 0.3,
          0.5 + nebula.centerY * 0.3,
        )},
        uRadius: { value: nebula.radius * 0.9 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.nebulaMesh = new THREE.Mesh(geo, mat);
    this.nebulaMesh.position.set(0, 0, -4); // behind constellation
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
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.12, 'rgba(200, 220, 255, 0.6)');
    gradient.addColorStop(0.35, 'rgba(100, 130, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 30, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /** Ignition flare texture — larger, with subtle cross/spike pattern */
  private createFlareTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    // Base radial glow
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.05, 'rgba(220, 235, 255, 0.9)');
    gradient.addColorStop(0.15, 'rgba(150, 180, 255, 0.4)');
    gradient.addColorStop(0.4, 'rgba(80, 100, 200, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 0, 20, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add subtle cross spikes
    ctx.globalCompositeOperation = 'lighter';
    for (let angle = 0; angle < 4; angle++) {
      const a = (angle * Math.PI) / 2;
      const spikeGrad = ctx.createLinearGradient(
        cx, cy,
        cx + Math.cos(a) * size / 2, cy + Math.sin(a) * size / 2,
      );
      spikeGrad.addColorStop(0, 'rgba(200, 220, 255, 0.4)');
      spikeGrad.addColorStop(0.3, 'rgba(100, 130, 200, 0.1)');
      spikeGrad.addColorStop(1, 'rgba(0, 0, 20, 0)');

      ctx.strokeStyle = spikeGrad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * size / 2, cy + Math.sin(a) * size / 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /** Small bright glow for line trace head */
  private createHeadGlowTexture(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.2, 'rgba(180, 200, 255, 0.7)');
    gradient.addColorStop(0.5, 'rgba(80, 100, 200, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 30, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  update(dt: number): void {
    const clampedDt = Math.min(dt, 0.1);

    if (this.isAnimating) {
      this.elapsed += clampedDt;
      this.updateAnimation(clampedDt);

      // Animation complete at ~8s
      if (this.elapsed > 8.0) {
        this.isAnimating = false;
        this.isBreathing = true;
      }
    }

    if (this.isBreathing) {
      this.updateBreathing(clampedDt);
    }

    // Update nebula time
    if (this.nebulaMesh) {
      const mat = this.nebulaMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value += clampedDt;
    }
  }

  private updateAnimation(dt: number): void {
    const t = this.elapsed;

    // Phase 1: Stars ignite
    for (const star of this.animatedStars) {
      const localT = Math.max(0, t - star.delay);
      if (localT <= 0) continue;

      // Ignition over 0.4s: dim -> FLARE -> settle
      const ignitionDuration = 0.4;
      const settleStart = ignitionDuration;
      const settleDuration = 0.5;

      if (localT < ignitionDuration) {
        // Rapid scale-up + flare
        const progress = localT / ignitionDuration;
        star.ignitionPhase = progress;

        // Overshoot scale (goes to 1.5x target then settles)
        const overshoot = 1.0 + 0.8 * Math.sin(progress * Math.PI);
        star.currentScale = star.targetScale * progress * overshoot;
        star.mesh.scale.setScalar(star.currentScale);

        // Flare is brightest at peak
        const flareBrightness = Math.sin(progress * Math.PI);
        (star.flare.material as THREE.SpriteMaterial).opacity = flareBrightness * 0.9;

        // Glow fades in
        (star.glow.material as THREE.SpriteMaterial).opacity = progress * 0.6;

        // Emissive spikes during ignition
        const meshMat = star.mesh.material as THREE.MeshStandardMaterial;
        meshMat.emissiveIntensity = 1.5 + flareBrightness * 4.0;

      } else if (localT < settleStart + settleDuration) {
        // Settle to final state
        const settleProgress = (localT - settleStart) / settleDuration;
        const eased = 1 - Math.pow(1 - settleProgress, 3);

        star.currentScale = star.targetScale * (1.0 + (1.0 - eased) * 0.3);
        star.mesh.scale.setScalar(star.currentScale);

        // Flare fades out
        (star.flare.material as THREE.SpriteMaterial).opacity = (1 - eased) * 0.3;

        // Glow reaches final
        (star.glow.material as THREE.SpriteMaterial).opacity = 0.7 + eased * 0.1;

        // Emissive settles
        const meshMat = star.mesh.material as THREE.MeshStandardMaterial;
        meshMat.emissiveIntensity = 1.5 + (1 - eased) * 1.5;

        star.ignitionPhase = 1.0;
      } else {
        star.ignitionPhase = 1.0;
        star.currentScale = star.targetScale;
        star.mesh.scale.setScalar(star.currentScale);
        (star.flare.material as THREE.SpriteMaterial).opacity = 0;
        (star.glow.material as THREE.SpriteMaterial).opacity = 0.8;
      }
    }

    // Phase 2: Edges trace with glowing head
    for (const edge of this.animatedEdges) {
      const localT = Math.max(0, t - edge.delay);
      if (localT <= 0) continue;

      const drawDuration = 1.0;
      edge.progress = Math.min(localT / drawDuration, 1.0);

      // Update shader progress
      const mat = edge.line.material as THREE.ShaderMaterial;
      mat.uniforms.uProgress.value = edge.progress;

      // Move glow head along the line
      if (edge.progress > 0 && edge.progress < 1.0) {
        const headPos = edge.fromPos.clone().lerp(edge.toPos, edge.progress);
        edge.glowHead.position.copy(headPos);
        (edge.glowHead.material as THREE.SpriteMaterial).opacity = 0.9;
        edge.glowHead.scale.setScalar(1.2);
      } else if (edge.progress >= 1.0) {
        // Line fully drawn, head fades
        (edge.glowHead.material as THREE.SpriteMaterial).opacity *= 0.9;
        edge.glowHead.scale.multiplyScalar(0.95);
      }
    }

    // Phase 3: Nebula fades in (4-6s)
    if (this.nebulaMesh && t > 4.0) {
      const nebulaT = Math.min((t - 4.0) / 2.0, 1.0);
      const mat = this.nebulaMesh.material as THREE.ShaderMaterial;
      const targetIntensity = this.constellationData?.nebula?.intensity ?? 0.5;
      mat.uniforms.uIntensity.value = targetIntensity * nebulaT;
    }

    // Phase 4: Camera pulls back (5-8s)
    if (t > 5.0) {
      const camT = Math.min((t - 5.0) / 3.0, 1.0);
      const eased = 1 - Math.pow(1 - camT, 2);
      this.camera.position.z = this.cameraStartZ + (this.cameraEndZ - this.cameraStartZ) * eased;
      this.camera.lookAt(0, 0, 0);
    }
  }

  private updateBreathing(dt: number): void {
    this.breathPhase += dt * 0.8;

    // Gentle breathing on stars
    for (const star of this.animatedStars) {
      const phaseOffset = star.delay * 0.5;
      const localBreath = 1.0 + Math.sin(this.breathPhase + phaseOffset) * 0.04;
      star.mesh.scale.setScalar(star.targetScale * localBreath);

      // Glow breathes too
      const baseGlowScale = star.mesh.position.distanceTo(new THREE.Vector3()) < 2 ? 4.0 : 1.5 + star.targetScale * 4;
      star.glow.scale.setScalar(baseGlowScale * (1 + (localBreath - 1) * 0.5));
    }

    // Slow camera orbit (about 1 degree per second)
    this.orbitAngle += dt * 0.018; // ~1 deg/s
    this.orbitRadius = Math.min(this.orbitRadius + dt * 0.3, 2.5); // gradually widens

    const camZ = this.cameraEndZ * Math.cos(this.orbitAngle * 0.3);
    this.camera.position.x = Math.sin(this.orbitAngle) * this.orbitRadius;
    this.camera.position.y = Math.cos(this.breathPhase * 0.15) * 0.3;
    this.camera.position.z = this.cameraEndZ + Math.sin(this.orbitAngle * 0.5) * 0.5;
    this.camera.lookAt(0, 0, 0);
  }

  /** Clean up animated objects (but not the scene itself) */
  private cleanup(): void {
    for (const star of this.animatedStars) {
      this.scene.remove(star.mesh);
      (star.mesh.material as THREE.Material).dispose();
      this.scene.remove(star.glow);
      (star.glow.material as THREE.Material).dispose();
      this.scene.remove(star.flare);
      (star.flare.material as THREE.Material).dispose();
    }
    this.animatedStars = [];

    for (const edge of this.animatedEdges) {
      this.scene.remove(edge.line);
      edge.line.geometry.dispose();
      (edge.line.material as THREE.Material).dispose();
      this.scene.remove(edge.glowHead);
      (edge.glowHead.material as THREE.Material).dispose();
    }
    this.animatedEdges = [];

    if (this.nebulaMesh) {
      this.scene.remove(this.nebulaMesh);
      (this.nebulaMesh.material as THREE.Material).dispose();
      this.nebulaMesh.geometry.dispose();
      this.nebulaMesh = null;
    }
  }

  reset(): void {
    this.cleanup();
    this.elapsed = 0;
    this.isAnimating = false;
    this.isBreathing = false;
    this.orbitAngle = 0;
    this.orbitRadius = 0;
    this.camera.position.set(0, 0, this.cameraStartZ);
  }

  dispose(): void {
    this.cleanup();
    this.glowTexture.dispose();
    this.flareTexture.dispose();
    this.headGlowTexture.dispose();
  }
}
