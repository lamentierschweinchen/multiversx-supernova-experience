// Star particle shaders — custom point sprites with soft glow falloff

export const starVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3 aColor;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vBrightness;
  varying float vPhase;

  uniform float uTime;
  uniform float uPulseIntensity;
  uniform float uSizeMultiplier;
  uniform float uWarpFactor; // 0 = normal, 1 = full warp stretch

  void main() {
    vColor = aColor;
    vPhase = aPhase;

    // Gentle twinkle based on phase offset
    float twinkle = 0.85 + 0.15 * sin(uTime * 1.5 + aPhase * 6.2831);
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

    gl_PointSize = clamp(finalSize, 0.5, 64.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const starFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vBrightness;
  varying float vPhase;

  uniform float uTime;
  uniform float uWarpFactor;
  uniform float uDarkenFactor; // 0 = normal, 1 = darkened

  void main() {
    // Distance from center of point sprite
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);

    // Warp: stretch into radial line
    if (uWarpFactor > 0.01) {
      // Elongate along radial direction from screen center
      vec2 radialDir = normalize(center + vec2(0.001));
      float radialDist = abs(dot(center, radialDir));
      float tangentDist = abs(dot(center, vec2(-radialDir.y, radialDir.x)));
      dist = sqrt(radialDist * radialDist * (1.0 - uWarpFactor * 0.7)
                 + tangentDist * tangentDist * (1.0 + uWarpFactor * 2.0));
    }

    // Discard outside circle
    if (dist > 0.5) discard;

    // Soft glow falloff — gaussian-ish
    float coreRadius = 0.08;
    float glowRadius = 0.5;
    float core = exp(-dist * dist / (coreRadius * coreRadius * 2.0));
    float glow = exp(-dist * dist / (glowRadius * glowRadius * 0.15));
    float alpha = core * 0.9 + glow * 0.4;

    // Color: core is white-hot, edges are tinted
    vec3 coreColor = mix(vColor, vec3(1.0), 0.7);
    vec3 edgeColor = vColor;
    vec3 finalColor = mix(edgeColor, coreColor, core);

    // Apply brightness
    finalColor *= vBrightness;

    // Apply darken (for miss feedback)
    finalColor *= (1.0 - uDarkenFactor * 0.7);
    alpha *= (1.0 - uDarkenFactor * 0.3);

    gl_FragColor = vec4(finalColor, alpha * vBrightness);
  }
`;
