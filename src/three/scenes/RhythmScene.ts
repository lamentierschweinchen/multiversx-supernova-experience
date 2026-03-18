import * as THREE from 'three';
import { ParticleSystem } from '../systems/ParticleSystem';

// ============================================================
// RhythmScene — Deep space with a central pulsing orb.
// Stars arranged on a sphere. Tap feedback drives visual energy.
// ============================================================

/** Easing: smooth step */
function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

export class RhythmScene {
  readonly scene: THREE.Scene;
  private particles: ParticleSystem;
  private camera: THREE.PerspectiveCamera;

  // Central orb
  private orbMesh: THREE.Mesh;
  private orbLight: THREE.PointLight;
  private orbGlow: THREE.Sprite;
  private orbBaseScale = 1.0;
  private orbTargetScale = 1.0;
  private orbCurrentScale = 1.0;

  // Ambient
  private ambientLight: THREE.AmbientLight;
  private ambientBaseIntensity = 0.15;

  // Pulse state
  private pulseTimer = 0;
  private pulseInterval = 0.8; // seconds between automatic subtle pulses
  private energy = 0; // accumulated energy from good taps

  // Camera orbit
  private cameraAngle = 0;
  private cameraRadius = 18;
  private cameraY = 2;

  // Visual feedback state
  private flashTimer = 0;
  private flashColor = new THREE.Color(0xffffff);

  constructor(camera: THREE.PerspectiveCamera, particles: ParticleSystem) {
    this.scene = new THREE.Scene();
    this.camera = camera;
    this.particles = particles;

    // Central orb — sphere with emissive material
    const orbGeo = new THREE.SphereGeometry(0.8, 32, 32);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      emissive: 0x2244aa,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.orbMesh = new THREE.Mesh(orbGeo, orbMat);
    this.orbMesh.position.set(0, 0, -10);
    this.scene.add(this.orbMesh);

    // Point light inside orb
    this.orbLight = new THREE.PointLight(0x4488ff, 3, 30, 1.5);
    this.orbLight.position.copy(this.orbMesh.position);
    this.scene.add(this.orbLight);

    // Glow sprite around orb
    const glowTexture = this.createGlowTexture();
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x4488ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.orbGlow = new THREE.Sprite(glowMat);
    this.orbGlow.scale.set(6, 6, 1);
    this.orbGlow.position.copy(this.orbMesh.position);
    this.scene.add(this.orbGlow);

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x112244, this.ambientBaseIntensity);
    this.scene.add(this.ambientLight);

