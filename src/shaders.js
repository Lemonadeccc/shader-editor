export const vertexShaderSource = `#version 300 es
precision highp float;

in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const defaultCustomBody = `
vec3 customEffect(vec2 uv, vec3 color) {
  float ring = abs(length(uv - 0.5) - 0.28);
  float pulse = smoothstep(0.05, 0.0, ring) * (0.65 + 0.35 * sin(uTime * 2.0));
  return mix(color, vec3(0.25, 0.95, 0.78), pulse);
}
`.trim();

export function getDefaultCustomBody() {
  return defaultCustomBody;
}

export function buildFragmentShader(customBody = defaultCustomBody) {
  return `#version 300 es
precision highp float;

#define MAX_EFFECTS 8
#define PI 3.14159265359

uniform vec2 uResolution;
uniform vec2 uMouse;
uniform vec2 uPrevMouse;
uniform float uTime;
uniform int uEffectCount;
uniform int uEffectTypes[MAX_EFFECTS];
uniform vec4 uParamA[MAX_EFFECTS];
uniform vec4 uParamB[MAX_EFFECTS];
uniform vec3 uColorA[MAX_EFFECTS];
uniform vec3 uColorB[MAX_EFFECTS];
uniform int uSourceType;
uniform int uModelType;
uniform int uSdfType;

in vec2 vUv;
out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amp * noise(p);
    p = rot * p * 2.05 + 12.31;
    amp *= 0.5;
  }
  return value;
}

vec2 rotate2(vec2 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c) * p;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdTriangle(vec2 p) {
  const float k = 1.7320508;
  p.x = abs(p.x) - 0.35;
  p.y = p.y + 0.22;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -0.7, 0.0);
  return -length(p) * sign(p.y);
}

float sdStar(vec2 p, int points) {
  float a = atan(p.y, p.x);
  float r = length(p);
  float n = float(points);
  float k = cos(floor(0.5 + a * n / (2.0 * PI)) * (2.0 * PI / n) - a) * r;
  return k - 0.34;
}

