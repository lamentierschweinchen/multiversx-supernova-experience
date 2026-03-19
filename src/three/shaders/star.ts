// Star particle shaders — cinematic point sprites with soft glow,
// twinkling, temperature-varied colors, and halo for bright stars

export const starVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3 aColor;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vBrightness;
  varying float vPhase;
  varying float vSize;

  uniform float uTime;
  uniform float uPulseIntensity;
  uniform float uSizeMultiplier;
  uniform float uWarpFactor; // 0 = normal, 1 = full warp stretch

  void main() {
    vColor = aColor;
    vPhase = aPhase;

    // Multi-frequency twinkle for organic feel
    float twinkle1 = sin(uTime * 1.2 + aPhase * 6.2831);
    float twinkle2 = sin(uTime * 2.7 + aPhase * 3.1415 + 1.3);
    float twinkle3 = sin(uTime * 0.4 + aPhase * 9.42);
    float twinkle = 0.78 + 0.12 * twinkle1 + 0.06 * twinkle2 + 0.04 * twinkle3;

    vBrightness = aBrightness * twinkle * (1.0 + uPulseIntensity * 0.5);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Warp stretch: elongate points along view z when warping
    float dist = length(mvPosition.xy);
    float warpStretch = 1.0 + uWarpFactor * 4.0 * (1.0 - smoothstep(0.0, 3.0, dist));

    // Perspective size attenuation
    float perspectiveScale = 300.0 / (-mvPosition.z);
    float finalSize = aSize * uSizeMultiplier * perspectiveScale * (1.0 + uPulseIntensity * 0.3);

    // During warp, increase size for streak effect
    finalSize *= (1.0 + uWarpFactor * 2.0);

    vSize = finalSize;

    gl_PointSize = clamp(finalSize, 0.5, 80.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const starFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vBrightness;
  varying float vPhase;
  varying float vSize;

  uniform float uTime;
  uniform float uWarpFactor;
  uniform float uDarkenFactor; // 0 = normal, 1 = darkened

  void main() {
    // Distance from center of point sprite
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);

    // Warp: stretch into radial line
    if (uWarpFactor > 0.01) {
      vec2 radialDir = normalize(center + vec2(0.001));
      float radialDist = abs(dot(center, radialDir));
      float tangentDist = abs(dot(center, vec2(-radialDir.y, radialDir.x)));
      dist = sqrt(radialDist * radialDist * (1.0 - uWarpFactor * 0.7)
                 + tangentDist * tangentDist * (1.0 + uWarpFactor * 2.0));
    }

    // Discard outside circle
    if (dist > 0.5) discard;

    // -- Multi-layer glow for cinematic stars --

    // Tight hot core
    float coreRadius = 0.05;
    float core = exp(-dist * dist / (coreRadius * coreRadius * 2.0));

    // Inner glow
    float innerGlowR = 0.12;
    float innerGlow = exp(-dist * dist / (innerGlowR * innerGlowR * 2.0));

    // Outer soft halo (visible on larger stars)
    float haloR = 0.35;
    float halo = exp(-dist * dist / (haloR * haloR * 0.3));

    // Diffraction spikes for bright/large stars (subtle cross pattern)
    float spike = 0.0;
    if (vSize > 4.0 && vBrightness > 0.6) {
      float spikeStrength = smoothstep(4.0, 12.0, vSize) * 0.3;
      // 4-point diffraction cross
      float ax = abs(center.x);
      float ay = abs(center.y);
      float spike1 = exp(-ay * ay * 800.0) * exp(-ax * 3.0);
      float spike2 = exp(-ax * ax * 800.0) * exp(-ay * 3.0);
      // Rotated 45-degree spikes (fainter)
      vec2 rot45 = vec2(center.x + center.y, center.x - center.y) * 0.7071;
      float spike3 = exp(-rot45.y * rot45.y * 1200.0) * exp(-abs(rot45.x) * 4.0) * 0.4;
      float spike4 = exp(-rot45.x * rot45.x * 1200.0) * exp(-abs(rot45.y) * 4.0) * 0.4;
      spike = (spike1 + spike2 + spike3 + spike4) * spikeStrength;
    }

    // Combine layers
    float alpha = core * 1.0 + innerGlow * 0.5 + halo * 0.2 + spike;

    // Color: hot white core fading to the star's temperature color
    vec3 hotWhite = vec3(1.0, 0.98, 0.95);
    vec3 coreColor = mix(vColor, hotWhite, 0.85);
    vec3 innerColor = mix(vColor, hotWhite, 0.4);
    vec3 haloColor = vColor * 0.8;
    vec3 spikeColor = mix(vColor, hotWhite, 0.6);

    vec3 finalColor = coreColor * core
                    + innerColor * innerGlow * 0.5
                    + haloColor * halo * 0.2
                    + spikeColor * spike;

    // Normalize to prevent over-bright
    finalColor /= max(alpha, 0.001);

    // Apply brightness
    finalColor *= vBrightness;

    // Apply darken (for miss feedback)
    finalColor *= (1.0 - uDarkenFactor * 0.7);
    alpha *= (1.0 - uDarkenFactor * 0.3);

    gl_FragColor = vec4(finalColor, alpha * vBrightness);
  }
`;