    // Add particle systems
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.getBurstPoints());

    // Arrange particles in a sphere around the orb
    this.particles.arrangeSphere(15);
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
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.2, 'rgba(100, 150, 255, 0.4)');
    gradient.addColorStop(0.5, 'rgba(50, 80, 200, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 50, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /** Called on each beat/pulse from the rhythm system */
  pulse(): void {
    this.pulseTimer = 0;
    this.orbTargetScale = this.orbBaseScale * 1.15;

    // Brief light pulse
    this.orbLight.intensity = 5;

    // Particle pulse
    this.particles.pulse(0.5);
  }

  /** Register a tap with accuracy 0-1 */
  registerTap(accuracy: number): void {
    const orbPos = this.orbMesh.position;

    if (accuracy > 0.8) {
      // GREAT tap — big flare
      this.orbTargetScale = this.orbBaseScale * 1.5;
      this.orbLight.intensity = 12;
      this.orbLight.color.set(0x88ccff);

      // Particle burst — lots of particles, fast
      const burstColor = new THREE.Color(0x66bbff);
      this.particles.emitBurst(orbPos.x, orbPos.y, orbPos.z, 80, burstColor, 8);

      // Intensify nearby stars
      this.particles.intensifyNear(orbPos.x, orbPos.y, orbPos.z, 10, 1.0);

      // Big pulse
      this.particles.pulse(1.5);

      // Energy accumulates
      this.energy = Math.min(this.energy + 0.15, 2.0);

      // Flash
      this.flashTimer = 0.15;
      this.flashColor.set(0x88ccff);

      // Update orb emissive toward brighter
      const orbMat = this.orbMesh.material as THREE.MeshStandardMaterial;
      orbMat.emissiveIntensity = Math.min(orbMat.emissiveIntensity + 0.5, 5.0);

    } else if (accuracy > 0.4) {
      // OK tap — moderate response
      this.orbTargetScale = this.orbBaseScale * 1.25;
      this.orbLight.intensity = 7;

      const burstColor = new THREE.Color(0x4488cc);
      this.particles.emitBurst(orbPos.x, orbPos.y, orbPos.z, 30, burstColor, 5);
      this.particles.intensifyNear(orbPos.x, orbPos.y, orbPos.z, 6, 0.5);
      this.particles.pulse(0.8);

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

  /** Update loop */
  update(dt: number): void {
    const clampedDt = Math.min(dt, 0.1);

    // Subtle auto-pulse
    this.pulseTimer += clampedDt;
    if (this.pulseTimer > this.pulseInterval) {
      // Micro-pulse, barely visible
      this.orbTargetScale = this.orbBaseScale * 1.05;
      this.pulseTimer = 0;
    }

    // Orb scale lerp
    this.orbCurrentScale += (this.orbTargetScale - this.orbCurrentScale) * clampedDt * 8;
    this.orbTargetScale += (this.orbBaseScale - this.orbTargetScale) * clampedDt * 3;
    this.orbMesh.scale.setScalar(this.orbCurrentScale);

    // Glow scale tracks orb but bigger
    this.orbGlow.scale.setScalar(6 * this.orbCurrentScale * (1 + this.energy * 0.3));

    // Light intensity decays
    this.orbLight.intensity += (3 + this.energy * 2 - this.orbLight.intensity) * clampedDt * 4;
    this.orbLight.color.lerp(new THREE.Color(0x4488ff), clampedDt * 2);

    // Ambient recovers
    const targetAmbient = this.ambientBaseIntensity + this.energy * 0.1;
    this.ambientLight.intensity += (targetAmbient - this.ambientLight.intensity) * clampedDt * 5;

    // Orb emissive decays slowly
    const orbMat = this.orbMesh.material as THREE.MeshStandardMaterial;
    orbMat.emissiveIntensity += (2.0 + this.energy - orbMat.emissiveIntensity) * clampedDt * 1.5;

    // Energy slowly decays
    this.energy *= 1.0 - clampedDt * 0.3;

    // Flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= clampedDt;
    }

    // Camera slow orbit around the orb
    this.cameraAngle += clampedDt * 0.08 * (1 + this.energy * 0.3);
    this.camera.position.x = Math.sin(this.cameraAngle) * this.cameraRadius;
    this.camera.position.z = -10 + Math.cos(this.cameraAngle) * this.cameraRadius;
    this.camera.position.y = this.cameraY + Math.sin(this.cameraAngle * 0.5) * 0.5;
    this.camera.lookAt(this.orbMesh.position);

    // Orb color shifts slightly with energy
    const hue = 0.58 + this.energy * 0.05; // blue -> slightly cyan
    const orbColor = new THREE.Color().setHSL(hue, 0.7, 0.5);
    orbMat.color.lerp(orbColor, clampedDt);
    orbMat.emissive.lerp(orbColor, clampedDt * 0.5);
  }

  /** Reset to initial state */
  reset(): void {
    this.energy = 0;
    this.orbCurrentScale = 1.0;
    this.orbTargetScale = 1.0;
    this.orbLight.intensity = 3;
    this.cameraAngle = 0;
    this.particles.setWarpFactor(0);
    this.particles.setSizeMultiplier(1);
    this.particles.setDarkenFactor(0);
    this.particles.arrangeSphere(15);
  }

  dispose(): void {
    (this.orbMesh.material as THREE.Material).dispose();
    this.orbMesh.geometry.dispose();
    (this.orbGlow.material as THREE.SpriteMaterial).map?.dispose();
    (this.orbGlow.material as THREE.Material).dispose();
  }
}
