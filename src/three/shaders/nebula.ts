// Nebula background glow shader — Hubble-inspired volumetric gas clouds
// 5-octave FBM with domain warping for organic, photographic nebula feel

export const nebulaVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const nebulaFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform vec2 uCenter;
  uniform float uRadius;

  varying vec2 vUv;

  // Improved hash for smoother noise
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Smooth value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Quintic interpolation for smoother result
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Gradient noise (Perlin-like) for smoother large features
  float gnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    vec2 ga = hash22(i);
    vec2 gb = hash22(i + vec2(1.0, 0.0));
    vec2 gc = hash22(i + vec2(0.0, 1.0));
    vec2 gd = hash22(i + vec2(1.0, 1.0));

    float va = dot(ga, f);
    float vb = dot(gb, f - vec2(1.0, 0.0));
    float vc = dot(gc, f - vec2(0.0, 1.0));
    float vd = dot(gd, f - vec2(1.0, 1.0));

    return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y) * 0.5 + 0.5;
  }

  // 5-octave FBM with rotation between octaves for less axis-alignment
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    float total = 0.0;
    // Rotation matrix to break axis-aligned patterns
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);

    for (int i = 0; i < 5; i++) {
      v += a * gnoise(p);
      total += a;
      p = rot * p * 2.1 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v / total;
  }

  // Domain-warped FBM for organic cloud shapes
  float warpedFbm(vec2 p, float t) {
    // First layer of domain warping
    vec2 q = vec2(
      fbm(p + vec2(0.0, 0.0) + t * 0.02),
      fbm(p + vec2(5.2, 1.3) - t * 0.015)
    );

    // Second layer of domain warping for more complexity
    vec2 r = vec2(
      fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.01),
      fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.008)
    );

    return fbm(p + 3.5 * r);
  }

  void main() {
    vec2 uv = vUv;
    vec2 delta = uv - uCenter;
    float dist = length(delta);

    // Radial falloff — smooth and wide
    float falloff = 1.0 - smoothstep(0.0, uRadius * 1.2, dist);
    falloff = falloff * falloff * falloff; // cubic for softer edges

    // Main nebula shape via domain-warped FBM
    float t = uTime;
    float n1 = warpedFbm(uv * 2.5, t);
    float n2 = warpedFbm(uv * 4.0 + vec2(42.0, 17.0), t * 0.7);

    // Fine detail layer
    float detail = fbm(uv * 8.0 + t * 0.03) * 0.3;

    // Combine into nebula density
    float density = n1 * 0.6 + n2 * 0.3 + detail;

    // Shape with falloff
    float nebula = falloff * density;

    // Brighten core region
    float coreBright = exp(-dist * dist / (uRadius * uRadius * 0.3)) * 0.4;
    nebula += coreBright * n1;

    nebula *= uIntensity;

    // Multi-color: base color with warm and cool variations
    vec3 warmShift = vec3(0.15, -0.05, -0.1); // reddish in dense regions
    vec3 coolShift = vec3(-0.05, 0.02, 0.12);  // blue in sparse regions

    vec3 color = uColor;
    color += warmShift * (n1 - 0.5) * 0.5;
    color += coolShift * (n2 - 0.5) * 0.3;

    // Subtle emission ridges along density gradients (Hubble-like bright filaments)
    float ridge = abs(n1 - n2) * 2.0;
    ridge = pow(ridge, 2.0) * 0.5;
    color += vec3(0.1, 0.08, 0.15) * ridge * falloff;

    // Dust lanes (dark regions where density dips)
    float dustLane = smoothstep(0.35, 0.45, n1) * smoothstep(0.55, 0.45, n1);
    nebula *= (1.0 - dustLane * 0.3);

    // Final color
    vec3 finalColor = color * nebula;

    // Add faint starlight scatter in the nebula
    float scatter = hash12(uv * 500.0 + t * 0.1);
    scatter = pow(scatter, 20.0) * 0.15 * falloff * uIntensity;
    finalColor += vec3(0.9, 0.85, 1.0) * scatter;

    gl_FragColor = vec4(finalColor, nebula * 0.5);
  }
`;
