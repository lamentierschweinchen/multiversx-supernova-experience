import * as THREE from 'three';
import { ParticleSystem } from '../systems/ParticleSystem';
import { nebulaVertexShader, nebulaFragmentShader } from '../shaders/nebula';

// ============================================================
// GateScene — Cinematic deep-space entry. You float among stars
// of varying temperatures and sizes. A distant nebula glows.
// A gravitational vortex at the center pulses with point light
// and glow sprites. Camera drifts for parallax. On warp, stars
// leave trails, camera shakes, colors shift to blue-white.
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

  // Vortex core (point light + glow sprite + subtle mesh)
  private vortexLight: THREE.PointLight;
  private vortexGlow: THREE.Sprite;
  private vortexCoreMesh: THREE.Mesh | null = null;
  private vortexRingMesh: THREE.Mesh | null = null;

  // Nebula backdrop
  private nebulaMesh: THREE.Mesh | null = null;

  // Camera drift state
  private driftAngle = 0;
  private driftRadius = 0.5;

  // Warp animation state
  private isWarping = false;
  private warpProgress = 0;
  private warpDuration = 3.5; // seconds
  private warpCallback: (() => void) | null = null;
  private cameraStartZ = 0;

  // Camera shake during warp
  private shakeIntensity = 0;
  private shakeOffset = new THREE.Vector3();

  // Ambient slow rotation of the entire field
  private fieldRotation = 0;

  // Time accumulator
  private time = 0;

  constructor(camera: THREE.PerspectiveCamera, particles: ParticleSystem) {
    this.scene = new THREE.Scene();
    this.camera = camera;
    this.particles = particles;

    // Vortex point light (replaces flat disc as primary visual)
    this.vortexLight = new THREE.PointLight(0x4466cc, 5, 80, 1.2);
    this.vortexLight.position.set(0, 0, -50);
    this.scene.add(this.vortexLight);

    // Glow sprite for vortex center
    this.vortexGlow = this.createVortexGlow();
    this.scene.add(this.vortexGlow);

    this.setup();
  }

  private setup(): void {
    // Add particle system to scene
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.getBurstPoints());

    // Arrange stars in depth formation (wide depth range for parallax)
    this.particles.arrangeGateField();

    // Create vortex core shader mesh (gravitational lens effect)
    this.createVortexCore();

    // Create subtle ring around the vortex
    this.createVortexRing();

    // Nebula backdrop
    this.createNebula();

    // Very faint ambient light
    const ambient = new THREE.AmbientLight(0x080818, 0.3);
    this.scene.add(ambient);

    // Store camera start position
    this.cameraStartZ = this.camera.position.z;
  }

  private createVortexGlow(): THREE.Sprite {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Multi-layer radial gradient for a deep glow
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, 'rgba(200, 220, 255, 1.0)');
    gradient.addColorStop(0.05, 'rgba(150, 180, 255, 0.8)');
    gradient.addColorStop(0.15, 'rgba(80, 100, 220, 0.4)');
    gradient.addColorStop(0.4, 'rgba(40, 50, 150, 0.12)');
    gradient.addColorStop(0.7, 'rgba(20, 20, 80, 0.03)');
    gradient.addColorStop(1, 'rgba(0, 0, 20, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      color: 0x6688dd,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(20, 20, 1);
    sprite.position.set(0, 0, -50);
    return sprite;
  }

  private createVortexCore(): void {
    // Small shader sphere at vortex center — gravitational lens look
    const geo = new THREE.PlaneGeometry(18, 18, 1, 1);
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

          // Spiral arms (gravitational accretion disc feel)
          float spiral1 = sin(angle * 3.0 - dist * 20.0 + uTime * 1.2) * 0.5 + 0.5;
          float spiral2 = sin(angle * 5.0 + dist * 15.0 - uTime * 0.8) * 0.5 + 0.5;
          float spiral = mix(spiral1, spiral2, 0.4);
          spiral *= smoothstep(0.45, 0.03, dist);

          // Bright core with falloff
          float core = exp(-dist * dist * 50.0);
          float innerRing = exp(-pow(dist - 0.08, 2.0) * 300.0) * 0.6;

          // Event horizon darkness at very center
          float hole = 1.0 - exp(-dist * dist * 800.0);

          float alpha = (spiral * 0.12 + core * 0.8 + innerRing) * smoothstep(0.5, 0.05, dist) * hole;

          // Color: blue-purple gradient with white-hot core
          vec3 spiralColor = mix(
            vec3(0.15, 0.25, 0.9),
            vec3(0.5, 0.2, 0.85),
            spiral
          );
          vec3 coreColor = vec3(0.9, 0.92, 1.0);
          vec3 color = mix(spiralColor, coreColor, core * 0.7);

          // Subtle pulsation
          alpha *= 0.9 + 0.1 * sin(uTime * 2.0);

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

    this.vortexCoreMesh = new THREE.Mesh(geo, mat);
    this.vortexCoreMesh.position.set(0, 0, -50);
    this.scene.add(this.vortexCoreMesh);
  }

  private createVortexRing(): void {
    // Subtle gravitational lensing ring — torus of light
    const geo = new THREE.TorusGeometry(5, 0.15, 8, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4466aa,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.vortexRingMesh = new THREE.Mesh(geo, mat);
    this.vortexRingMesh.position.set(0, 0, -50);
    this.vortexRingMesh.rotation.x = Math.PI * 0.1; // slight tilt
    this.scene.add(this.vortexRingMesh);
  }

  private createNebula(): void {
    const geo = new THREE.PlaneGeometry(100, 100, 1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.35 },
        uColor: { value: new THREE.Vector3(0.15, 0.1, 0.35) }, // deep purple-blue
        uCenter: { value: new THREE.Vector2(0.55, 0.45) },
        uRadius: { value: 0.8 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.nebulaMesh = new THREE.Mesh(geo, mat);
    this.nebulaMesh.position.set(5, -3, -200); // far behind everything
    this.scene.add(this.nebulaMesh);
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
    this.time += clampedDt;

    // Update vortex shader time
    if (this.vortexCoreMesh) {
      const mat = this.vortexCoreMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = this.time;
    }

    // Update nebula time
    if (this.nebulaMesh) {
      const mat = this.nebulaMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = this.time;
    }

    // Vortex light subtle pulse
    this.vortexLight.intensity = 5 + Math.sin(this.time * 1.5) * 1.5;

    // Vortex glow breathes
    const glowScale = 20 + Math.sin(this.time * 0.8) * 2;
    this.vortexGlow.scale.set(glowScale, glowScale, 1);

    // Slow ring rotation
    if (this.vortexRingMesh) {
      this.vortexRingMesh.rotation.z = this.time * 0.15;
      this.vortexRingMesh.rotation.x = Math.PI * 0.1 + Math.sin(this.time * 0.3) * 0.05;
    }

    if (this.isWarping) {
      this.updateWarp(clampedDt);
    } else {
      this.updateIdle(clampedDt);
    }
  }

  private updateIdle(dt: number): void {
    // Gentle camera drift in a circle — creates parallax with deep starfield
    this.driftAngle += dt * 0.12;
    this.camera.position.x = Math.sin(this.driftAngle) * this.driftRadius;
    this.camera.position.y = Math.cos(this.driftAngle * 0.7) * this.driftRadius * 0.6;

    // Add subtle z-drift for breathing depth
    this.camera.position.z = 5 + Math.sin(this.driftAngle * 0.3) * 0.5;

    // Slow field rotation
    this.fieldRotation += dt * 0.015;
    this.particles.points.rotation.z = this.fieldRotation;

    // Camera looks slightly toward center (vortex)
    this.camera.lookAt(0, 0, -20);
  }

  private updateWarp(dt: number): void {
    this.warpProgress += dt / this.warpDuration;

    if (this.warpProgress >= 1.0) {
      this.warpProgress = 1.0;
      this.isWarping = false;
      this.shakeIntensity = 0;
      if (this.warpCallback) {
        this.warpCallback();
        this.warpCallback = null;
      }
      return;
    }

    const t = this.warpProgress;

    // Camera accelerates forward (ease-in cubic)
    const zTravel = -180; // longer travel distance
    const easedT = easeInCubic(t);
    this.camera.position.z = this.cameraStartZ + zTravel * easedT;

    // Narrow FOV for tunnel feel (60 -> 25 -> snap back)
    const fovT = easeInOutQuart(t);
    this.camera.fov = 60 - 35 * fovT;
    this.camera.updateProjectionMatrix();

    // Warp factor ramps up
    const warpFactor = easeInCubic(Math.min(t * 1.5, 1.0));
    this.particles.setWarpFactor(warpFactor);

    // Increase particle size during warp for streak visibility
    this.particles.setSizeMultiplier(1.0 + warpFactor * 3.0);

    // Faster field rotation during warp
    this.fieldRotation += dt * (0.02 + warpFactor * 1.0);
    this.particles.points.rotation.z = this.fieldRotation;

    // Camera shake — builds up then subsides
    this.shakeIntensity = Math.sin(t * Math.PI) * warpFactor * 0.4;
    this.shakeOffset.set(
      (Math.random() - 0.5) * this.shakeIntensity,
      (Math.random() - 0.5) * this.shakeIntensity,
      0,
    );

    // Vortex scales up, brightens, then fades
    const vortexScale = 1.0 + easedT * 8.0;
    this.vortexGlow.scale.setScalar(20 * vortexScale);
    (this.vortexGlow.material as THREE.SpriteMaterial).opacity = 1.0 - easedT * 0.8;
    this.vortexLight.intensity = 5 + warpFactor * 20;

    if (this.vortexCoreMesh) {
      const scale = 1.0 + easedT * 6.0;
      this.vortexCoreMesh.scale.set(scale, scale, 1);
    }

    // Nebula fades during warp
    if (this.nebulaMesh) {
      const mat = this.nebulaMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uIntensity.value = 0.35 * (1.0 - easedT);
    }

    // Camera drift dampens during warp, apply shake
    this.camera.position.x = this.camera.position.x * (1.0 - dt * 3) + this.shakeOffset.x;
    this.camera.position.y = this.camera.position.y * (1.0 - dt * 3) + this.shakeOffset.y;
    this.camera.lookAt(0, 0, this.camera.position.z - 20);
  }

  /** Reset scene state (for re-entry or restart) */
  reset(): void {
    this.isWarping = false;
    this.warpProgress = 0;
    this.shakeIntensity = 0;
    this.particles.setWarpFactor(0);
    this.particles.setSizeMultiplier(1);
    this.camera.position.set(0, 0, 5);
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.fieldRotation = 0;
    this.driftAngle = 0;
    this.particles.arrangeGateField();
    if (this.vortexGlow) {
      this.vortexGlow.scale.set(20, 20, 1);
      (this.vortexGlow.material as THREE.SpriteMaterial).opacity = 1;
    }
    if (this.vortexCoreMesh) {
      this.vortexCoreMesh.scale.set(1, 1, 1);
    }
    if (this.nebulaMesh) {
      const mat = this.nebulaMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uIntensity.value = 0.35;
    }
  }

  dispose(): void {
    if (this.vortexCoreMesh) {
      (this.vortexCoreMesh.material as THREE.Material).dispose();
      this.vortexCoreMesh.geometry.dispose();
    }
    if (this.vortexRingMesh) {
      (this.vortexRingMesh.material as THREE.Material).dispose();
      this.vortexRingMesh.geometry.dispose();
    }
    if (this.nebulaMesh) {
      (this.nebulaMesh.material as THREE.Material).dispose();
      this.nebulaMesh.geometry.dispose();
    }
    (this.vortexGlow.material as THREE.SpriteMaterial).map?.dispose();
    (this.vortexGlow.material as THREE.Material).dispose();
  }
}
