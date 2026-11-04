/** WCAG 2.x contrast maths, shared by the checks and the auto-fixer. */

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Parse `rgb(…)`/`rgba(…)` as reported by getComputedStyle into hex. */
export function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Pick the token that reads on `background` at `min` contrast and sits closest to `current`,
 * so a fix changes as little of the design as possible.
 */
export function closestPassingToken(
  tokens: Record<string, string>,
  current: string,
  background: string,
  min = 4.5,
): { name: string; hex: string; ratio: number } | null {
  const target = luminance(current);
  let best: { name: string; hex: string; ratio: number; d: number } | null = null;
  for (const [name, hex] of Object.entries(tokens)) {
    const ratio = contrast(hex, background);
    if (ratio < min) continue;
    const d = Math.abs(luminance(hex) - target);
    if (!best || d < best.d) best = { name, hex, ratio, d };
  }
  return best && { name: best.name, hex: best.hex, ratio: Math.round(best.ratio * 10) / 10 };
}
