// Nebula background glow shader — fullscreen quad with radial gradient + noise

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

  // Simple noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 delta = uv - uCenter;
    float dist = length(delta);

    // Radial falloff
    float falloff = 1.0 - smoothstep(0.0, uRadius, dist);
    falloff *= falloff;

    // Animated noise for nebula texture
    float n = fbm(uv * 3.0 + uTime * 0.05);
    float n2 = fbm(uv * 5.0 - uTime * 0.03 + vec2(42.0));

    // Combine
    float nebula = falloff * (0.6 + 0.4 * n) * (0.8 + 0.2 * n2);
    nebula *= uIntensity;

    // Color with slight variation
    vec3 color = uColor * (0.8 + 0.2 * n);

    gl_FragColor = vec4(color * nebula, nebula * 0.4);
  }
`;
