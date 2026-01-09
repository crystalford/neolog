/**
 * Generative Shader Covers
 *
 * Creates unique, deterministic visual covers for posts based on content hash.
 * Each post gets a unique shader-generated image that changes if content changes.
 *
 * Features:
 * - Deterministic generation (same content = same visual)
 * - Multiple shader patterns (waves, particles, gradients, etc.)
 * - Customizable color palettes
 * - Fast WebGL rendering
 * - Exportable as PNG/SVG for social cards
 */

/**
 * Hash string to number (simple djb2 hash)
 */
export function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i)
  }
  return hash >>> 0 // Unsigned 32-bit integer
}

/**
 * Convert hash to normalized values for shader parameters
 */
export function hashToParams(hash: number): {
  seed: number
  hue: number
  saturation: number
  brightness: number
  pattern: number
  speed: number
  complexity: number
} {
  // Extract different parts of the hash for different parameters
  const bytes = [
    (hash >>> 24) & 0xff,
    (hash >>> 16) & 0xff,
    (hash >>> 8) & 0xff,
    hash & 0xff,
  ]

  return {
    seed: hash / 0xffffffff, // 0-1
    hue: bytes[0] / 255, // 0-1 (maps to 0-360 degrees)
    saturation: 0.5 + (bytes[1] / 255) * 0.4, // 0.5-0.9 (avoid too dull/bright)
    brightness: 0.4 + (bytes[2] / 255) * 0.3, // 0.4-0.7
    pattern: (bytes[3] % 6) / 6, // 0-5 patterns
    speed: 0.5 + (bytes[0] / 255) * 0.5, // 0.5-1.0
    complexity: 0.3 + (bytes[1] / 255) * 0.6, // 0.3-0.9
  }
}

/**
 * Get shader pattern based on hash
 */
export function getShaderPattern(patternIndex: number): string {
  const patterns = [
    'waves',
    'particles',
    'grid',
    'noise',
    'spiral',
    'plasma',
  ]
  return patterns[Math.floor(patternIndex * patterns.length)]
}

/**
 * Generate fragment shader code for a given pattern
 */
