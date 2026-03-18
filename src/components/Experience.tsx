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
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Style the canvas to fill container
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  // ----- Camera -----
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
  camera.position.set(0, 0, 5);

  // ----- Shared particle system -----
  const particles = new ParticleSystem({ count: config.starCount });

  // ----- Scenes -----
  const gateScene = new GateScene(camera, particles);
  const rhythmScene = new RhythmScene(camera, particles);
  const revealScene = new RevealScene(camera, particles);

  // ----- Post-processing -----
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(gateScene.scene, camera);
  composer.addPass(renderPass);

  let bloomPass: UnrealBloomPass | null = null;
  if (config.bloomEnabled) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      tier === 'high' ? 1.2 : 0.8,   // strength
      0.4,                             // radius
      tier === 'high' ? 0.3 : 0.5,   // threshold
    );
    composer.addPass(bloomPass);
  }

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

  // ----- State -----
  let sceneState: SceneState = 'gate';

  // ----- Update -----
  function update(dt: number): void {
    particles.update(dt);

    switch (sceneState) {
      case 'gate':
      case 'warp':
        gateScene.update(dt);
        if (warpPass && sceneState === 'warp') {
          warpPass.uniforms.uTime.value += dt;
          warpPass.uniforms.uIntensity.value =
            particles.material.uniforms.uWarpFactor.value;
        }
        break;
      case 'rhythm':
        rhythmScene.update(dt);
        break;
      case 'reveal':
        revealScene.update(dt);
        break;
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
