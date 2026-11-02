// Pequenos ajudantes de DOM para os widgets do Bullet Journal no editor.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Ícones de traço (24×24), no estilo de src/components/icons.tsx. */
const ICONS = {
  pencil: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  star: ["M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"],
  play: ["M4 5h16v12H4z", "M10 9l4 2-4 2z", "M8 21h8"],
  check: ["M5 12l5 5 9-10"],
  refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 5v6h-6"],
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 16, filled = false): SVGSVGElement {
  const svg = svgEl("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    "stroke-width": 1.8,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  });
  for (const d of ICONS[name]) svg.append(svgEl("path", { d }));
  return svg;
}

/** 1234.5 → "1.234,5" */
export const fmtNum = (n: number, digits = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