float sdf2d(vec2 p, int shapeType) {
  float t = float(shapeType);
  p = rotate2(p, 0.18 * sin(uTime * 0.35));
  if (shapeType == 0) return abs(length(p) - 0.34) - 0.055;
  if (shapeType == 1) return sdBox(p, vec2(0.35));
  if (shapeType == 2) return length(p) - 0.38;
  if (shapeType == 3) return sdCapsule(p, vec2(-0.34, -0.2), vec2(0.3, 0.22), 0.16);
  if (shapeType == 4) return length(p) - 0.36;
  if (shapeType == 5) return max(abs(p.x) - 0.22, length(p) - 0.38);
  if (shapeType == 6) return max(abs(p.x) + abs(p.y) - 0.45, length(p) - 0.52);
  if (shapeType == 7) return max(abs(p.y) - 0.35, abs(p.x) * 0.866 + abs(p.y) * 0.5 - 0.36);
  if (shapeType == 8) return min(sdBox(p, vec2(0.42, 0.12)), sdBox(p, vec2(0.12, 0.42)));
  if (shapeType == 9) return abs(length(p) - (0.22 + 0.08 * sin(16.0 * atan(p.y, p.x)))) - 0.06;
  if (shapeType == 10) return min(min(abs(p.x), abs(p.y)), abs(p.x + p.y) * 0.707) - 0.08;
  if (shapeType == 11) return sdTriangle(p);
  if (shapeType == 12) return min(sdBox(p, vec2(0.38, 0.12)), sdBox(rotate2(p, PI / 2.0), vec2(0.38, 0.12))) - 0.03;
  if (shapeType == 13) return sdBox(p, vec2(0.4)) - 0.04;
  if (shapeType == 14) return min(length(p - vec2(-0.16, 0.0)), length(p - vec2(0.16, 0.0))) - 0.28;
  if (shapeType == 15) return length(p) - (0.31 + 0.04 * sin(24.0 * length(p) - uTime * 2.0));
  if (shapeType == 16) return max(sdBox(p + vec2(0.0, -0.1), vec2(0.3, 0.24)), -sdBox(p + vec2(0.0, -0.1), vec2(0.16, 0.1)));
  if (shapeType == 17) return sdStar(p, 5);
  if (shapeType == 18) return max(sdTriangle(p), -sdBox(p + vec2(0.0, -0.06), vec2(0.16, 0.08)));
  if (shapeType == 19) return min(min(sdBox(p, vec2(0.42, 0.07)), sdBox(rotate2(p, PI / 4.0), vec2(0.42, 0.07))), sdBox(rotate2(p, -PI / 4.0), vec2(0.42, 0.07)));
  if (shapeType == 20) return sdStar(p, 6) + 0.04 * sin(8.0 * atan(p.y, p.x));
  return abs(sdBox(p, vec2(0.42))) - 0.055;
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float map3d(vec3 p) {
  float shape = float(uModelType);
  p.xz = rotate2(p.xz, uTime * 0.22);
  p.xy = rotate2(p.xy, 0.15 * sin(uTime * 0.3));

  if (uModelType == 0) return sdSphere(p, 0.72);
  if (uModelType == 1) return sdSphere(p, 0.68 + 0.05 * fbm(p.xy * 4.0 + p.z));
  if (uModelType == 2) {
    float shell = sdSphere(p, 0.72);
    float holes = sin(p.x * 9.0) * sin(p.y * 9.0) * sin(p.z * 9.0);
    return max(shell, -holes * 0.08 - 0.02);
  }
  if (uModelType == 3) return sdSphere(p, 0.64 + 0.12 * fbm(p.xy * 3.0 + p.z));
  if (uModelType == 4 || uModelType == 5 || uModelType == 14) {
    float head = sdSphere(p - vec3(0.0, 0.18, 0.0), 0.42);
    float neck = sdRoundBox(p - vec3(0.0, -0.36, 0.0), vec3(0.22, 0.28, 0.18), 0.12);
    return min(head, neck);
  }
  if (uModelType == 6) {
    float palm = sdSphere(p, 0.34);
    float fingers = 10.0;
    for (int i = 0; i < 4; i++) {
      float x = -0.24 + float(i) * 0.16;
      fingers = min(fingers, sdCapsule(p.xy - vec2(x, 0.15), vec2(0.0, 0.0), vec2(0.0, 0.48), 0.06));
    }
    return min(palm, fingers);
  }
  if (uModelType == 7 || uModelType == 8 || uModelType == 15) {
    float stem = sdRoundBox(p - vec3(0.0, -0.25, 0.0), vec3(0.04, 0.45, 0.04), 0.02);
    float petal = sdSphere(vec3(abs(p.x) - 0.24, p.y - 0.2, p.z), 0.24);
    return min(stem, petal);
  }
  if (uModelType == 9) return min(sdSphere(p - vec3(-0.32, 0.0, 0.0), 0.28), sdSphere(p - vec3(0.32, 0.0, 0.0), 0.28));
  if (uModelType == 10) return sdTorus(p, vec2(0.43 + 0.06 * sin(6.0 * atan(p.z, p.x)), 0.15));
  if (uModelType == 11) {
    float body = sdSphere(p, 0.55);
    float horn = max(length(p.xz) - 0.08, abs(p.y - 0.55) - 0.28);
    return min(body, horn);
  }
  if (uModelType == 12 || uModelType == 13) return max(abs(p.x) + abs(p.y) + abs(p.z) - 0.86, sdSphere(p, 0.2));
  if (uModelType == 16) return min(sdRoundBox(p, vec3(0.55, 0.08, 0.18), 0.04), sdRoundBox(p - vec3(0.0, 0.0, -0.25), vec3(0.18, 0.04, 0.38), 0.03));
  if (uModelType == 17) return min(sdSphere(p - vec3(0.0, 0.12, 0.0), 0.42), sdSphere(p - vec3(0.0, -0.18, 0.0), 0.32));
  return sdRoundBox(p, vec3(0.55), 0.08);
}

vec3 raymarchModel(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.2;
  vec3 ro = vec3(0.0, 0.0, 2.6);
  vec3 rd = normalize(vec3(p, -1.7));
  float d = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 56; i++) {
    vec3 pos = ro + rd * d;
    float dist = map3d(pos);
    if (dist < 0.002) {
      hit = 1.0;
      break;
    }
    d += dist;
    if (d > 5.5) break;
  }
  if (hit < 0.5) {
    return vec3(0.0);
  }
  vec3 pos = ro + rd * d;
  vec2 e = vec2(0.002, 0.0);
  vec3 n = normalize(vec3(
    map3d(pos + e.xyy) - map3d(pos - e.xyy),
    map3d(pos + e.yxy) - map3d(pos - e.yxy),
    map3d(pos + e.yyx) - map3d(pos - e.yyx)
  ));
  vec3 light = normalize(vec3(-0.4, 0.6, 0.7));
  float diff = clamp(dot(n, light), 0.0, 1.0);
  float fresnel = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.5);
  vec3 base = mix(vec3(0.72, 0.68, 0.6), vec3(0.25, 0.9, 0.78), fresnel);
  return base * (0.22 + 0.88 * diff) + fresnel * vec3(0.75, 0.95, 1.0);
}

