import * as THREE from 'three';
import { ParticleSystem } from '../systems/ParticleSystem';

// ============================================================
// GateScene — Full-screen 3D starfield with gravitational vortex.
// Stars recede into depth, gently rotating. A central vortex
// pulls them inward with a radial distortion feel.
// On enterWarp(): camera rockets forward, stars streak.
// ============================================================

/** Easing: cubic ease-in */
function easeInCubic(t: number): number {
  return t * t * t;
}

/** Easing: quartic ease-in-out */
function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

export class GateScene {
  readonly scene: THREE.Scene;
  private particles: ParticleSystem;
  private camera: THREE.PerspectiveCamera;

  // Vortex mesh — a subtle spiral overlay
  private vortexMesh: THREE.Mesh | null = null;

  // Camera drift state
  private driftAngle = 0;
  private driftRadius = 0.3;

  // Warp animation state
  private isWarping = false;
  private warpProgress = 0;
  private warpDuration = 3.5; // seconds
  private warpCallback: (() => void) | null = null;
  private cameraStartZ = 0;

  // Ambient slow rotation of the entire field
  private fieldRotation = 0;

  constructor(camera: THREE.PerspectiveCamera, particles: ParticleSystem) {
    this.scene = new THREE.Scene();
    this.camera = camera;
    this.particles = particles;

    this.setup();
  }

  private setup(): void {
    // Add particle system to scene
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.getBurstPoints());

    // Arrange stars in depth formation
    this.particles.arrangeGateField();

    // Create a subtle vortex glow at the center
    this.createVortex();

    // Very faint ambient light
    const ambient = new THREE.AmbientLight(0x111122, 0.5);
    this.scene.add(ambient);

    // Store camera start position
    this.cameraStartZ = this.camera.position.z;
  }

  private createVortex(): void {
    // A translucent spiral disc at z = -40
    const geo = new THREE.PlaneGeometry(12, 12, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          vec2 center = vUv - 0.5;
          float dist = length(center);
          float angle = atan(center.y, center.x);

          // Spiral arms
          float spiral = sin(angle * 3.0 - dist * 15.0 + uTime * 1.5) * 0.5 + 0.5;
          spiral *= smoothstep(0.5, 0.05, dist);

          // Core glow
          float core = exp(-dist * dist * 30.0);

          // Outer ring hint
          float ring = exp(-pow(dist - 0.3, 2.0) * 80.0) * 0.3;

          float alpha = (spiral * 0.15 + core * 0.6 + ring) * smoothstep(0.5, 0.1, dist);

          // Purple-blue-cyan gradient
          vec3 color = mix(
            vec3(0.1, 0.3, 1.0),
            vec3(0.5, 0.2, 0.9),
            spiral
          );
          color = mix(color, vec3(0.8, 0.9, 1.0), core * 0.5);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.vortexMesh = new THREE.Mesh(geo, mat);
    this.vortexMesh.position.set(0, 0, -40);
    this.scene.add(this.vortexMesh);
  }

  /** Start the warp transition. Callback fires when complete. */
  enterWarp(onComplete: () => void): void {
    if (this.isWarping) return;
    this.isWarping = true;
    this.warpProgress = 0;
    this.warpCallback = onComplete;
    this.cameraStartZ = this.camera.position.z;
  }

  /** Update loop — call each frame with deltaTime in seconds */
  update(dt: number): void {
    const clampedDt = Math.min(dt, 0.1);

    // Update vortex shader time
    if (this.vortexMesh) {
      const mat = this.vortexMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value += clampedDt;
    }

    if (this.isWarping) {
      this.updateWarp(clampedDt);
    } else {
      this.updateIdle(clampedDt);
    }
  }

  private updateIdle(dt: number): void {
    // Gentle camera drift in a circle
    this.driftAngle += dt * 0.15;
    this.camera.position.x = Math.sin(this.driftAngle) * this.driftRadius;
    this.camera.position.y = Math.cos(this.driftAngle * 0.7) * this.driftRadius * 0.6;

    // Slow field rotation
    this.fieldRotation += dt * 0.02;
    this.particles.points.rotation.z = this.fieldRotation;

    // Camera looks slightly toward center
    this.camera.lookAt(0, 0, -20);
  }

  private updateWarp(dt: number): void {
    this.warpProgress += dt / this.warpDuration;

    if (this.warpProgress >= 1.0) {
      this.warpProgress = 1.0;
      this.isWarping = false;
      if (this.warpCallback) {
        this.warpCallback();
        this.warpCallback = null;
      }
      return;
    }

    const t = this.warpProgress;

    // Camera accelerates forward (ease-in cubic)
    const zTravel = -120; // total z distance
    const easedT = easeInCubic(t);
    this.camera.position.z = this.cameraStartZ + zTravel * easedT;

    // Narrow FOV for tunnel feel (60 -> 30 -> snap back)
    const fovT = easeInOutQuart(t);
    this.camera.fov = 60 - 30 * fovT;
    this.camera.updateProjectionMatrix();

    // Warp factor ramps up
    const warpFactor = easeInCubic(Math.min(t * 1.5, 1.0));
    this.particles.setWarpFactor(warpFactor);

    // Increase particle size during warp for streak visibility
    this.particles.setSizeMultiplier(1.0 + warpFactor * 2.0);

    // Faster field rotation during warp
    this.fieldRotation += dt * (0.02 + warpFactor * 0.8);
    this.particles.points.rotation.z = this.fieldRotation;

    // Vortex scales up and fades
    if (this.vortexMesh) {
      const scale = 1.0 + easedT * 5.0;
      this.vortexMesh.scale.set(scale, scale, 1);
      (this.vortexMesh.material as THREE.ShaderMaterial).opacity = 1.0 - easedT;
    }

    // Camera drift dampens during warp
    this.camera.position.x *= 1.0 - dt * 3;
    this.camera.position.y *= 1.0 - dt * 3;
    this.camera.lookAt(0, 0, this.camera.position.z - 20);
  }

  /** Reset scene state (for re-entry or restart) */
  reset(): void {
    this.isWarping = false;
    this.warpProgress = 0;
    this.particles.setWarpFactor(0);
    this.particles.setSizeMultiplier(1);
    this.camera.position.set(0, 0, 5);
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.fieldRotation = 0;
    this.driftAngle = 0;
    this.particles.arrangeGateField();
    if (this.vortexMesh) {
      this.vortexMesh.scale.set(1, 1, 1);
    }
  }

  dispose(): void {
    if (this.vortexMesh) {
      (this.vortexMesh.material as THREE.Material).dispose();
      this.vortexMesh.geometry.dispose();
    }
  }
}
