// Warp post-processing shaders — radial distortion + chromatic aberration
// Enhanced with 16-sample radial blur and accumulation-style motion trails

export const warpVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const warpFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uIntensity;   // 0 to 1 — overall warp strength
  uniform float uTime;
  uniform vec2 uCenter;       // warp center in UV space (usually 0.5, 0.5)

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 delta = uv - uCenter;
    float dist = length(delta);
    vec2 dir = normalize(delta + vec2(0.0001));

    // Barrel distortion — pushes pixels outward from center
    float distortionStrength = uIntensity * 0.6;
    float barrelPower = 1.0 + distortionStrength * dist * dist * 4.0;
    vec2 distortedUv = uCenter + delta * barrelPower;

    // Radial zoom blur — 16 samples along radial direction for smooth trails
    float blurStrength = uIntensity * 0.04;
    vec4 color = vec4(0.0);
    float totalWeight = 0.0;
    const int SAMPLES = 16;

    for (int i = 0; i < SAMPLES; i++) {
      float t = float(i) / float(SAMPLES - 1) - 0.5;
      // Gaussian-ish weighting (more weight at center)
      float weight = exp(-t * t * 8.0);
      vec2 sampleUv = distortedUv + dir * t * blurStrength * dist;
      // Clamp to prevent sampling outside
      sampleUv = clamp(sampleUv, 0.0, 1.0);
      color += texture2D(tDiffuse, sampleUv) * weight;
      totalWeight += weight;
    }
    color /= totalWeight;

    // Accumulation-style trail boost — brighten streaks
    vec4 centerSample = texture2D(tDiffuse, distortedUv);
    float trailBoost = uIntensity * 0.3;
    color.rgb = mix(color.rgb, max(color.rgb, centerSample.rgb * 1.2), trailBoost);

    // Chromatic aberration — offset RGB channels radially (increases with warp)
    float aberrationStrength = uIntensity * 0.018;
    vec2 rOffset = dir * aberrationStrength * dist;
    vec2 bOffset = -dir * aberrationStrength * dist * 0.7;

    float r = texture2D(tDiffuse, clamp(distortedUv + rOffset, 0.0, 1.0)).r;
    float g = color.g;
    float b = texture2D(tDiffuse, clamp(distortedUv + bOffset, 0.0, 1.0)).b;

    // Mix: blend between clean and aberrated based on intensity
    vec3 aberrated = vec3(r, g, b);
    vec3 finalColor = mix(color.rgb, aberrated, smoothstep(0.0, 0.3, uIntensity));

    // Speed lines — radial bright streaks (more defined with more layers)
    float angle = atan(delta.y, delta.x);
    float speedLines1 = pow(abs(sin(angle * 40.0 + uTime * 3.0)), 25.0);
    float speedLines2 = pow(abs(sin(angle * 80.0 - uTime * 5.0)), 30.0) * 0.5;
    float speedLines3 = pow(abs(sin(angle * 20.0 + uTime * 1.5)), 15.0) * 0.3;
    float speedLines = (speedLines1 + speedLines2 + speedLines3);
    speedLines *= smoothstep(0.08, 0.5, dist) * uIntensity * 0.12;
    finalColor += vec3(0.5, 0.65, 1.0) * speedLines;

    // Tunnel darkening at edges
    float tunnel = 1.0 - smoothstep(0.2, 0.85, dist) * uIntensity * 0.6;
    finalColor *= tunnel;

    // Blue-white shift during warp (acceleration feel)
    float blueShift = uIntensity * uIntensity; // quadratic ramp
    finalColor = mix(finalColor, finalColor * vec3(0.85, 0.9, 1.15) + vec3(0.02, 0.04, 0.1) * blueShift, blueShift * 0.5);

    // Slight exposure boost at center for "light at end of tunnel"
    float centerGlow = exp(-dist * dist * 8.0) * uIntensity * 0.15;
    finalColor += vec3(0.8, 0.85, 1.0) * centerGlow;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
