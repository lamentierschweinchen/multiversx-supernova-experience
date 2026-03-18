import * as THREE from 'three';
import { ParticleSystem } from '../systems/ParticleSystem';
import type { ConstellationData, EdgeData } from '@/lib/types';
import { nebulaVertexShader, nebulaFragmentShader } from '../shaders/nebula';

// ============================================================
// RevealScene — Animates a constellation reveal sequence:
// 1. Central star fades in (0-1s)
// 2. Validator stars bloom outward (1-3s)
// 3. Lines trace between connected stars (3-5s)
// 4. Nebula glow fills the background (5-7s)
// 5. Camera pulls back to reveal full pattern (5-8s)
// After: gentle breathing oscillation.
// ============================================================

interface AnimatedStar {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  targetScale: number;
  currentScale: number;
  delay: number; // seconds before this star starts appearing
  color: THREE.Color;
}

interface AnimatedEdge {
  line: THREE.Line;
  progress: number;       // 0 to 1
  delay: number;          // seconds before this edge starts drawing
  totalLength: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
}

const VIEW_SCALE = 8; // maps normalized [-1,1] coords to world units

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
  private cameraEndZ = 14;

  // Constellation data reference
  private constellationData: ConstellationData | null = null;

  // Glow texture (shared)
  private glowTexture: THREE.Texture;

  constructor(camera: THREE.PerspectiveCamera, particles: ParticleSystem) {
    this.scene = new THREE.Scene();
    this.camera = camera;
    this.particles = particles;

    // Shared glow texture
    this.glowTexture = this.createGlowTexture();

    // Ambient
    const ambient = new THREE.AmbientLight(0x0a0a1a, 0.3);
    this.scene.add(ambient);

    // Add particle system (background stars)
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.getBurstPoints());
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

    // Camera setup
    this.camera.position.set(0, 0, this.cameraStartZ);
    this.camera.lookAt(0, 0, 0);
  }

  private createStars(data: ConstellationData): void {
    const starGeo = new THREE.SphereGeometry(0.12, 16, 16);

    // Central star first
    if (data.centralStar) {
      this.addStar(data.centralStar, starGeo, 0);
    }

    // Validator stars with staggered delay
    data.stars.forEach((star, i) => {
      if (star.isCentral) return;
      const delay = 1.0 + (i / data.stars.length) * 2.0; // 1-3s window
      this.addStar(star, starGeo, delay);
    });
  }

  private addStar(
    star: { x: number; y: number; size: number; color: string; isCentral: boolean },
    sharedGeo: THREE.SphereGeometry,
    delay: number,
  ): void {
    const color = new THREE.Color(star.color);
    const position = new THREE.Vector3(star.x * VIEW_SCALE, star.y * VIEW_SCALE, 0);

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
      const light = new THREE.PointLight(color, 4, 20, 1.5);
      light.position.copy(position);
      this.scene.add(light);
    }

    // Glow sprite
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

    const targetScale = star.isCentral
      ? 0.4 + star.size * 0.6
      : 0.15 + star.size * 0.35;

    this.animatedStars.push({
      mesh,
      glow,
      targetScale,
      currentScale: 0,
      delay,
      color,
    });
  }

  private createEdges(data: ConstellationData): void {
    data.edges.forEach((edge, i) => {
      const fromPos = new THREE.Vector3(edge.fromX * VIEW_SCALE, edge.fromY * VIEW_SCALE, 0);
      const toPos = new THREE.Vector3(edge.toX * VIEW_SCALE, edge.toY * VIEW_SCALE, 0);

      // Compute actual positions array for the line — we'll animate by adjusting drawRange
      const segments = 30;
      const positions = new Float32Array(segments * 3);
      for (let s = 0; s < segments; s++) {
        const t = s / (segments - 1);
        positions[s * 3] = fromPos.x + (toPos.x - fromPos.x) * t;
        positions[s * 3 + 1] = fromPos.y + (toPos.y - fromPos.y) * t;
        positions[s * 3 + 2] = 0;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setDrawRange(0, 0); // initially invisible

      const color = new THREE.Color().lerpColors(
        new THREE.Color(edge.style === 'dashed' ? 0x334466 : 0x4466aa),
        new THREE.Color(0x88aaff),
        edge.opacity,
      );

      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: edge.opacity * 0.7,
        blending: THREE.AdditiveBlending,
      });

      // Dashed lines
      if (edge.style === 'dashed') {
        const dashedMat = new THREE.LineDashedMaterial({
          color,
          transparent: true,
          opacity: edge.opacity * 0.5,
          dashSize: 0.3,
          gapSize: 0.15,
          blending: THREE.AdditiveBlending,
        });
        const line = new THREE.Line(geo, dashedMat);
        line.computeLineDistances();
        this.scene.add(line);
        this.animatedEdges.push({
          line,
          progress: 0,
          delay: 3.0 + (i / data.edges.length) * 2.0,
          totalLength: fromPos.distanceTo(toPos),
          fromPos,
          toPos,
        });
      } else {
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        this.animatedEdges.push({
          line,
          progress: 0,
          delay: 3.0 + (i / data.edges.length) * 2.0,
          totalLength: fromPos.distanceTo(toPos),
          fromPos,
          toPos,
        });
      }
    });
  }

  private createNebula(data: ConstellationData): void {
    const nebula = data.nebula;
    const hueNorm = nebula.hue / 360;
    const color = new THREE.Color().setHSL(hueNorm, 0.6, 0.3);

    const geo = new THREE.PlaneGeometry(30, 30, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 }, // animated from 0
        uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
        uCenter: { value: new THREE.Vector2(
          0.5 + nebula.centerX * 0.3,
          0.5 + nebula.centerY * 0.3,
        )},
        uRadius: { value: nebula.radius * 0.8 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.nebulaMesh = new THREE.Mesh(geo, mat);
    this.nebulaMesh.position.set(0, 0, -3); // behind the constellation
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
    gradient.addColorStop(0.15, 'rgba(200, 220, 255, 0.6)');
    gradient.addColorStop(0.4, 'rgba(100, 130, 255, 0.2)');
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

    // Phase 1: Stars fade in
    for (const star of this.animatedStars) {
      const localT = Math.max(0, t - star.delay);
      if (localT <= 0) continue;

      // Scale up over 0.6s
      const scaleProgress = Math.min(localT / 0.6, 1.0);
      const eased = 1 - Math.pow(1 - scaleProgress, 3); // ease-out cubic
      star.currentScale = star.targetScale * eased;
      star.mesh.scale.setScalar(star.currentScale);

      // Glow fades in
      const glowMat = star.glow.material as THREE.SpriteMaterial;
      glowMat.opacity = Math.min(eased * 0.8, 0.8);
    }

    // Phase 2: Edges draw
    for (const edge of this.animatedEdges) {
      const localT = Math.max(0, t - edge.delay);
      if (localT <= 0) continue;

      const drawDuration = 0.8; // each edge draws over 0.8s
      edge.progress = Math.min(localT / drawDuration, 1.0);

      const segments = 30;
      const visibleSegments = Math.floor(edge.progress * segments);
      edge.line.geometry.setDrawRange(0, visibleSegments);
    }

    // Phase 3: Nebula fades in (5-7s)
    if (this.nebulaMesh && t > 5.0) {
      const nebulaT = Math.min((t - 5.0) / 2.0, 1.0);
      const mat = this.nebulaMesh.material as THREE.ShaderMaterial;
      const targetIntensity = this.constellationData?.nebula?.intensity ?? 0.5;
      mat.uniforms.uIntensity.value = targetIntensity * nebulaT;
    }

    // Phase 4: Camera pulls back (5-8s)
    if (t > 5.0) {
      const camT = Math.min((t - 5.0) / 3.0, 1.0);
      const eased = 1 - Math.pow(1 - camT, 2); // ease-out
      this.camera.position.z = this.cameraStartZ + (this.cameraEndZ - this.cameraStartZ) * eased;
      this.camera.lookAt(0, 0, 0);
    }
  }

  private updateBreathing(dt: number): void {
    this.breathPhase += dt * 0.8;

    const breathScale = 1.0 + Math.sin(this.breathPhase) * 0.03;

    for (const star of this.animatedStars) {
      // Each star breathes with a slight phase offset
      const phaseOffset = star.delay * 0.5;
      const localBreath = 1.0 + Math.sin(this.breathPhase + phaseOffset) * 0.04;
      star.mesh.scale.setScalar(star.targetScale * localBreath);

      // Glow breathes too
      const glowScale = star.glow.scale.x;
      star.glow.scale.setScalar(glowScale * (1 + (localBreath - 1) * 0.5));
    }

    // Very slow camera drift
    this.camera.position.x = Math.sin(this.breathPhase * 0.2) * 0.3;
    this.camera.position.y = Math.cos(this.breathPhase * 0.15) * 0.2;
    this.camera.lookAt(0, 0, 0);
  }

  /** Clean up animated objects (but not the scene itself) */
  private cleanup(): void {
    for (const star of this.animatedStars) {
      this.scene.remove(star.mesh);
      (star.mesh.material as THREE.Material).dispose();
      this.scene.remove(star.glow);
      (star.glow.material as THREE.Material).dispose();
    }
    this.animatedStars = [];

    for (const edge of this.animatedEdges) {
      this.scene.remove(edge.line);
      edge.line.geometry.dispose();
      (edge.line.material as THREE.Material).dispose();
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
    this.camera.position.set(0, 0, this.cameraStartZ);
  }

  dispose(): void {
    this.cleanup();
    this.glowTexture.dispose();
  }
}
