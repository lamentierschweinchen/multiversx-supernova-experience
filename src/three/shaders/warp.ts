// Warp post-processing shaders — radial distortion + chromatic aberration

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

    // Radial zoom blur — sample along radial direction
    float blurStrength = uIntensity * 0.03;
    vec4 color = vec4(0.0);
    float totalWeight = 0.0;
    const int SAMPLES = 8;

    for (int i = 0; i < SAMPLES; i++) {
      float t = float(i) / float(SAMPLES - 1) - 0.5;
      float weight = 1.0 - abs(t);
      vec2 sampleUv = distortedUv + dir * t * blurStrength * dist;
      color += texture2D(tDiffuse, sampleUv) * weight;
      totalWeight += weight;
    }
    color /= totalWeight;

    // Chromatic aberration — offset RGB channels radially
    float aberrationStrength = uIntensity * 0.012;
    vec2 rOffset = dir * aberrationStrength * dist;
    vec2 bOffset = -dir * aberrationStrength * dist * 0.7;

    float r = texture2D(tDiffuse, distortedUv + rOffset).r;
    float g = color.g;
    float b = texture2D(tDiffuse, distortedUv + bOffset).b;

    // Mix: blend between clean and aberrated based on intensity
    vec3 aberrated = vec3(r, g, b);
    vec3 finalColor = mix(color.rgb, aberrated, smoothstep(0.0, 0.3, uIntensity));

    // Speed lines — radial bright streaks
    float angle = atan(delta.y, delta.x);
    float speedLines = pow(abs(sin(angle * 40.0 + uTime * 3.0)), 20.0);
    speedLines *= smoothstep(0.1, 0.5, dist) * uIntensity * 0.15;
    finalColor += vec3(0.6, 0.7, 1.0) * speedLines;

    // Vignette intensifies during warp
    float vignette = 1.0 - smoothstep(0.3, 0.9, dist) * uIntensity * 0.5;
    finalColor *= vignette;

    // Slight blue-shift during warp
    finalColor += vec3(0.0, 0.02, 0.06) * uIntensity;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
