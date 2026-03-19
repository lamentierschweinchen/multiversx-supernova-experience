// ============================================================
// Cinematic post-processing shaders
// Color grading, film grain, vignette, chromatic aberration
// ============================================================

// ----- Color Grading (Interstellar-inspired blue-purple palette) -----

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
  uniform float uExposure;     // exposure adjustment (default 1.0)
  uniform float uContrast;     // contrast boost (default 1.0)
  uniform float uSaturation;   // saturation (default 1.0)

  varying vec2 vUv;

  // Attempt at an ASC-CDL style grade
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

    // Lift-Gamma-Gain color grade
    // Lift: crush blacks toward deep blue
    vec3 lift = vec3(-0.01, -0.005, 0.02);
    // Gamma: push midtones slightly cool
    vec3 gamma = vec3(1.02, 1.0, 0.96);
    // Gain: warm highlights slightly, keep blue channel
    vec3 gain = vec3(1.0, 0.98, 1.04);

    vec3 graded = liftGammaGain(clamp(color, 0.0, 1.0), lift, gamma, gain);

    // Saturation adjustment
    float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    graded = mix(vec3(luma), graded, uSaturation);

    // Subtle blue-purple tint in shadows
    float shadowMask = 1.0 - smoothstep(0.0, 0.3, luma);
    graded += vec3(0.01, 0.005, 0.03) * shadowMask;

    // Highlight lift -- add a subtle warmth to brights
    float highlightMask = smoothstep(0.6, 1.0, luma);
    graded += vec3(0.02, 0.01, 0.0) * highlightMask;

    // Mix original and graded
    vec3 finalColor = mix(color, graded, uIntensity);

    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), tex.a);
  }
`;

// ----- Film Grain (organic texture) -----

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
  uniform float uIntensity; // grain strength 0-1

  varying vec2 vUv;

  // High quality hash for grain
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float grain(vec2 uv, float t) {
    // Temporal variation so grain flickers frame-to-frame
    vec2 seed = uv * vec2(1920.0, 1080.0) + vec2(t * 137.0, t * 311.0);
    float g = hash12(seed);
    // Gaussian-ish distribution from uniform
    float g2 = hash12(seed + 42.0);
    return (g + g2 - 1.0); // centered around 0, range -1 to 1
  }

  void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    vec3 color = tex.rgb;

    // Luminance-adaptive grain (more visible in midtones, less in darks/brights)
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float grainMask = smoothstep(0.0, 0.15, luma) * smoothstep(1.0, 0.7, luma);

    float g = grain(vUv, uTime) * uIntensity * grainMask * 0.08;

    color += vec3(g);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
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
  uniform float uIntensity;  // 0-1 vignette darkness
  uniform float uSoftness;   // falloff softness

  varying vec2 vUv;

  void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    vec3 color = tex.rgb;

    vec2 center = vUv - 0.5;
    float dist = length(center);

    // Smooth vignette falloff
    float vignette = 1.0 - smoothstep(uSoftness, uSoftness + 0.4, dist) * uIntensity;

    // Darken edges with a slight blue tint for cinematic feel
    vec3 vignetteColor = color * vignette;
    vignetteColor += vec3(0.0, 0.0, 0.008) * (1.0 - vignette);

    gl_FragColor = vec4(vignetteColor, tex.a);
  }
`;

// ----- Chromatic Aberration (subtle, increases with distance from center) -----

export const chromaticAberrationVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const chromaticAberrationFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uIntensity; // overall strength (pixels of max offset)
  uniform vec2 uResolution;

  varying vec2 vUv;

  void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center);
    vec2 dir = normalize(center + 0.0001);

    // Offset increases quadratically from center
    float offset = uIntensity * dist * dist / uResolution.x;

    float r = texture2D(tDiffuse, vUv + dir * offset).r;
    float g = texture2D(tDiffuse, vUv).g;
    float b = texture2D(tDiffuse, vUv - dir * offset * 0.8).b;

    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;
