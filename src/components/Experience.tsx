'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import { ParticleSystem } from '@/three/systems/ParticleSystem';
import { GateScene } from '@/three/scenes/GateScene';
import { RhythmScene } from '@/three/scenes/RhythmScene';
import { RevealScene } from '@/three/scenes/RevealScene';
import { warpVertexShader, warpFragmentShader } from '@/three/shaders/warp';
import {
  colorGradeVertexShader, colorGradeFragmentShader,
  filmGrainVertexShader, filmGrainFragmentShader,
  vignetteVertexShader, vignetteFragmentShader,
  chromaticAberrationVertexShader, chromaticAberrationFragmentShader,
} from '@/three/shaders/postprocessing';
import { exportPNG as exportPNGUtil, downloadBlob } from '@/three/utils/export';

import type {
  ConstellationData,
  PerformanceTier,
} from '@/lib/types';
import { PERFORMANCE_CONFIG } from '@/lib/types';

// ============================================================
// ExperienceRef — the public API this component exposes
// ============================================================

interface ExperienceRef {
  pulse: () => void;
  registerTap: (accuracy: number) => void;
  triggerWarp: () => void;
  showConstellation: (data: ConstellationData) => void;
  exportPNG: () => void;
}

interface ExperienceProps {
  onReady: (ref: ExperienceRef) => void;
}

// ============================================================
// Performance detection
// ============================================================

function detectPerformanceTier(): PerformanceTier {
  if (typeof window === 'undefined') return 'medium';

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return 'minimal';

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererStr = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase()
    : '';

  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const isIntegrated = /intel|mesa|swiftshader|llvmpipe/i.test(rendererStr);
  const isHighEnd = /nvidia.*rtx|nvidia.*40[0-9]0|radeon.*rx.*[67][0-9]00|apple.*m[234]/i.test(rendererStr);

  if (isMobile) return 'low';
  if (isHighEnd) return 'high';
  if (isIntegrated) return 'low';
  return 'medium';
}

// ============================================================
// Scene state type
// ============================================================

type SceneState = 'gate' | 'warp' | 'rhythm' | 'reveal';

// ============================================================
// Experience Component
// ============================================================