vec3 sourceColor(vec2 uv) {
  vec2 p = uv - 0.5;
  vec3 bg = mix(vec3(0.08, 0.075, 0.07), vec3(0.12, 0.11, 0.1), uv.y);
  float n = fbm(uv * 3.0 + uTime * 0.04);
  vec3 gradient = mix(vec3(0.11, 0.09, 0.08), vec3(0.1, 0.37, 0.31), uv.x + 0.18 * n);
  gradient = mix(gradient, vec3(0.75, 0.25, 0.17), smoothstep(0.2, 0.98, uv.y + 0.15 * sin(uv.x * 5.0)));

  if (uSourceType == 1 || uSourceType == 3) {
    vec3 model = raymarchModel(uv);
    return mix(gradient, model, smoothstep(0.02, 0.12, length(model)));
  }

  if (uSourceType == 2) {
    float d = sdf2d(p * 1.7, uSdfType);
    float fill = smoothstep(0.015, -0.015, d);
    float edge = smoothstep(0.04, 0.0, abs(d));
    vec3 shape = mix(vec3(0.98, 0.46, 0.34), vec3(0.25, 0.84, 0.7), uv.y);
    return mix(bg, shape, fill) + edge * vec3(0.9, 0.8, 0.45);
  }

  if (uSourceType == 4) {
    float bands = step(0.5, fract((uv.x + uv.y + uTime * 0.08) * 18.0));
    return mix(gradient, vec3(0.9, 0.9, 0.84), 0.15 * bands);
  }

  return gradient;
}

vec2 distortUv(int type, vec2 uv, vec4 p, vec4 q) {
  float intensity = p.x;
  float scale = max(p.y, 0.001);
  float speed = p.z;
  float amount = p.w;
  vec2 center = mix(vec2(0.5), uMouse, 0.75);
  vec2 d = uv - center;
  float r = length(d) + 0.0001;
  float t = uTime * speed + q.y;

  if (type == 9) {
    uv = center + d * (1.0 + 0.18 * intensity * sin(t + r * scale));
    uv += vec2(sin(t + uv.y * scale), cos(t + uv.x * scale)) * 0.015 * amount;
  } else if (type == 10) {
    uv += normalize(d) * sin(r * scale - t * 6.0) * 0.045 * amount * intensity * smoothstep(0.8, 0.0, r);
  } else if (type == 11) {
    float twist = (1.0 - smoothstep(0.0, 0.8, r)) * amount * intensity * 3.0;
    uv = center + rotate2(d, twist + sin(t + r * 8.0) * 0.12);
  } else if (type == 18) {
    vec2 cell = floor(uv * scale);
    uv += (vec2(hash12(cell), hash12(cell + 9.7)) - 0.5) * amount * 0.12 * intensity;
  } else if (type == 20) {
    uv = center + d * (1.0 - 0.3 * amount * smoothstep(0.65, 0.0, r));
    uv += normalize(d) * 0.04 * sin(t + r * scale);
  }

  return uv;
}