export function getFragmentShader(pattern: string): string {
  const baseUniforms = `
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_seed;
    uniform float u_hue;
    uniform float u_saturation;
    uniform float u_brightness;
    uniform float u_complexity;
  `

  const colorFunctions = `
    // HSV to RGB conversion
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    // Simple noise function
    float noise(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898 + u_seed, 78.233))) * 43758.5453);
    }

    // Smooth noise
    float smoothNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float a = noise(i);
      float b = noise(i + vec2(1.0, 0.0));
      float c = noise(i + vec2(0.0, 1.0));
      float d = noise(i + vec2(1.0, 1.0));

      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
  `

  let patternCode = ''

  switch (pattern) {
    case 'waves':
      patternCode = `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution;

          float wave1 = sin(uv.x * 10.0 * u_complexity + u_time * 0.5 + u_seed) * 0.5 + 0.5;
          float wave2 = sin(uv.y * 8.0 * u_complexity - u_time * 0.3 + u_seed * 2.0) * 0.5 + 0.5;
          float wave3 = sin((uv.x + uv.y) * 6.0 * u_complexity + u_time * 0.4) * 0.5 + 0.5;

          float combined = (wave1 + wave2 + wave3) / 3.0;

          vec3 color = hsv2rgb(vec3(u_hue + combined * 0.1, u_saturation, u_brightness + combined * 0.3));
          gl_FragColor = vec4(color, 1.0);
        }
      `
      break

    case 'particles':
      patternCode = `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution - 0.5;

          float dist = length(uv);
          float angle = atan(uv.y, uv.x);

          float particles = 0.0;
          for(float i = 0.0; i < 20.0; i++) {
            float offset = i * 0.314 + u_seed;
            float radius = 0.3 + sin(u_time * 0.5 + offset) * 0.2;
            float particleAngle = offset + u_time * 0.3;
            vec2 pos = vec2(cos(particleAngle), sin(particleAngle)) * radius;
            float d = distance(uv, pos);
            particles += 0.01 / (d * d);
          }

          particles *= u_complexity;
          vec3 color = hsv2rgb(vec3(u_hue, u_saturation, u_brightness + particles * 0.5));
          gl_FragColor = vec4(color, 1.0);
        }
      `
      break

    case 'grid':
      patternCode = `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution;

          vec2 grid = fract(uv * 10.0 * u_complexity + u_seed);
          float pattern = step(0.5, grid.x) * step(0.5, grid.y);

          float pulse = sin(u_time + length(uv - 0.5) * 5.0) * 0.5 + 0.5;
          pattern *= pulse;

          vec3 color = hsv2rgb(vec3(u_hue + pattern * 0.2, u_saturation, u_brightness + pattern * 0.3));
          gl_FragColor = vec4(color, 1.0);
        }
      `
      break

    case 'noise':
      patternCode = `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution;

          float n1 = smoothNoise(uv * 5.0 * u_complexity + u_time * 0.1);
          float n2 = smoothNoise(uv * 10.0 * u_complexity - u_time * 0.15);
          float n3 = smoothNoise(uv * 20.0 * u_complexity + u_seed);

          float combined = (n1 + n2 * 0.5 + n3 * 0.25) / 1.75;

          vec3 color = hsv2rgb(vec3(u_hue + combined * 0.15, u_saturation, u_brightness + combined * 0.3));
          gl_FragColor = vec4(color, 1.0);
        }
      `
      break

    case 'spiral':
      patternCode = `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution - 0.5;

          float dist = length(uv);
          float angle = atan(uv.y, uv.x);

          float spiral = sin(angle * 5.0 * u_complexity + dist * 20.0 - u_time + u_seed * 10.0);
          spiral = spiral * 0.5 + 0.5;

          vec3 color = hsv2rgb(vec3(u_hue + spiral * 0.2, u_saturation, u_brightness + spiral * 0.3));
          gl_FragColor = vec4(color, 1.0);
        }
      `
      break

    case 'plasma':
    default:
      patternCode = `
        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution;

          float plasma = sin(uv.x * 10.0 * u_complexity + u_time + u_seed);
          plasma += sin(uv.y * 10.0 * u_complexity + u_time * 1.2);
          plasma += sin((uv.x + uv.y) * 10.0 * u_complexity + u_time * 0.8);
          plasma += sin(sqrt(uv.x * uv.x + uv.y * uv.y) * 10.0 * u_complexity + u_time * 1.5);

          plasma = plasma / 4.0;
          plasma = plasma * 0.5 + 0.5;

          vec3 color = hsv2rgb(vec3(u_hue + plasma * 0.3, u_saturation, u_brightness + plasma * 0.3));
          gl_FragColor = vec4(color, 1.0);
        }
      `
  }

  return baseUniforms + colorFunctions + patternCode
}

/**
 * Basic vertex shader (used for all patterns)
 */
export const vertexShader = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

/**
 * Generate cover data URL for a post
 */
export interface GenerativeCoverOptions {
  width?: number
  height?: number
  animated?: boolean
  title?: string
  author?: string
}

export function generateCoverDataUrl(
  contentHash: string,
  options: GenerativeCoverOptions = {}
): string {
  const { width = 1200, height = 630, title, author } = options

  const hash = hashString(contentHash)
  const params = hashToParams(hash)
  const pattern = getShaderPattern(params.pattern)

  // For now, return SVG placeholder
  // In production, this would render WebGL and capture canvas
  return generateSvgCover(contentHash, { width, height, title, author, params, pattern })
}

/**
 * Generate SVG cover as fallback/placeholder
 */
function generateSvgCover(
  contentHash: string,
  options: {
    width: number
    height: number
    title?: string
    author?: string
    params: ReturnType<typeof hashToParams>
    pattern: string
  }
): string {
  const { width, height, title, author, params } = options

  const hue = params.hue * 360
  const sat = params.saturation * 100
  const light = params.brightness * 100

  const color1 = `hsl(${hue}, ${sat}%, ${light}%)`
  const color2 = `hsl(${(hue + 60) % 360}, ${sat}%, ${light + 10}%)`
  const color3 = `hsl(${(hue + 120) % 360}, ${sat}%, ${light - 10}%)`

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${color2};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color3};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#grad1)"/>
  ${
    title
      ? `<text x="50%" y="50%" font-family="system-ui, -apple-system, sans-serif" font-size="60" font-weight="bold" fill="white" text-anchor="middle" opacity="0.9">${escapeXml(
          title
        )}</text>`
      : ''
  }
  ${
    author
      ? `<text x="50%" y="60%" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="white" text-anchor="middle" opacity="0.7">by ${escapeXml(
          author
        )}</text>`
      : ''
  }
</svg>
  `.trim()

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