export default function Experience({ onReady }: ExperienceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalsRef = useRef<Internals | null>(null);
  const readyFiredRef = useRef(false);

  // Build all Three.js state on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tier = detectPerformanceTier();
    const config = PERFORMANCE_CONFIG[tier];
    const internals = buildInternals(container, config, tier);
    internalsRef.current = internals;

    // Render loop
    let lastTime = performance.now();
    let rafId: number;

    function loop() {
      rafId = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      internals.update(dt);
      internals.render();
    }
    rafId = requestAnimationFrame(loop);

    // Resize
    function onResize() {
      const w = container!.clientWidth;
      const h = container!.clientHeight;
      internals.resize(w, h);
    }
    window.addEventListener('resize', onResize);
    onResize();

    // Fire onReady after first frame renders
    requestAnimationFrame(() => {
      if (readyFiredRef.current) return;
      readyFiredRef.current = true;

      const i = internalsRef.current;
      if (!i) return;

      onReady({
        pulse() {
          i.rhythmScene.pulse();
        },

        registerTap(accuracy: number) {
          // accuracy comes in as 0-100 from the page, normalize to 0-1
          i.rhythmScene.registerTap(accuracy / 100);
        },

        triggerWarp() {
          i.sceneState = 'warp';
          if (i.warpPass) i.warpPass.enabled = true;
          i.gateScene.enterWarp(() => {
            // Warp complete — switch to rhythm scene
            i.sceneState = 'rhythm';
            i.renderPass.scene = i.rhythmScene.scene;
            if (i.warpPass) i.warpPass.enabled = false;
            i.particles.setWarpFactor(0);
            i.particles.setSizeMultiplier(1);
            i.rhythmScene.reset();
            i.camera.position.set(0, 2, 18);
            i.camera.fov = 60;
            i.camera.updateProjectionMatrix();
          });
        },

        showConstellation(data: ConstellationData) {
          i.sceneState = 'reveal';
          i.renderPass.scene = i.revealScene.scene;
          if (i.warpPass) i.warpPass.enabled = false;
          i.camera.position.set(0, 0, 8);
          i.camera.fov = 60;
          i.camera.updateProjectionMatrix();
          i.revealScene.showConstellation(data);
        },

        exportPNG() {
          const activeScene = i.renderPass.scene;
          exportPNGUtil(i.renderer, activeScene, i.camera)
            .then((blob) => {
              downloadBlob(blob, 'supernova-constellation.png');
            })
            .catch(() => {
              // Fallback: direct canvas export
              try {
                const url = i.renderer.domElement.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = 'supernova-constellation.png';
                link.href = url;
                link.click();
              } catch {
                // preserveDrawingBuffer issue — silently fail
              }
            });
        },
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      internals.dispose();
      internalsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
      }}
    />
  );
}

// ============================================================
// Internals — all Three.js objects in one place
// ============================================================

interface Internals {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  renderPass: RenderPass;
  bloomPass: UnrealBloomPass | null;
  warpPass: ShaderPass | null;
  colorGradePass: ShaderPass | null;
  chromaticAberrationPass: ShaderPass | null;
  vignettePass: ShaderPass | null;
  filmGrainPass: ShaderPass | null;
  particles: ParticleSystem;
  gateScene: GateScene;
  rhythmScene: RhythmScene;
  revealScene: RevealScene;
  sceneState: SceneState;
  update: (dt: number) => void;
  render: () => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

function buildInternals(
  container: HTMLElement,
  config: (typeof PERFORMANCE_CONFIG)[PerformanceTier],
  tier: PerformanceTier,
): Internals {
  // ----- Renderer -----
  const renderer = new THREE.WebGLRenderer({
    antialias: tier === 'high',
    alpha: false,
    powerPreference: tier === 'high' ? 'high-performance' : 'default',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'high' ? 2 : 1.5));
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Style the canvas to fill container
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  // ----- Camera -----
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 600);
  camera.position.set(0, 0, 5);

  // ----- Shared particle system -----
  const particles = new ParticleSystem({ count: config.starCount });

  // ----- Scenes -----
  const gateScene = new GateScene(camera, particles);
  const rhythmScene = new RhythmScene(camera, particles);
  const revealScene = new RevealScene(camera, particles);

  // ----- Post-processing chain -----
  const composer = new EffectComposer(renderer);

  // 1. Render pass
  const renderPass = new RenderPass(gateScene.scene, camera);
  composer.addPass(renderPass);

  // 2. Bloom — ethereal glow (tuned for cinematic look)
  let bloomPass: UnrealBloomPass | null = null;
  if (config.bloomEnabled) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      tier === 'high' ? 1.5 : tier === 'medium' ? 1.0 : 0.7,   // strength
      tier === 'high' ? 0.8 : 0.5,                                // radius
      tier === 'high' ? 0.1 : 0.3,                                // threshold
    );
    composer.addPass(bloomPass);
  }

  // 3. Warp distortion (enabled only during warp transition)
  let warpPass: ShaderPass | null = null;
  if (config.warpShader) {
    warpPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      },
      vertexShader: warpVertexShader,
      fragmentShader: warpFragmentShader,
    });
    warpPass.enabled = false;
    composer.addPass(warpPass);
  }

  // 4. Chromatic aberration — subtle optical realism
  let chromaticAberrationPass: ShaderPass | null = null;
  if (config.chromaticAberration) {
    chromaticAberrationPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: tier === 'high' ? 2.0 : 1.5 },
        uResolution: { value: new THREE.Vector2(w, h) },
      },
      vertexShader: chromaticAberrationVertexShader,
      fragmentShader: chromaticAberrationFragmentShader,
    });
    composer.addPass(chromaticAberrationPass);
  }

  // 5. Color grading — Interstellar-inspired blue-purple palette
  let colorGradePass: ShaderPass | null = null;
  if (config.colorGrading) {
    colorGradePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.7 },
        uExposure: { value: 1.1 },
        uContrast: { value: 1.08 },
        uSaturation: { value: 1.1 },
      },
      vertexShader: colorGradeVertexShader,
      fragmentShader: colorGradeFragmentShader,
    });
    composer.addPass(colorGradePass);
  }

  // 6. Vignette — focus the eye to center
  let vignettePass: ShaderPass | null = null;
  if (config.vignette) {
    vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.45 },
        uSoftness: { value: 0.3 },
      },
      vertexShader: vignetteVertexShader,
      fragmentShader: vignetteFragmentShader,
    });
    composer.addPass(vignettePass);
  }

  // 7. Film grain — organic texture (very subtle)
  let filmGrainPass: ShaderPass | null = null;
  if (config.filmGrain) {
    filmGrainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
      },
      vertexShader: filmGrainVertexShader,
      fragmentShader: filmGrainFragmentShader,
    });
    composer.addPass(filmGrainPass);
  }

  // ----- State -----
  let sceneState: SceneState = 'gate';

  // Track time for grain
  let grainTime = 0;

  // ----- Update -----
  function update(dt: number): void {
    particles.update(dt);
    grainTime += dt;

    switch (sceneState) {
      case 'gate':
      case 'warp':
        gateScene.update(dt);
        if (warpPass && sceneState === 'warp') {
          warpPass.uniforms.uTime.value += dt;
          warpPass.uniforms.uIntensity.value =
            particles.material.uniforms.uWarpFactor.value;
        }
        // During warp, increase chromatic aberration
        if (chromaticAberrationPass && sceneState === 'warp') {
          const warpFactor = particles.material.uniforms.uWarpFactor.value;
          chromaticAberrationPass.uniforms.uIntensity.value = 2.0 + warpFactor * 6.0;
        } else if (chromaticAberrationPass && sceneState === 'gate') {
          // Subtle baseline
          chromaticAberrationPass.uniforms.uIntensity.value = 2.0;
        }
        break;
      case 'rhythm':
        rhythmScene.update(dt);
        // Restore chromatic aberration to subtle
        if (chromaticAberrationPass) {
          chromaticAberrationPass.uniforms.uIntensity.value = 1.5;
        }
        break;
      case 'reveal':
        revealScene.update(dt);
        if (chromaticAberrationPass) {
          chromaticAberrationPass.uniforms.uIntensity.value = 1.0;
        }
        break;
    }

    // Update film grain time
    if (filmGrainPass) {
      filmGrainPass.uniforms.uTime.value = grainTime;
    }
  }

  function render(): void {
    composer.render();
  }

  function resize(w: number, h: number): void {
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    if (bloomPass) {
      bloomPass.resolution.set(w, h);
    }
    if (chromaticAberrationPass) {
      chromaticAberrationPass.uniforms.uResolution.value.set(w, h);
    }
  }

  function dispose(): void {
    renderer.dispose();
    composer.dispose();
    particles.dispose();
    gateScene.dispose();
    rhythmScene.dispose();
    revealScene.dispose();
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement);
    }
  }

  return {
    renderer,
    camera,
    composer,
    renderPass,
    bloomPass,
    warpPass,
    colorGradePass,
    chromaticAberrationPass,
    vignettePass,
    filmGrainPass,
    particles,
    gateScene,
    rhythmScene,
    revealScene,
    get sceneState() { return sceneState; },
    set sceneState(s) { sceneState = s; },
    update,
    render,
    resize,
    dispose,
  };
}
