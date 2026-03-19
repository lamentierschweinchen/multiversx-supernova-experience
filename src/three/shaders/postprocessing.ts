// ============================================================
// Cinematic post-processing shaders — galaxy-of-nodes quality
// Color grading, vignette, film grain, chromatic aberration
// Warm cosmic palette: blue shadow lift, warm highlight, galaxy-grade
// ============================================================

// ----- Color Grading (warm cosmic palette) -----

export const colorGradeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const colorGradeFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uIntensity;    // 0-1 blend toward graded
  uniform float uExposure;     // exposure adjustment (default 1.05)
  uniform float uContrast;     // contrast boost (default 1.05)
  uniform float uSaturation;   // saturation (default 1.1)

  varying vec2 vUv;

  // ASC-CDL style lift-gamma-gain
  vec3 liftGammaGain(vec3 color, vec3 lift, vec3 gamma, vec3 gain) {
    vec3 lerpV = clamp(pow(color, 1.0 / gamma), 0.0, 1.0);
    return gain * lerpV + lift * (1.0 - lerpV);
  }

  void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    vec3 color = tex.rgb;

    // Exposure
    color *= uExposure;

    // Contrast around midpoint
    color = (color - 0.5) * uContrast + 0.5;

    // Lift-Gamma-Gain: warm cosmic palette
    // Blue shadow lift, warm highlights, slight gamma bias
    vec3 lift = vec3(0.005, -0.005, 0.015);     // blue lift in shadows
    vec3 gamma = vec3(1.01, 1.0, 0.97);         // gamma bias (galaxy-of-nodes exact)
    vec3 gain = vec3(1.02, 0.99, 1.02);         // warm highlight lift

    vec3 graded = liftGammaGain(clamp(color, 0.0, 1.0), lift, gamma, gain);

    // Saturation adjustment
    float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    graded = mix(vec3(luma), graded, uSaturation);

    // Subtle warm tint in shadows (amber/deep blue)
    float shadowMask = 1.0 - smoothstep(0.0, 0.3, luma);
    graded += vec3(0.015, 0.005, 0.02) * shadowMask;

    // Warm highlight lift (golden glow in brights)
    float highlightMask = smoothstep(0.6, 1.0, luma);
    graded += vec3(0.02, 0.015, 0.0) * highlightMask;

    // Mix original and graded
    vec3 finalColor = mix(color, graded, uIntensity);

    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), tex.a);
  }
`;

// ----- Vignette -----

export const vignetteVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const vignetteFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uIntensity;  // 0.4 default
  uniform float uSoftness;   // 0.3 default

  varying vec2 vUv;

  void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    vec3 color = tex.rgb;

    vec2 center = vUv - 0.5;
    float dist = length(center);

    // Smooth vignette falloff
    float vignette = 1.0 - smoothstep(uSoftness, uSoftness + 0.4, dist) * uIntensity;

    // Darken edges with deep blue tint for cinematic feel
    vec3 vignetteColor = color * vignette;
    vignetteColor += vec3(0.0, 0.0, 0.008) * (1.0 - vignette);

    gl_FragColor = vec4(vignetteColor, tex.a);
  }
`;

// ----- Film Grain (hash-based noise with luma masking) -----

export const filmGrainVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const filmGrainFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uIntensity; // 0.5 default

  varying vec2 vUv;

  // High quality hash for grain
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    vec3 color = tex.rgb;

    // Luminance-adaptive grain (more visible in midtones)
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float grainMask = smoothstep(0.0, 0.15, luma) * smoothstep(1.0, 0.7, luma);

    // Temporal variation for frame-to-frame flicker
    vec2 seed = vUv * vec2(1920.0, 1080.0) + vec2(uTime * 137.0, uTime * 311.0);
    float g = hash12(seed);
    float g2 = hash12(seed + 42.0);
    // Gaussian-ish distribution centered around 0
    float grain = (g + g2 - 1.0) * uIntensity * grainMask * 0.08;

    color += vec3(grain);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
  }
`;

// ----- Chromatic Aberration (radial RGB separation) -----

export const chromaticAberrationVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const chromaticAberrationFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uIntensity; // 1.5 default
  uniform vec2 uResolution;

  varying vec2 vUv;

  void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center);
    vec2 dir = normalize(center + 0.0001);

    // Quadratic distance scaling for natural optical aberration
    float offset = uIntensity * dist * dist / uResolution.x;

    float r = texture2D(tDiffuse, vUv + dir * offset).r;
    float g = texture2D(tDiffuse, vUv).g;
    float b = texture2D(tDiffuse, vUv - dir * offset * 0.8).b;

    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;