vec3 customEffect(vec2 uv, vec3 color);

vec3 applyEffect(int type, vec2 uv, vec3 color, vec4 p, vec4 q, vec3 ca, vec3 cb) {
  float intensity = p.x;
  float scale = max(p.y, 0.001);
  float speed = p.z;
  float amount = p.w;
  float softness = q.x;
  float t = uTime * speed + q.y;
  vec2 centered = uv - 0.5;

  if (type == 1) {
    float f = fbm(uv * scale * 0.45 + vec2(t * 0.18, -t * 0.07));
    float ribbon = smoothstep(0.2, 1.0, sin((uv.y + f * 0.45) * PI * 2.0 + t) * 0.5 + 0.5);
    vec3 aurora = mix(ca, cb, f + 0.2 * sin(t + uv.x * 4.0));
    return mix(color, aurora, ribbon * amount * intensity);
  }

  if (type == 2) {
    vec2 m = mix(vec2(0.5), uMouse, 0.8);
    vec2 d = uv - m;
    float a = atan(d.y, d.x);
    float r = length(d);
    float rays = pow(abs(sin(a * scale + t * 2.0)), 12.0 * (1.1 - softness));
    float falloff = smoothstep(1.0, 0.0, r);
    return color + mix(ca, cb, rays) * rays * falloff * intensity * amount;
  }

  if (type == 3) {
    float caustic = 0.0;
    caustic += sin((uv.x + sin(uv.y * 7.0 + t)) * scale);
    caustic += sin((uv.y + cos(uv.x * 6.0 - t)) * scale * 1.2);
    caustic = pow(abs(caustic) * 0.5, 6.0 * (1.1 - softness));
    return color + mix(ca, cb, uv.y) * caustic * amount * intensity;
  }

  if (type == 4) {
    vec2 cellUv = floor(uv * scale) / scale;
    vec3 sampled = sourceColor(cellUv);
    float luma = dot(sampled, vec3(0.299, 0.587, 0.114));
    float glyph = step(fract((uv.x + uv.y) * scale * 2.0), luma);
    return mix(color, mix(cb, ca, glyph), intensity * amount);
  }

  if (type == 5) {
    vec2 mv = uMouse - uPrevMouse;
    float trail = smoothstep(0.32, 0.0, length(uv - uMouse + mv * 0.8));
    trail += smoothstep(0.18, 0.0, length(uv - uMouse + mv * 0.35));
    return color + mix(ca, cb, trail) * trail * intensity * amount;
  }

  if (type == 6) {
    vec2 cell = floor(uv * scale);
    float id = hash12(cell);
    float mask = smoothstep(softness, 1.0, id + 0.25 * sin(t + id * 8.0));
    vec3 blockColor = mix(ca, cb, hash12(cell + 2.7));
    return mix(color, blockColor, mask * amount * intensity);
  }

  if (type == 7) {
    vec2 grid = floor(uv * scale);
    float line = min(fract(uv.x * scale), fract(uv.y * scale));
    float stroke = smoothstep(0.08, 0.0, line);
    float id = hash12(grid);
    vec3 primary = id < 0.33 ? vec3(0.93, 0.14, 0.12) : (id < 0.66 ? vec3(0.06, 0.28, 0.78) : vec3(0.98, 0.83, 0.12));
    vec3 mondrian = mix(primary, vec3(0.03), stroke);
    return mix(color, mondrian, amount * intensity);
  }

  if (type == 8) {
    vec2 px = floor(uv * scale) / scale;
    vec3 sampled = sourceColor(px);
    sampled = floor(sampled * (2.0 + 12.0 * amount)) / (2.0 + 12.0 * amount);
    return mix(color, sampled, intensity);
  }

  if (type == 9 || type == 10 || type == 11 || type == 18 || type == 20) {
    return mix(color, sourceColor(distortUv(type, uv, p, q)), intensity * amount);
  }

  if (type == 12) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 mapped = mix(ca, cb, smoothstep(0.0, 1.0, luma + 0.15 * sin(t + uv.y * scale)));
    float scan = 0.92 + 0.08 * sin(uv.y * uResolution.y * 1.7);
    return mix(color * scan, mapped, amount * intensity);
  }

  if (type == 13) {
    vec3 glow = vec3(0.0);
    vec2 texel = 1.0 / uResolution;
    for (int x = -2; x <= 2; x++) {
      for (int y = -2; y <= 2; y++) {
        vec2 off = vec2(float(x), float(y)) * texel * scale;
        glow += sourceColor(uv + off);
      }
    }
    glow /= 25.0;
    float hot = smoothstep(0.45, 1.0, dot(glow, vec3(0.333)));
    return color + mix(ca, cb, hot) * hot * amount * intensity;
  }

  if (type == 14) {
    vec3 blur = vec3(0.0);
    vec2 dir = normalize(centered + vec2(0.001));
    vec2 texel = 1.0 / uResolution * scale * 2.0;
    for (int i = 0; i < 7; i++) {
      float fi = float(i) - 3.0;
      blur += sourceColor(uv + dir * fi * texel * (1.0 + amount * 5.0));
    }
    blur /= 7.0;
    return mix(color, blur, intensity * amount);
  }

  if (type == 15) {
    vec2 texel = 1.0 / uResolution * scale;
    float c = dot(sourceColor(uv), vec3(0.333));
    float dx = dot(sourceColor(uv + vec2(texel.x, 0.0)), vec3(0.333)) - c;
    float dy = dot(sourceColor(uv + vec2(0.0, texel.y)), vec3(0.333)) - c;
    float edge = smoothstep(0.02, 0.18, length(vec2(dx, dy)));
    return mix(color, mix(ca, cb, edge), edge * amount * intensity);
  }

  if (type == 16) {
    vec3 sdf = raymarchModel(uv);
    return mix(color, sdf, amount * intensity);
  }

  if (type == 17) {
    float d = sdf2d(centered * scale * 0.35, uSdfType);
    float fill = smoothstep(0.02 + softness * 0.12, -0.02, d);
    float edge = smoothstep(0.08, 0.0, abs(d));
    return mix(color, mix(ca, cb, uv.y), fill * amount * intensity) + edge * ca * 0.35;
  }

  if (type == 19) {
    float scan = sin((uv.y * uResolution.y * 0.8) + t * 12.0);
    float tape = step(0.97, noise(vec2(uv.y * scale, floor(t * 6.0))));
    vec3 shifted = vec3(
      sourceColor(uv + vec2(0.005 * amount, 0.0)).r,
      color.g,
      sourceColor(uv - vec2(0.005 * amount, 0.0)).b
    );
    return mix(color, shifted + tape * ca * 0.7, intensity * (0.25 + 0.75 * amount)) * (0.92 + 0.08 * scan);
  }

  if (type == 99) {
    return mix(color, customEffect(uv, color), intensity);
  }

  return color;
}

${customBody}

void main() {
  vec2 uv = vUv;
  vec3 color = sourceColor(uv);

  for (int i = 0; i < MAX_EFFECTS; i++) {
    if (i >= uEffectCount) break;
    int type = uEffectTypes[i];
    if (type == 0) continue;
    color = applyEffect(type, uv, color, uParamA[i], uParamB[i], uColorA[i], uColorB[i]);
  }

  float vignette = smoothstep(0.92, 0.2, length((uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0)));
  color *= 0.72 + 0.28 * vignette;
  outColor = vec4(pow(max(color, 0.0), vec3(0.92)), 1.0);
}
`;
}
