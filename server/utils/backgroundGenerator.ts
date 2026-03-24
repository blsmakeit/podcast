/**
 * PCB-inspired SVG background generator for social media cards.
 * Generates deterministic SVGs based on a seed so the same campaign always
 * produces the same background.
 */

type Style = "aurora" | "minimal" | "grid";

interface BgOptions {
  seed?: number;
  style?: Style;
  width?: number;
  height?: number;
}

// Seeded pseudo-random (mulberry32)
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randomChoice<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// ─── Aurora style ──────────────────────────────────────────────────────────
function generateAurora(rand: () => number, w: number, h: number): string {
  const blobs = Array.from({ length: 5 }, (_, i) => {
    const cx = randomInt(rand, 0, w);
    const cy = randomInt(rand, 0, h);
    const rx = randomInt(rand, 120, 400);
    const ry = randomInt(rand, 80, 280);
    const colors = ["#E51937", "#1a1a2e", "#16213e", "#0f3460", "#533483"];
    const color = randomChoice(rand, colors);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${(0.25 + rand() * 0.35).toFixed(2)}"/>`;
  }).join("\n  ");

  // PCB trace lines
  const traces = Array.from({ length: 12 }, () => {
    const x1 = randomInt(rand, 0, w);
    const y1 = randomInt(rand, 0, h);
    const x2 = x1 + randomInt(rand, -200, 200);
    const y2 = y1 + randomInt(rand, -200, 200);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#E51937" stroke-width="1" opacity="0.15"/>`;
  }).join("\n  ");

  // Pads (small circles at trace junctions)
  const pads = Array.from({ length: 8 }, () => {
    const cx = randomInt(rand, 0, w);
    const cy = randomInt(rand, 0, h);
    return `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="#E51937" stroke-width="1.5" opacity="0.25"/>`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="blur"><feGaussianBlur stdDeviation="40"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="#0d0d1a"/>
  <g filter="url(#blur)">
  ${blobs}
  </g>
  ${traces}
  ${pads}
</svg>`;
}

// ─── Minimal style ──────────────────────────────────────────────────────────
function generateMinimal(rand: () => number, w: number, h: number): string {
  // Horizontal + vertical PCB grid lines
  const hLines = Array.from({ length: 8 }, (_, i) => {
    const y = Math.round((i + 1) * h / 9);
    return `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#E51937" stroke-width="0.5" opacity="0.12"/>`;
  }).join("\n  ");

  const vLines = Array.from({ length: 6 }, (_, i) => {
    const x = Math.round((i + 1) * w / 7);
    return `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#E51937" stroke-width="0.5" opacity="0.12"/>`;
  }).join("\n  ");

  // Random accent traces
  const accents = Array.from({ length: 6 }, () => {
    const x1 = randomInt(rand, 0, w);
    const y1 = randomInt(rand, 0, h);
    const len = randomInt(rand, 60, 180);
    const horiz = rand() > 0.5;
    const x2 = horiz ? x1 + len : x1;
    const y2 = horiz ? y1 : y1 + len;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#E51937" stroke-width="1.5" opacity="0.35"/>`;
  }).join("\n  ");

  const pads = Array.from({ length: 10 }, () => {
    const cx = randomInt(rand, 0, w);
    const cy = randomInt(rand, 0, h);
    const r = randomInt(rand, 3, 6);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#E51937" opacity="0.3"/>`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#111111"/>
  ${hLines}
  ${vLines}
  ${accents}
  ${pads}
</svg>`;
}

// ─── Grid style ──────────────────────────────────────────────────────────
function generateGrid(rand: () => number, w: number, h: number): string {
  const spacing = 40;
  const cols = Math.ceil(w / spacing) + 1;
  const rows = Math.ceil(h / spacing) + 1;

  let dots = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * spacing;
      const y = r * spacing;
      dots += `<circle cx="${x}" cy="${y}" r="1.2" fill="#E51937" opacity="0.2"/>`;
    }
  }

  // Random L-shaped traces
  const traces = Array.from({ length: 10 }, () => {
    const x1 = randomInt(rand, 0, cols - 1) * spacing;
    const y1 = randomInt(rand, 0, rows - 1) * spacing;
    const dx = randomInt(rand, 1, 4) * spacing * (rand() > 0.5 ? 1 : -1);
    const dy = randomInt(rand, 1, 4) * spacing * (rand() > 0.5 ? 1 : -1);
    const mx = x1 + dx;
    const my = y1;
    return `<polyline points="${x1},${y1} ${mx},${my} ${mx},${my + dy}" fill="none" stroke="#E51937" stroke-width="1.5" opacity="0.4"/>`;
  }).join("\n  ");

  const pads = Array.from({ length: 8 }, () => {
    const cx = randomInt(rand, 0, cols - 1) * spacing;
    const cy = randomInt(rand, 0, rows - 1) * spacing;
    return `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="#E51937" stroke-width="1.5" opacity="0.5"/>`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#0a0a0a"/>
  ${dots}
  ${traces}
  ${pads}
</svg>`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function generateBackgroundSvg(opts: BgOptions = {}): string {
  const seed = opts.seed ?? 42;
  const style: Style = (opts.style as Style) ?? "aurora";
  const w = opts.width ?? 1200;
  const h = opts.height ?? 630;
  const rand = mulberry32(seed);

  switch (style) {
    case "minimal": return generateMinimal(rand, w, h);
    case "grid":    return generateGrid(rand, w, h);
    default:        return generateAurora(rand, w, h);
  }
}
